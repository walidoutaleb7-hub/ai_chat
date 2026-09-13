"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const Groq = require("groq-sdk");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

const app = express();

const PORT = Number(process.env.PORT || 3000);

const CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL ||
  "llama-3.3-70b-versatile";

const VISION_MODEL =
  process.env.GROQ_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

const groq = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY
    })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

/* =========================
   MIDDLEWARE
========================= */

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

app.use(express.static(__dirname));

/* =========================
   WEURA MODES
========================= */

const MODES = {
  auto: {
    label: "Auto",
    instruction:
      "Automatically choose the best reasoning and response style."
  },

  smart: {
    label: "Smart",
    instruction:
      "Be highly capable, balanced, accurate and practical."
  },

  research: {
    label: "Research",
    instruction:
      "Reason carefully, organize evidence, distinguish facts from uncertainty and prioritize reliable information."
  },

  code: {
    label: "Code",
    instruction:
      "Act as a senior software engineer. Produce clean, maintainable and runnable code."
  },

  creative: {
    label: "Creative",
    instruction:
      "Be creative, original and imaginative while remaining coherent and useful."
  },

  vision: {
    label: "Vision",
    instruction:
      "Focus on understanding visual information carefully and clearly state uncertainty."
  },

  fast: {
    label: "Fast",
    instruction:
      "Answer quickly and concisely while preserving important accuracy."
  }
};

/* =========================
   WEURA SYSTEM PROMPT
========================= */

const BASE_SYSTEM = `
You are WEURA AI — "Think Beyond."

Developer:
Walid Out — وليد

You are a professional, intelligent, friendly and futuristic AI assistant.

Languages:
- Arabic
- Algerian Darija
- French
- English

Automatically respond in the user's language unless they request another language.

Automatically adapt RTL/LTR naturally.

Core principles:
- Be truthful.
- Never invent information.
- Never claim to have performed an action you did not perform.
- Clearly state uncertainty when necessary.
- Protect private information.
- Never expose API keys or secrets.
- Give practical and useful answers.
- For programming requests, provide complete and maintainable solutions.
- Preserve existing project architecture when possible.

You are WEURA AI, not ChatGPT and not v0.
`;

/* =========================
   HELPERS
========================= */

function cleanMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      message =>
        message &&
        ["user", "assistant", "system"].includes(
          message.role
        )
    )
    .map(message => ({
      role: message.role,

      content:
        typeof message.content === "string"
          ? message.content.slice(0, 30000)
          : String(message.content ?? "")
    }))
    .slice(-30);
}

function buildSystem({
  mode = "smart",
  language = "auto",
  memory = []
} = {}) {
  const selectedMode =
    MODES[mode] || MODES.smart;

  let memoryText = "";

  if (
    Array.isArray(memory) &&
    memory.length
  ) {
    memoryText = `
Relevant user memory supplied by the application:

${memory
  .slice(0, 30)
  .map(item => `- ${String(item).slice(0, 500)}`)
  .join("\n")}
`;
  }

  return `
${BASE_SYSTEM}

Current mode:
${selectedMode.label}

Mode instructions:
${selectedMode.instruction}

Language:
${language}

${memoryText}
`;
}

async function askGroq(
  messages,
  options = {}
) {
  if (!groq) {
    const error = new Error(
      "GROQ_API_KEY is not configured."
    );

    error.code = "NO_GROQ_KEY";

    throw error;
  }

  const response =
    await groq.chat.completions.create({
      model:
        options.model || CHAT_MODEL,

      messages,

      temperature:
        options.temperature ?? 0.35,

      max_tokens:
        options.max_tokens ?? 4096
    });

  return (
    response.choices?.[0]?.message?.content ||
    ""
  );
}

/* =========================
   FILE EXTRACTION
========================= */

async function extractText(file) {
  const name =
    (file.originalname || "").toLowerCase();

  const type =
    file.mimetype || "";

  if (
    type.startsWith("text/") ||
    /\.(txt|md|csv|json|js|ts|html|css|xml|yml|yaml|py|java|c|cpp|sql)$/i.test(
      name
    )
  ) {
    return file.buffer
      .toString("utf8")
      .slice(0, 50000);
  }

  if (
    /\.pdf$/i.test(name) ||
    type === "application/pdf"
  ) {
    const result =
      await pdfParse(file.buffer);

    return result.text.slice(0, 50000);
  }

  if (
    /\.docx$/i.test(name) ||
    type.includes("wordprocessingml")
  ) {
    const result =
      await mammoth.extractRawText({
        buffer: file.buffer
      });

    return result.value.slice(0, 50000);
  }

  if (
    /\.xlsx?$/i.test(name) ||
    type.includes("spreadsheet")
  ) {
    const workbook =
      XLSX.read(file.buffer, {
        type: "buffer"
      });

    return workbook.SheetNames
      .map(sheet => {
        return `### ${sheet}\n${XLSX.utils.sheet_to_csv(
          workbook.Sheets[sheet]
        )}`;
      })
      .join("\n")
      .slice(0, 50000);
  }

  return null;
}

/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,

      service: "WEURA AI",

      version: "2.0.0",

      groq: Boolean(groq),

      search: Boolean(
        process.env.TAVILY_API_KEY
      ),

      time: new Date().toISOString()
    });
  }
);

/* =========================
   CONFIG
========================= */

app.get(
  "/api/config",
  (req, res) => {
    res.json({
      ok: true,

      modes: MODES,

      features: {
        chat: true,
        vision: true,
        file: true,
        search: Boolean(
          process.env.TAVILY_API_KEY
        ),
        memory: true
      }
    });
  }
);

