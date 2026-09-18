import express from 'express';

const router = express.Router();

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000; // ~4.5MB image
const MAX_QUESTION_LENGTH = 2000;
const MODEL_TIMEOUT_MS = 45_000;

const VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-11b-vision-preview',
];

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
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
        error: `Provider returned invalid JSON (HTTP ${response.status}).`,
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
    const msg = error instanceof Error ? error.message : 'Unknown';
    return { ok: false, status: 0, error: msg };
  }
}

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as { image?: unknown; question?: unknown };

    const imageData =
      typeof body.image === 'string' ? body.image.trim() : '';
    const question = sanitizeQuestion(body.question);

    const imageError = validateImageData(imageData);
    if (imageError) {
      console.error(`[WEURA] Vision validation error: ${imageError}`);
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

    const sizeKB = (imageData.length / 1024).toFixed(0);
    console.log(`[WEURA] Vision request: ${sizeKB} KB, Q: "${question.slice(0, 50)}"`);

    const errors: string[] = [];

    for (const model of VISION_MODELS) {
      console.log(`[WEURA] Vision trying: ${model}`);
      const result = await callVisionModel(model, apiKey, imageData, question);

      if (result.ok && result.content) {
        console.log(`[WEURA] Vision OK with: ${model}`);
        return res.json({
          success: true,
          content: result.content,
          model,
        });
      }

      errors.push(`${model}: ${result.error}`);
      console.warn(`[WEURA] Vision failed with ${model}: ${result.error}`);
    }

    console.error('[WEURA] All vision models failed:', errors);

    // Return the FIRST error to help debugging
    return res.status(502).json({
      success: false,
      error: errors[0] ?? 'Vision failed.',
    });
  } catch (error) {
    console.error('[WEURA] Vision handler error:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Unexpected vision error.',
    });
  }
});

export default router;