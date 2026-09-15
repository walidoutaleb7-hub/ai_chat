import express from 'express';

const router = express.Router();

/// WEURA Vision Service — Groq llama-3.2-90b-vision-preview.
///
/// Accepts a base64 image + a user question and returns the analysis.
/// POST /api/vision
/// Body: { image: "data:image/jpeg;base64,...", question: "..." }

const GROQ_VISION_MODEL = 'llama-3.2-90b-vision-preview';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

type VisionRequest = {
  image?: string;
  question?: string;
};

const SYSTEM_PROMPT = `
You are WEURA Vision — an expert image analyst.

You receive an image and a user's question. Your job is to:

1. If the user asks a specific question, answer it accurately based
   ONLY on what is visible in the image.
2. If no specific question is asked, provide a clear, structured
   analysis:
   • What the image shows (subjects, setting, objects)
   • Notable details (text, colors, composition)
   • Mood / atmosphere
   • Any relevant context
3. If the image contains text (Arabic, English, French, etc.),
   extract it accurately (OCR).
4. If the image contains people, describe them respectfully and
   never make assumptions about identity, religion, or sensitive
   traits.
5. NEVER invent details that cannot be seen.
6. If the image is unclear or you cannot determine something, say so
   honestly.

Match the user's language (Arabic, English, French, dialect, etc.).

Keep the response well-structured with Markdown when helpful.
`;

router.post('/vision', async (req, res) => {
  try {
    const body = req.body as VisionRequest;

    const imageData = String(body.image ?? '').trim();
    const question = String(body.question ?? '').trim() ||
      'Describe this image in detail.';

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'Image is required.',
      });
    }

    // Sanity check: must be a data URL.
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Image must be a base64 data URL.',
      });
    }

    // Payload cap: ~10 MB (approx 13.3M base64 chars).
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

    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
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

    const raw = await groqResponse.text();
    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: 'Vision provider returned invalid data.',
      });
    }

    if (!groqResponse.ok) {
      console.error(
        `[WEURA] Vision error ${groqResponse.status}:`,
        raw.slice(0, 300),
      );

      const providerError =
        data?.error?.message ?? 'Vision request failed.';

      return res.status(groqResponse.status).json({
        success: false,
        error: String(providerError),
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Vision model returned an empty response.',
      });
    }

    return res.json({
      success: true,
      content: content.trim(),
      model: data?.model ?? GROQ_VISION_MODEL,
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
