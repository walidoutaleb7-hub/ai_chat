import express from 'express';

const router = express.Router();

/// WEURA Image Service
///
/// Server-side proxy to Pollinations.ai with retry + cache.
/// Sized to stay under Render's 100s request timeout.
///
/// Endpoint: GET /api/image?prompt=xxx&width=1024&height=1024

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

// IMPORTANT: keep total time under Render's ~100s limit.
const PER_ATTEMPT_TIMEOUT_MS = 35_000;
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 800;

function buildPollinationsUrl(
  prompt: string,
  width: number,
  height: number,
  seed: number,
): string {
  const encoded = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: 'flux',
    nologo: 'true',
    enhance: 'false',
  });
  return `https://image.pollinations.ai/prompt/${encoded}?${params}`;
}

async function fetchImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'image/*',
        'User-Agent': 'WEURA/1.0',
      },
      signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[WEURA] Pollinations HTTP ${response.status}`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 1024) {
      console.error(
        `[WEURA] Pollinations tiny response (${buffer.length} bytes)`,
      );
      return null;
    }

    const contentType =
      response.headers.get('content-type') ?? 'image/png';

    return { buffer, contentType };
  } catch (error) {
    console.error('[WEURA] Pollinations fetch failed:', error);
    return null;
  }
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

  const seedRaw = Number(req.query.seed ?? Date.now() % 999983);
  const seed = Number.isFinite(seedRaw) ? Math.floor(seedRaw) : 12345;

  const cacheKey = `${prompt}|${width}|${height}|${seed}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-WEURA-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptSeed =
      attempt === 1 ? seed : seed + attempt * 7919;

    const url = buildPollinationsUrl(
      prompt,
      width,
      height,
      attemptSeed,
    );

    console.log(
      `[WEURA] Image attempt ${attempt}/${MAX_ATTEMPTS} — seed=${attemptSeed}`,
    );

    const result = await fetchImage(url);

    if (result) {
      cache.set(cacheKey, {
        buffer: result.buffer,
        contentType: result.contentType,
        expiresAt: now + CACHE_TTL_MS,
      });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Length', String(result.buffer.length));
      res.setHeader('X-WEURA-Cache', 'MISS');
      res.setHeader('X-WEURA-Attempt', String(attempt));

      return res.send(result.buffer);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS));
    }
  }

  return res.status(502).json({
    success: false,
    error:
      'Image service is busy. Please try again in a few seconds.',
  });
});

router.get('/image/ping', async (_req, res) => {
  try {
    const url = buildPollinationsUrl('test', 256, 256, 1);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(15000),
    });
    return res.json({
      success: response.ok,
      status: response.status,
    });
  } catch {
    return res.json({ success: false, status: 0 });
  }
});

export default router;
