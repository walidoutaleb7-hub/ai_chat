import express from 'express';

const router = express.Router();

/// WEURA Vision Service — Groq with model fallback.
///
/// POST /api/vision
/// Body: { image: "data:image/jpeg;base64,...", question: "..." }

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

/// Try these models in order until one works.
const VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];

type VisionRequest = {
  image?: string;
  question?: string;
};

const SYSTEM_PROMPT = `
You are WEURA Vision — an expert image analyst.

You receive an image and a user's question. Your job:

1. If the user asks a specific question, answer it accurately based
   ONLY on what is visible in the image.
2. If no specific question is asked, provide a structured analysis:
   • What the image shows (subjects, setting, objects)
   • Notable details (text, colors, composition)
   • Mood / atmosphere
   • Any relevant context
3. If the image contains text (Arabic, English, French, etc.),
   extract it accurately (OCR).
4. If the image contains people, describe them respectfully. Never
   assume identity, religion, or sensitive traits.
5. NEVER invent details that cannot be seen.
6. If the image is unclear, say so honestly.

Match the user's language (Arabic, English, French, dialect, etc.).
Keep the response well-structured with Markdown when helpful.
`;

async function callVisionModel(
  model: string,
  apiKey: string,
  imageData: string,
  question: string,
): Promise<{ ok: boolean; content?: string; status: number; error?: string }> {
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
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
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
        temperature: 0.4,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(60000),
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
      error: error instanceof Error ? error.message : 'Unknown error.',
    };
  }
}

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as VisionRequest;

    const imageData = String(body.image ?? '').trim();
    const question =
      String(body.question ?? '').trim() ||
      'Describe this image in detail.';

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'Image is required.',
      });
    }

    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Image must be a base64 data URL.',
      });
    }

    if (imageData.length > 14_000_000) {
      return res.status(413).json({
        success: false,
        error: 'Image is too large. Max ~10 MB.',
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
      console.log(`[WEURA] Vision trying model: ${model}`);

      const result = await callVisionModel(
        model,
        apiKey,
        imageData,
        question,
      );

      if (result.ok && result.content) {
        console.log(`[WEURA] Vision success with model: ${model}`);
        return res.json({
          success: true,
          content: result.content,
          model,
        });
      }

      errors.push(`${model}: ${result.error}`);
      console.warn(
        `[WEURA] Vision failed with ${model}: ${result.error}`,
      );
    }

    console.error(
      '[WEURA] All vision models failed:\n' + errors.join('\n'),
    );

    return res.status(502).json({
      success: false,
      error:
        'Vision service is unavailable. ' +
        'The image could not be analyzed.',
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
