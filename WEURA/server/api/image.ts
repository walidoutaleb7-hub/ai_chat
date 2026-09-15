import express from 'express';

const router = express.Router();

/// WEURA Image Service
///
/// Uses Pollinations.ai (free, no API key required) with:
///   - server-side proxying (hides the upstream URL from the app)
///   - automatic retry (up to 3 attempts)
///   - 90s timeout per attempt
///   - in-memory cache (10 min) for identical prompts
///
/// Endpoint: GET /api/image?prompt=xxx&width=1024&height=1024

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;

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
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      console.error(
        `[WEURA] Pollinations HTTP ${response.status}`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanity check: a valid PNG/JPEG is at least 1 KB.
    if (buffer.length < 1024) {
      console.error(
        `[WEURA] Pollinations returned a tiny response (${buffer.length} bytes)`,
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

  // Cache hit?
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-WEURA-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  // Try up to MAX_ATTEMPTS times with different seeds on retry.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptSeed = attempt === 1 ? seed : seed + attempt * 7919;

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
      // Cache the successful result.
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

    // Brief backoff before retrying.
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return res.status(502).json({
    success: false,
    error: 'Image service is busy. Please try again in a few seconds.',
  });
});

/// Health check for the image service (used by /health if needed).
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
