import express from 'express';

const router = express.Router();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000;
const MAX_QUESTION_LENGTH = 2000;
const MODEL_TIMEOUT_MS = 45_000;

/**
 * Vision models — ordered by availability on Groq free tier.
 *
 * If a model returns "does not exist", we silently skip it.
 * The list is intentionally broad so at least one should work.
 */
const VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];

/**
 * Optional override via environment variable:
 *   GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
 *
 * If set, it's tried FIRST before the fallback list.
 */
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
Keep the response structured with Markdown when helpful.`;

type CallResult = {
  ok: boolean;
  content?: string;
  status: number;
  error?: string;
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

/**
 * Returns true if the error means "this model is not available".
 * In that case we skip silently instead of reporting it as failure.
 */
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

router.get('/vision/models', async (_req, res) => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'GROQ_API_KEY is not configured.',
    });
  }

  // Tiny 1x1 transparent PNG for testing.
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
      tinyPng,
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
    let unavailableCount = 0;

    for (const model of models) {
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

      // If the model is just unavailable, skip silently.
      if (isModelUnavailable(errMsg)) {
        unavailableCount++;
        console.log(
          `[WEURA] Vision model "${model}" unavailable, skipping.`,
        );
        continue;
      }

      errors.push(`${model}: ${errMsg}`);
    }

    // All models are unavailable → tell the user clearly.
    if (unavailableCount === models.length) {
      return res.status(503).json({
        success: false,
        error:
          'No vision model is available on your Groq account. ' +
          'Check https://console.groq.com/docs/models for available models, ' +
          'or set GROQ_VISION_MODEL env var to a valid model.',
        available: false,
      });
    }

    // Some models failed for real reasons → report all.
    return res.status(502).json({
      success: false,
      error: errors.join('\n'),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Vision error.',
    });
  }
});

export default router;