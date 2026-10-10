import express from 'express';

const router = express.Router();

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000;
const MAX_QUESTION_LENGTH = 2000;
const MODEL_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 800;

const GEMINI_VISION_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const GROQ_VISION_MODELS = ['qwen/qwen3.8-27b'];

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const SYSTEM_PROMPT = `You are WEURA Vision — an expert image analyst.

Match the user's language. Describe only what you actually see.
Never invent details. Extract text accurately (OCR) if present.
Keep the response structured with Markdown when helpful.
Be concise — aim for under 500 words unless the user asks for more.`;

type CallResult = {
  ok: boolean;
  content?: string;
  status: number;
  error?: string;
  retryAfterMs?: number;
  model?: string;
};

function validateImageData(raw: string): string | null {
  if (!raw) return 'Image is required.';
  if (!raw.startsWith('data:image/')) return 'Invalid image format.';

  const match = raw.match(/^data:([^;]+);base64,/);
  if (!match) return 'Invalid base64 data URL.';

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return 'Unsupported image type. Allowed: JPEG, PNG, WebP.';
  }

  if (raw.length > MAX_IMAGE_DATA_URL_LENGTH) {
    const mb = (raw.length / (1024 * 1024)).toFixed(1);
    return `Image is too large (${mb} MB). Maximum ~4 MB.`;
  }

  return null;
}

function sanitizeQuestion(raw: unknown): string {
  if (typeof raw !== 'string') return 'Describe this image in detail.';
  const clean = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, MAX_QUESTION_LENGTH);
  return clean || 'Describe this image in detail.';
}

function parseDataUrl(
  dataUrl: string,
): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

/* ============================================================
 *  GEMINI VISION
 * ============================================================ */

async function callGeminiVision(
  model: string,
  apiKey: string,
  imageData: string,
  question: string,
): Promise<CallResult> {
  try {
    const parsed = parseDataUrl(imageData);
    if (!parsed) {
      return {
        ok: false,
        status: 400,
        error: 'gemini: invalid image data URL.',
      };
    }

    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: question },
            {
              inline_data: {
                mime_type: parsed.mime,
                data: parsed.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });

    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        status: response.status,
        error: `gemini: invalid JSON (HTTP ${response.status}).`,
      };
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        error: `gemini: ${String(providerError)}`,
        retryAfterMs: response.status === 429 ? 15_000 : undefined,
      };
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('') ?? '';

    if (!text || text.trim().length === 0) {
      return {
        ok: false,
        status: response.status,
        error: 'gemini: empty response.',
      };
    }

    return {
      ok: true,
      content: text.trim(),
      status: response.status,
      model: `gemini:${model}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        'gemini: ' +
        (error instanceof Error ? error.message : 'unknown'),
    };
  }
}

/* ============================================================
 *  GROQ VISION
 * ============================================================ */

function isModelUnavailable(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes('does not exist') ||
    e.includes('not have access') ||
    e.includes('model_not_found') ||
    e.includes('model not found') ||
    e.includes('not available') ||
    e.includes('decommissioned') ||
    e.includes('deprecated')
  );
}

function isRateLimit(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes('rate limit') ||
    e.includes('429') ||
    e.includes('too many requests')
  );
}

function extractRetryAfterMs(error: string): number {
  const match = error.match(/try again in ([\d.]+)s/i);
  if (match) {
    const sec = parseFloat(match[1]);
    if (!isNaN(sec) && sec > 0) return Math.ceil(sec * 1000) + 1000;
  }
  return 15_000;
}

async function callGroqVision(
  model: string,
  apiKey: string,
  imageData: string,
  question: string,
): Promise<CallResult> {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });

    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        status: response.status,
        error: `groq: invalid JSON (HTTP ${response.status}).`,
      };
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        error: `groq: ${String(providerError)}`,
        retryAfterMs: isRateLimit(String(providerError))
          ? extractRetryAfterMs(String(providerError))
          : undefined,
      };
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return {
        ok: false,
        status: response.status,
        error: 'groq: empty response.',
      };
    }

    return {
      ok: true,
      content: content.trim(),
      status: response.status,
      model: `groq:${model}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        'groq: ' + (error instanceof Error ? error.message : 'unknown'),
    };
  }
}

/* ============================================================
 *  MAIN ROUTE
 * ============================================================ */

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as { image?: unknown; question?: unknown };

    const imageData =
      typeof body.image === 'string' ? body.image.trim() : '';
    const question = sanitizeQuestion(body.question);

    const imageError = validateImageData(imageData);
    if (imageError) {
      return res
        .status(400)
        .json({ success: false, error: imageError });
    }

    const errors: string[] = [];

    // ─── Gemini primary ─────────────────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      for (const model of GEMINI_VISION_MODELS) {
        const result = await callGeminiVision(
          model,
          geminiKey,
          imageData,
          question,
        );

        if (result.ok && result.content) {
          return res.json({
            success: true,
            content: result.content,
            model: result.model,
            provider: 'gemini',
          });
        }

        const errMsg = result.error ?? 'unknown';
        errors.push(errMsg);
        console.log(
          `[WEURA] Gemini vision "${model}" failed: ${errMsg}`,
        );
      }
    } else {
      errors.push('gemini: GEMINI_API_KEY not configured.');
    }

    // ─── Groq fallback ──────────────────────────────────────
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (groqKey) {
      for (const model of GROQ_VISION_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const result = await callGroqVision(
            model,
            groqKey,
            imageData,
            question,
          );

          if (result.ok && result.content) {
            return res.json({
              success: true,
              content: result.content,
              model: result.model,
              provider: 'groq',
            });
          }

          const errMsg = result.error ?? 'unknown';

          if (isModelUnavailable(errMsg)) {
            console.log(
              `[WEURA] Groq vision "${model}" unavailable, skip.`,
            );
            break;
          }

          if (isRateLimit(errMsg) && attempt === 1) {
            const waitMs = result.retryAfterMs ?? 15_000;
            console.log(
              `[WEURA] Groq vision "${model}" rate-limited. Wait ${waitMs}ms.`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          errors.push(errMsg);
          break;
        }
      }
    } else {
      errors.push('groq: GROQ_API_KEY not configured.');
    }

    return res.status(502).json({
      success: false,
      error: errors.length
        ? errors.join('\n')
        : 'Vision providers unavailable.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Vision error.',
    });
  }
});

export default router;