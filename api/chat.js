// api/chat.js
// WEURA AI — OpenAI Responses API backend
// Features:
// - Normal AI chat
// - Web search
// - Web sources
// - Image understanding
// - Conversation history
// - Local memory ID
// - Rate-limit protection
// - History trimming
// - Safe JSON responses

export default async function handler(req, res) {
    // --------------------------------------------------
    // CORS
    // --------------------------------------------------
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    // OPTIONS
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // POST only
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    // --------------------------------------------------
    // API KEY
    // --------------------------------------------------
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            success: false,
            error: "OPENAI_API_KEY is not configured."
        });
    }

    // --------------------------------------------------
    // MODEL
    // --------------------------------------------------
    const MODEL =
        process.env.OPENAI_MODEL ||
        "gpt-5.6-luna";

    // --------------------------------------------------
    // REQUEST DATA
    // --------------------------------------------------
    const body = req.body || {};

    const message =
        typeof body.message === "string"
            ? body.message.trim()
            : "";

    const memoryId =
        typeof body.memoryId === "string"
            ? body.memoryId.slice(0, 200)
            : null;

    const webSearch =
        body.webSearch === true;

    const memoryEnabled =
        body.memory !== false;

    const history =
        Array.isArray(body.history)
            ? body.history
            : [];

    const image =
        typeof body.image === "string"
            ? body.image
            : null;

    // --------------------------------------------------
    // VALIDATE MESSAGE
    // --------------------------------------------------
    if (!message && !image) {
        return res.status(400).json({
            success: false,
            error: "Message or image is required."
        });
    }

    // --------------------------------------------------
    // IMAGE VALIDATION
    // --------------------------------------------------
    let validImage = null;

    if (image) {
        const imageRegex =
            /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

        if (!imageRegex.test(image)) {
            return res.status(400).json({
                success: false,
                error: "Invalid image format."
            });
        }

        // Prevent enormous payloads
        if (image.length > 12 * 1024 * 1024) {
            return res.status(413).json({
                success: false,
                error: "Image is too large. Please use a smaller image."
            });
        }

        validImage = image;
    }

    // --------------------------------------------------
    // CLEAN / LIMIT HISTORY
    // --------------------------------------------------
    // Keeping huge chat histories is one of the easiest
    // ways to consume TPM very quickly.
    //
    // We keep only the latest messages.
    // --------------------------------------------------

    const MAX_HISTORY_MESSAGES = 12;
    const MAX_MESSAGE_CHARS = 12000;

    const cleanHistory = history
        .filter(item => {
            if (!item || typeof item !== "object") {
                return false;
            }

            const role =
                item.role === "assistant"
                    ? "assistant"
                    : item.role === "user"
                        ? "user"
                        : null;

            return !!role && typeof item.content === "string";
        })
        .slice(-MAX_HISTORY_MESSAGES)
        .map(item => ({
            role: item.role,
            content: item.content
                .slice(0, MAX_MESSAGE_CHARS)
        }));

    // --------------------------------------------------
    // WEURA SYSTEM INSTRUCTIONS
    // --------------------------------------------------

    const SYSTEM_PROMPT = `
أنت WEURA AI، مساعد ذكاء اصطناعي متطور داخل تطبيق WEURA AI.

قواعدك الأساسية:

1. أجب بدقة ووضوح وبأسلوب طبيعي.
2. افهم لغة المستخدم تلقائياً، ويمكنك الرد بالعربية أو الفرنسية أو الإنجليزية حسب لغة المستخدم.
3. إذا كان السؤال يحتاج معلومات حديثة وكان البحث متاحاً، استخدم Web Search.
4. عند استخدام البحث، اعتمد على المصادر التي يعيدها النظام ولا تخترع مصادر.
5. لا تذكر روابط طويلة داخل النص إذا كانت المصادر متاحة بشكل منفصل.
6. لا تقل إنك بحثت في الإنترنت إذا لم يتم استخدام أداة البحث فعلياً.
7. إذا أرسل المستخدم صورة، حلل محتواها قدر الإمكان.
8. لا تدّعي رؤية شيء غير موجود في الصورة.
9. إذا لم تكن متأكداً من معلومة، قل ذلك بوضوح.
10. لا تكرر السؤال الذي طرحه المستخدم دون حاجة.
11. اجعل الإجابات منظمة وسهلة القراءة.
12. عند كتابة الكود، استخدم code blocks مناسبة للغة.
13. لا تستخدم Markdown links داخل الإجابة إذا كان النظام سيعرض المصادر بشكل منفصل.
14. لا تخترع أسماء مواقع أو مصادر أو حقائق.
15. كن مفيداً ومباشراً.

أنت جزء من تطبيق WEURA AI، لذلك حافظ على تجربة مستخدم احترافية وسريعة.
`.trim();

    // --------------------------------------------------
    // BUILD INPUT
    // --------------------------------------------------

    const input = [];

    // Previous conversation
    if (memoryEnabled && cleanHistory.length > 0) {
        for (const item of cleanHistory) {
            input.push({
                role: item.role,
                content: [
                    {
                        type: "input_text",
                        text: item.content
                    }
                ]
            });
        }
    }

    // Current user message
    const currentContent = [];

    if (message) {
        currentContent.push({
            type: "input_text",
            text: message.slice(0, MAX_MESSAGE_CHARS)
        });
    }

    if (validImage) {
        currentContent.push({
            type: "input_image",
            image_url: validImage,
            detail: "auto"
        });
    }

    input.push({
        role: "user",
        content: currentContent
    });

    // --------------------------------------------------
    // OPENAI REQUEST
    // --------------------------------------------------

    const requestBody = {
        model: MODEL,

        instructions: SYSTEM_PROMPT,

        input,

        // Prevent unnecessarily huge answers.
        max_output_tokens: 2048
    };

    // --------------------------------------------------
    // WEB SEARCH
    // --------------------------------------------------

    if (webSearch) {
        requestBody.tools = [
            {
                type: "web_search"
            }
        ];

        requestBody.include = [
            "web_search_call.action.sources"
        ];
    }

    // --------------------------------------------------
    // REQUEST TIMEOUT
    // --------------------------------------------------

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 90000);

    let response;

    try {
        response = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },

                body: JSON.stringify(requestBody),

                signal: controller.signal
            }
        );
    } catch (error) {
        clearTimeout(timeout);

        if (error?.name === "AbortError") {
            return res.status(504).json({
                success: false,
                error: "The AI request timed out. Please try again."
            });
        }

        console.error("WEURA OpenAI connection error:", error);

        return res.status(502).json({
            success: false,
            error: "Could not connect to the AI service."
        });
    }

    clearTimeout(timeout);

    // --------------------------------------------------
    // READ OPENAI RESPONSE
    // --------------------------------------------------

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        console.error("WEURA invalid OpenAI JSON:", error);

        return res.status(502).json({
            success: false,
            error: "Invalid response from AI service."
        });
    }

    // --------------------------------------------------
    // RATE LIMIT
    // --------------------------------------------------

    if (response.status === 429) {
        console.error(
            "WEURA RATE LIMIT:",
            JSON.stringify(data)
        );

        return res.status(429).json({
            success: false,

            error:
                "WEURA AI is temporarily rate-limited. " +
                "Please wait before sending another request.",

            code: "RATE_LIMITED",

            retryAfter:
                response.headers.get("retry-after") || null,

            details:
                data?.error?.message || null
        });
    }

    // --------------------------------------------------
    // OTHER OPENAI ERRORS
    // --------------------------------------------------

    if (!response.ok) {
        console.error(
            "WEURA OpenAI error:",
            JSON.stringify(data)
        );

        const errorMessage =
            data?.error?.message ||
            "The AI service returned an error.";

        return res.status(response.status).json({
            success: false,
            error: errorMessage,
            code:
                data?.error?.code ||
                "OPENAI_ERROR"
        });
    }

    // --------------------------------------------------
    // EXTRACT RESPONSE TEXT
    // --------------------------------------------------

    let reply = "";

    if (typeof data.output_text === "string") {
        reply = data.output_text;
    }

    // Fallback parser
    if (!reply && Array.isArray(data.output)) {
        const parts = [];

        for (const item of data.output) {
            if (!item) continue;

            if (typeof item.text === "string") {
                parts.push(item.text);
            }

            if (Array.isArray(item.content)) {
                for (const content of item.content) {
                    if (
                        content &&
                        typeof content.text === "string"
                    ) {
                        parts.push(content.text);
                    }
                }
            }
        }

        reply = parts.join("\n");
    }

    if (!reply) {
        reply =
            "I couldn't generate a response right now. Please try again.";
    }

    // --------------------------------------------------
    // REMOVE MARKDOWN URL LINKS
    // --------------------------------------------------

    reply = reply.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
        "$1"
    );

    // Remove raw URLs from AI text.
    // Sources will be returned separately.
    reply = reply.replace(
        /https?:\/\/[^\s<>)]+/gi,
        ""
    );

    // Clean excessive blank lines
    reply = reply
        .replace(/\n{4,}/g, "\n\n")
        .trim();

    // --------------------------------------------------
    // EXTRACT SOURCES
    // --------------------------------------------------

    const sources = [];

    function addSource(source) {
        if (!source || typeof source !== "object") {
            return;
        }

        const url =
            typeof source.url === "string"
                ? source.url.trim()
                : "";

        if (!url) {
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            return;
        }

        const title =
            typeof source.title === "string" &&
            source.title.trim()
                ? source.title.trim()
                : url;

        const alreadyExists =
            sources.some(item => item.url === url);

        if (!alreadyExists) {
            sources.push({
                title,
                url
            });
        }
    }

    // --------------------------------------------------
    // Extract web search sources
    // --------------------------------------------------

    if (Array.isArray(data.output)) {
        for (const item of data.output) {
            if (!item) continue;

            // web_search_call
            if (
                item.type === "web_search_call" &&
                item.action
            ) {
                const action = item.action;

                if (Array.isArray(action.sources)) {
                    for (const source of action.sources) {
                        addSource(source);
                    }
                }
            }

            // annotations
            if (Array.isArray(item.annotations)) {
                for (const annotation of item.annotations) {
                    if (
                        annotation &&
                        annotation.type === "url_citation"
                    ) {
                        addSource({
                            url: annotation.url,
                            title:
                                annotation.title ||
                                annotation.url
                        });
                    }
                }
            }

            // nested content
            if (Array.isArray(item.content)) {
                for (const content of item.content) {
                    if (!content) continue;

                    if (Array.isArray(content.annotations)) {
                        for (
                            const annotation
                            of content.annotations
                        ) {
                            if (
                                annotation &&
                                annotation.type ===
                                    "url_citation"
                            ) {
                                addSource({
                                    url: annotation.url,
                                    title:
                                        annotation.title ||
                                        annotation.url
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // --------------------------------------------------
    // Also inspect response-level annotations if present
    // --------------------------------------------------

    if (Array.isArray(data.annotations)) {
        for (const annotation of data.annotations) {
            if (
                annotation &&
                annotation.type === "url_citation"
            ) {
                addSource({
                    url: annotation.url,
                    title:
                        annotation.title ||
                        annotation.url
                });
            }
        }
    }

    // Keep source list reasonable
    const limitedSources = sources.slice(0, 12);

    // --------------------------------------------------
    // MEMORY ID
    // --------------------------------------------------

    const finalMemoryId =
        memoryId ||
        `weura-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;

    // --------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
        success: true,

        reply,

        model: MODEL,

        responseId:
            data.id || null,

        memoryId:
            finalMemoryId,

        memoryEnabled,

        webSearchEnabled:
            webSearch,

        imageAnalyzed:
            !!validImage,

        sources:
            limitedSources
    });
}