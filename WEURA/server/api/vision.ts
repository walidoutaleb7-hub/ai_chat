import express from 'express';

const router = express.Router();

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

/* ============================================================
 *  CONSTANTS
 * ============================================================ */

/// Groq image limit is 4MB. Base64 inflates ~33%.
/// 4MB image → ~5.4MB base64. We allow up to 8MB total to be safe.
const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;

const MAX_QUESTION_LENGTH = 2000;
const MODEL_TIMEOUT_MS = 90_000;

const VISION_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/* ============================================================
 *  SYSTEM PROMPT
 * ============================================================ */

const SYSTEM_PROMPT = `You are WEURA Vision — an expert image analyst.

You receive an image and a user's question. Your job:

1. If the user asks a specific question, answer it accurately based ONLY on what is visible in the image.
2. If no specific question is asked, provide a structured analysis:
   • What the image shows (subjects, setting, objects)
   • Notable details (text, colors, composition)
   • Mood / atmosphere
   • Any relevant context
3. If the image contains text (Arabic, English, French, etc.), extract it accurately (OCR).
4. If the image contains people, describe them respectfully. Never assume identity, religion, or sensitive traits.
5. NEVER invent details that cannot be seen.
6. If the image is unclear, say so honestly.

Match the user's language (Arabic, English, French, dialect, etc.).
Keep the response well-structured with Markdown when helpful.`;

/* ============================================================
 *  TYPES
 * ============================================================ */

type VisionRequest = {
  image?: unknown;
  question?: unknown;
};

type CallResult = {
  ok: boolean;
  content?: string;
  status: number;
  error?: string;
};

/* ============================================================
 *  VALIDATION
 * ============================================================ */

function validateImageData(raw: string): string | null {
  if (!raw) return 'Image is required.';

  if (!raw.startsWith('data:image/')) {
    return 'Image must be a base64 data URL.';
  }

  const match = raw.match(/^data:([^;]+);base64,/);
  if (!match) {
    return 'Invalid image format.';
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return 'Unsupported image type. Allowed: JPEG, PNG, WebP, GIF.';
  }

  if (raw.length > MAX_IMAGE_DATA_URL_LENGTH) {
    const mb = (raw.length / (1024 * 1024)).toFixed(1);
    return `Image is too large (${mb} MB). Maximum ~6 MB.`;
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

/* ============================================================
 *  GROQ CALL
 * ============================================================ */

async function callVisionModel(
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
              {
                type: 'image_url',
                image_url: { url: imageData },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
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
        error: 'Invalid JSON from provider.',
      };
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        error: String(providerError),
      };
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return {
        ok: false,
        status: response.status,
        error: 'Empty response from vision model.',
      };
    }

    return {
      ok: true,
      content: content.trim(),
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error instanceof Error ? error.message : 'Unknown error.',
    };
  }
}

/* ============================================================
 *  ROUTE
 * ============================================================ */

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as VisionRequest;

    const imageData =
      typeof body.image === 'string' ? body.image.trim() : '';
    const question = sanitizeQuestion(body.question);

    const imageError = validateImageData(imageData);
    if (imageError) {
      return res.status(400).json({
        success: false,
        error: imageError,
      });
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'Vision provider is not configured.',
      });
    }

    const errors: string[] = [];

    for (const model of VISION_MODELS) {
      const result = await callVisionModel(
        model,
        apiKey,
        imageData,
        question,
      );

      if (result.ok && result.content) {
        return res.json({
          success: true,
          content: result.content,
          model,
        });
      }

      errors.push(`${model}: ${result.error}`);
    }

    console.error('[WEURA] All vision models failed:', errors);

    return res.status(502).json({
      success: false,
      error:
        'Vision service is unavailable. ' +
        'The image could not be analyzed. Please try again.',
    });
  } catch (error) {
    console.error('[WEURA] Vision handler error:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unexpected vision error.',
    });
  }
});

export default router;