/* =========================
   CHAT
========================= */

app.post(
  "/api/chat",
  async (req, res) => {
    try {
      const {
        messages,
        mode = "smart",
        language = "auto",
        memory = [],
        webResults = []
      } = req.body || {};

      let system =
        buildSystem({
          mode,
          language,
          memory
        });

      if (
        Array.isArray(webResults) &&
        webResults.length
      ) {
        system += `

Web search context supplied by WEURA:

${webResults
  .slice(0, 8)
  .map(
    result =>
      `- ${result.title || ""}
${result.url || ""}
${result.content || ""}`
  )
  .join("\n")}
`;
      }

      const answer =
        await askGroq([
          {
            role: "system",
            content: system
          },

          ...cleanMessages(messages)
        ]);

      res.json({
        ok: true,
        answer,
        model: CHAT_MODEL,
        mode
      });

    } catch (error) {
      console.error(
        "CHAT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error.code ===
          "NO_GROQ_KEY"
            ? "GROQ_API_KEY is missing on the server."
            : error.message ||
              "Chat failed."
      });
    }
  }
);

/* =========================
   VISION
========================= */

app.post(
  "/api/vision",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No image uploaded."
        });
      }

      if (!groq) {
        return res.status(500).json({
          ok: false,
          error:
            "GROQ_API_KEY is missing on the server."
        });
      }

      const prompt =
        req.body.prompt ||
        "Analyze this image carefully and describe the useful information visible in it.";

      const dataUrl =
        `data:${req.file.mimetype};base64,` +
        req.file.buffer.toString(
          "base64"
        );

      const response =
        await groq.chat.completions.create({
          model: VISION_MODEL,

          messages: [
            {
              role: "user",

              content: [
                {
                  type: "text",
                  text: prompt
                },

                {
                  type: "image_url",

                  image_url: {
                    url: dataUrl
                  }
                }
              ]
            }
          ],

          temperature: 0.2,

          max_tokens: 4096
        });

      res.json({
        ok: true,

        answer:
          response.choices?.[0]
            ?.message?.content || "",

        model: VISION_MODEL
      });

    } catch (error) {
      console.error(
        "VISION ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Vision failed."
      });
    }
  }
);

/* =========================
   FILE ANALYSIS
========================= */

app.post(
  "/api/file",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No file uploaded."
        });
      }

      const text =
        await extractText(req.file);

      if (text === null) {
        return res.json({
          ok: true,

          filename:
            req.file.originalname,

          text: "",

          supported: false,

          answer:
            "This file type is not directly supported yet."
        });
      }

      const prompt =
        req.body.prompt ||
        "Analyze this file, summarize its important content and identify useful insights.";

      const answer =
        await askGroq([
          {
            role: "system",

            content:
              buildSystem({
                mode: "smart"
              })
          },

          {
            role: "user",

            content:
              `${prompt}

File:
${req.file.originalname}

Content:
${text}`
          }
        ]);

      res.json({
        ok: true,

        filename:
          req.file.originalname,

        text,

        supported: true,

        answer
      });

    } catch (error) {
      console.error(
        "FILE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error.message ||
          "File analysis failed."
      });
    }
  }
);

/* =========================
   SEARCH
========================= */

app.post(
  "/api/search",
  async (req, res) => {
    try {
      if (!process.env.TAVILY_API_KEY) {
        return res.status(503).json({
          ok: false,
          error:
            "TAVILY_API_KEY is not configured."
        });
      }

      const query =
        String(
          req.body?.query || ""
        ).trim();

      if (!query) {
        return res.status(400).json({
          ok: false,
          error:
            "Search query is required."
        });
      }

      const response =
        await fetch(
          "https://api.tavily.com/search",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              api_key:
                process.env.TAVILY_API_KEY,

              query,

              search_depth:
                "advanced",

              max_results: 8,

              include_answer: true
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          "Search provider failed."
        );
      }

      res.json({
        ok: true,

        answer:
          data.answer || "",

        results:
          data.results || []
      });

    } catch (error) {
      console.error(
        "SEARCH ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error.message ||
          "Search failed."
      });
    }
  }
);

/* =========================
   MEMORY
========================= */

app.post(
  "/api/memory",
  async (req, res) => {
    try {
      const {
        text,
        action = "classify"
      } = req.body || {};

      if (action === "classify") {
        if (!text) {
          return res.json({
            ok: true,
            save: false,
            reason: "empty"
          });
        }

        const result =
          await askGroq([
            {
              role: "system",

              content: `
Classify whether the user's statement contains useful long-term memory.

Useful memory can include:
- stable preferences
- project facts
- workflow preferences
- long-term goals

Reply ONLY with valid JSON:

{
  "save": true,
  "memory": "short memory"
}

or

{
  "save": false,
  "memory": ""
}
`
            },

            {
              role: "user",

              content:
                String(text).slice(
                  0,
                  4000
                )
            }
          ], {
            max_tokens: 300
          });

        let parsed = {
          save: false,
          memory: ""
        };

        try {
          parsed =
            JSON.parse(
              result
                .replace(
                  /```json|```/g,
                  ""
                )
                .trim()
            );
        } catch {}

        return res.json({
          ok: true,
          ...parsed
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {
      console.error(
        "MEMORY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error.message ||
          "Memory failed."
      });
    }
  }
);

/* =========================
   SPA FALLBACK
========================= */

app.get(
  "*",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/* =========================
   START
========================= */

app.listen(
  PORT,
  () => {
    console.log(
      `WEURA AI running on http://localhost:${PORT}`
    );
  }
);