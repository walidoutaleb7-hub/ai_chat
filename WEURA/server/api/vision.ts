import express from 'express';

const router = express.Router();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000;
const MAX_QUESTION_LENGTH = 2000;
const MODEL_TIMEOUT_MS = 45_000;

/**
 * Keep max_tokens LOW.
 *
 * Groq free tier: 1000 OTPM (output tokens per minute) for qwen3.8.
 * A vision request with max_tokens 1500 would fail with 429.
 * 500 tokens is enough for a detailed image description and stays
 * well under the limit.
 */
const MAX_OUTPUT_TOKENS = 500;

/**
 * Only qwen3.8-27b is available on this Groq account.
 * (llama-4-*, llama-3.2-vision, qwen3.6-27b → all unavailable)
 */
const VISION_MODELS = [
  'qwen/qwen3.8-27b',
];

function getVisionModels(): string[] {
  const custom = process.env.GROQ_VISION_MODEL?.trim();
  if (custom) {
    return [custom, ...VISION_MODELS.filter((m) => m !== custom)];
  }
  return VISION_MODELS;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
]);

const SYSTEM_PROMPT = `You are WEURA Vision — an expert image analyst.

Match the user's language. Describe only what you actually see.
Never invent details. Extract text accurately (OCR) if present.
Keep the response structured with Markdown when helpful.
Be concise — aim for under 400 words unless the user asks for more.`;

type CallResult = {
  ok: boolean;
  content?: string;
  status: number;
  error?: string;
  retryAfterMs?: number;
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

/**
 * Extracts "try again in X.XXs" from a Groq 429 message.
 */
function extractRetryAfterMs(error: string): number {
  const match = error.match(/try again in ([\d.]+)s/i);
  if (match) {
    const sec = parseFloat(match[1]);
    if (!isNaN(sec) && sec > 0) {
      return Math.ceil(sec * 1000) + 1000; // +1s buffer
    }
  }
  return 15_000; // default 15s
}

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
        error: `Invalid JSON (HTTP ${response.status}).`,
      };
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        error: String(providerError),
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
        error: 'Empty response from vision model.',
      };
    }

    return { ok: true, content: content.trim(), status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown',
    };
  }
}

/* ============================================================
 *  DEBUG — list which vision models are available
 * ============================================================ */

const TINY_PNG_32 =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA' +
  'vklEQVR4AcXBsW2FMBiF0Y8r3GQb6jeBxRauYRpo4yGQkM' +
  'd4A7kg7Z/GUfSKe8703fKDkTATZsJsrr0RlZSJ9r4RLayMvLmJjnQ' +
  'S1d6IhJkwE2bT13U/DBzp5BN73xgRZsJMmM1HOolqb/yWiWpvjJSU' +
  'iRZWopIykTATZsJs5g+1N6KSMiO1N/5DmAkzYTa9Lh6MhJkwE2ZzS' +
  'Zlo7xvRwson3txERzqJhJkwE2bT6+Lh/wcjYSbM5Jk6bwEAAAAA' +
  'SUVORK5CYII=';

router.get('/vision/models', async (_req, res) => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'GROQ_API_KEY is not configured.',
    });
  }

  const models = getVisionModels();
  const results: Array<{
    model: string;
    ok: boolean;
    status: number;
    error?: string;
  }> = [];

  for (const model of models) {
    const result = await callVisionModel(
      model,
      apiKey,
      TINY_PNG_32,
      'Describe this image.',
    );

    results.push({
      model,
      ok: result.ok,
      status: result.status,
      error: result.ok ? undefined : result.error,
    });
  }

  return res.json({
    success: true,
    total: models.length,
    working: results.filter((r) => r.ok).length,
    results,
  });
});

/* ============================================================
 *  MAIN VISION ROUTE
 * ============================================================ */

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as { image?: unknown; question?: unknown };

    const imageData =
      typeof body.image === 'string' ? body.image.trim() : '';
    const question = sanitizeQuestion(body.question);

    const imageError = validateImageData(imageData);
    if (imageError) {
      return res.status(400).json({ success: false, error: imageError });
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'Vision provider is not configured.',
      });
    }

    const models = getVisionModels();
    const errors: string[] = [];

    for (const model of models) {
      // Try up to 2 times per model (second try only on rate limit).
      for (let attempt = 1; attempt <= 2; attempt++) {
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

        const errMsg = result.error ?? 'unknown error';

        // Model missing → skip silently.
        if (isModelUnavailable(errMsg)) {
          console.log(
            `[WEURA] Vision model "${model}" unavailable, skipping.`,
          );
          break; // move to next model
        }

        // Rate limit → wait and retry once.
        if (isRateLimit(errMsg) && attempt === 1) {
          const waitMs = result.retryAfterMs ?? 15_000;
          console.log(
            `[WEURA] Vision "${model}" rate-limited. Waiting ${waitMs}ms then retry.`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Real error → record and move to next model.
        errors.push(`${model}: ${errMsg}`);
        break;
      }
    }

    return res.status(502).json({
      success: false,
      error: errors.length
        ? errors.join('\n')
        : 'Vision model unavailable.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Vision error.',
    });
  }
});

export default router;