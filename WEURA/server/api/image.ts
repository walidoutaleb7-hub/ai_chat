import express from 'express';

const router = express.Router();

/// HuggingFace Inference API — new router endpoint.
/// Endpoint: GET /api/image?prompt=xxx&width=1024&height=1024
const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

function hfUrl(model: string): string {
  return `https://router.huggingface.co/hf-inference/models/${model}`;
}

router.get('/image', async (req, res) => {
  const prompt = String(req.query.prompt ?? '').trim();

  const widthRaw = Number(req.query.width ?? 1024);
  const heightRaw = Number(req.query.height ?? 1024);

  const width = Number.isFinite(widthRaw)
    ? Math.min(Math.max(Math.round(widthRaw), 256), 1024)
    : 1024;

  const height = Number.isFinite(heightRaw)
    ? Math.min(Math.max(Math.round(heightRaw), 256), 1024)
    : 1024;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is required.',
    });
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'Image provider not configured.',
    });
  }

  try {
    const response = await fetch(hfUrl(HF_MODEL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width,
          height,
        },
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const errText = await response.text();

      console.error(
        `[WEURA] HF image error ${response.status}:`,
        errText.slice(0, 300),
      );

      if (response.status === 503) {
        return res.status(503).json({
          success: false,
          error: 'Model is loading. Please try again in 20 seconds.',
          retry: true,
        });
      }

      return res.status(response.status).json({
        success: false,
        error: `Image provider error (${response.status}).`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', String(buffer.length));

    return res.send(buffer);
  } catch (error) {
    console.error('[WEURA] Image generation error:', error);

    return res.status(500).json({
      success: false,
      error: 'Could not generate image.',
    });
  }
});

export default router;
