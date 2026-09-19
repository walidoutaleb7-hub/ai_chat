import express from 'express';

const router = express.Router();

/* ============================================================
 *  TYPES & CACHES
 * ============================================================ */

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};
type RejectEntry = { expiresAt: number };

const cache = new Map<string, CacheEntry>();
const rejectedCache = new Map<string, RejectEntry>();

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
const REJECT_TTL_MS = 30 * 60 * 1000;
const REJECT_MAX_ENTRIES = 200;

function pruneCaches(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  for (const [key, entry] of rejectedCache.entries()) {
    if (entry.expiresAt <= now) rejectedCache.delete(key);
  }
  if (cache.size > CACHE_MAX_ENTRIES) {
    const overflow = cache.size - CACHE_MAX_ENTRIES;
    let removed = 0;
    for (const key of cache.keys()) {
      if (removed >= overflow) break;
      cache.delete(key);
      removed++;
    }
  }
  if (rejectedCache.size > REJECT_MAX_ENTRIES) {
    const overflow = rejectedCache.size - REJECT_MAX_ENTRIES;
    let removed = 0;
    for (const key of rejectedCache.keys()) {
      if (removed >= overflow) break;
      rejectedCache.delete(key);
      removed++;
    }
  }
}

setInterval(pruneCaches, 5 * 60 * 1000).unref();

/* ============================================================
 *  CONSTANTS
 * ============================================================ */

const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const PER_ATTEMPT_TIMEOUT_MS = 40_000;
const MAX_ATTEMPTS = 2;
const MAX_PROMPT_LENGTH = 1500;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL = 'qwen/qwen3.8-27b';
const VISION_TIMEOUT_MS = 30_000;
const VISION_MAX_TOKENS = 500;

const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000;

/* ============================================================
 *  SAFETY — HARD REJECT PATTERNS
 * ============================================================ */

/**
 * Arabic patterns use manual boundaries because \b doesn't work
 * with Arabic letters (they are not word chars in JS regex).
 */
const HARD_REJECT_PATTERNS: RegExp[] = [
  // Arabic (manual boundaries)
  /(?:^|[^\u0600-\u06FF])(عارية|عاري|عريان|مكشوف|جنسي|إباحي|اباحي|نود|بورن)(?:$|[^\u0600-\u06FF])/i,
  /(?:^|[^\u0600-\u06FF])(جثة|دماء|قتل|ذبح|تعذيب|إرهاب|ارهاب)(?:$|[^\u0600-\u06FF])/i,
  // English
  /\b(nude|naked|nsfw|porn|sexual|erotic|explicit)\b/i,
  /\b(gore|beheading|torture|terrorist|murder)\b/i,
];

function hardReject(prompt: string): boolean {
  for (const pattern of HARD_REJECT_PATTERNS) {
    if (pattern.test(prompt)) return true;
  }
  return false;
}

/* ============================================================
 *  PROMPT ENHANCER (Groq)
 * ============================================================ */

const SYSTEM_PROMPT = `You are WEURA's image prompt engineer. Translate the user's request (ANY language) to ONE clean English prompt for FLUX.

RULES:
1. Translate everything to English.
2. For fictional characters (Batman, Spider-Man, Naruto...), describe them accurately with their ICONIC costume, colors, symbols.
3. For real athletes: describe respectfully in sports context (no real face).
4. ALWAYS append: "ultra detailed, 8k, sharp focus, cinematic lighting, masterpiece, professional color grading".

SAFETY - output EXACTLY "REJECT" alone if the request asks for:
- sexual/nude content of ANY person
- sexual content involving minors (ALWAYS)
- graphic violence, gore
- hate symbols, terrorism, religion targeting
- ANY religious reference

Output ONLY the final English prompt (or "REJECT").`;

type EnhancedPrompt = { ok: boolean; prompt?: string; error?: string };

async function enhancePrompt(userPrompt: string): Promise<EnhancedPrompt> {
  if (hardReject(userPrompt)) {
    return { ok: false, error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.' };
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { ok: true, prompt: userPrompt };

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
        tools: [],
        tool_choice: 'none',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return { ok: true, prompt: userPrompt };

    const data: any = await response.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();

    if (!content) return { ok: true, prompt: userPrompt };

    if (/^reject\b/i.test(content.trim())) {
      return { ok: false, error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.' };
    }

    const cleaned = content
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return { ok: true, prompt: userPrompt };

    return { ok: true, prompt: cleaned.slice(0, MAX_PROMPT_LENGTH) };
  } catch {
    return { ok: true, prompt: userPrompt };
  }
}

/* ============================================================
 *  FLUX — IMAGE GENERATION
 * ============================================================ */

async function fetchImage(
  prompt: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${accountId}/ai/run/${CF_MODEL}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ prompt, steps: 4 }),
      signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentType =
      response.headers.get('content-type') ?? 'application/json';

    if (contentType.includes('application/json')) {
      const data: any = await response.json();
      if (data?.success === false) return null;
      const base64 = data?.result?.image;
      if (typeof base64 !== 'string' || base64.length === 0) return null;
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length < 1024) return null;
      return { buffer, contentType: 'image/jpeg' };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1024) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/* ============================================================
 *  VISION — DESCRIBE IMAGE (for edit feature)
 * ============================================================ */

const DESCRIBE_SYSTEM_PROMPT = `You are WEURA's image describer.

Describe the image in English as a detailed FLUX prompt.
Include:
- subject (person/object/scene)
- appearance: face features, hair, clothing, colors, expressions
- pose / action
- background / setting
- lighting, style, mood, art style

Be concise but specific (max 150 words).
Output ONLY the English description. No preamble, no quotes, no markdown.`;

async function describeImage(imageData: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image.' },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: VISION_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      console.error(
        `[WEURA] describeImage failed (HTTP ${response.status}):`,
        raw.slice(0, 200),
      );
      return null;
    }

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    return content || null;
  } catch (error) {
    console.error('[WEURA] describeImage error:', error);
    return null;
  }
}

/* ============================================================
 *  ROUTE — GENERATE IMAGE
 * ============================================================ */

router.get('/image', async (req, res) => {
  const rawPrompt = String(req.query.prompt ?? '').trim();
  const rawSeed = String(req.query.seed ?? '').trim();
  const seed = rawSeed ? parseInt(rawSeed, 10) : undefined;
  const hasSeed = seed !== undefined && !Number.isNaN(seed);

  if (!rawPrompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required.' });
  }

  if (rawPrompt.length > MAX_PROMPT_LENGTH * 2) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is too long. Maximum 3000 characters.',
    });
  }

  const rejectKey = rawPrompt.toLowerCase();
  const rejected = rejectedCache.get(rejectKey);
  if (rejected && rejected.expiresAt > Date.now()) {
    return res.status(400).json({
      success: false,
      error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.',
    });
  }

  const enhanced = await enhancePrompt(rawPrompt);
  if (!enhanced.ok || !enhanced.prompt) {
    rejectedCache.set(rejectKey, { expiresAt: Date.now() + REJECT_TTL_MS });
    return res.status(400).json({
      success: false,
      error: enhanced.error ?? 'Cannot generate this image.',
    });
  }

  const prompt = enhanced.prompt;
  const cacheKey = prompt;
  const now = Date.now();

  // ─── Seed mode: bypass cache, always generate fresh ────────
  // A seed indicates a "regenerate" request. We skip the cache
  // entirely so the user gets a genuinely new image every time.
  if (hasSeed) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await fetchImage(prompt);

      if (result) {
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Length', String(result.buffer.length));
        res.setHeader('X-WEURA-Cache', 'BYPASS');
        res.setHeader('X-WEURA-Seed', String(seed));
        res.setHeader('X-WEURA-Attempt', String(attempt));
        return res.send(result.buffer);
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) =>
          setTimeout(r, 1000 * Math.pow(2, attempt - 1)),
        );
      }
    }

    return res.status(502).json({
      success: false,
      error: 'Image service is busy. Please try again.',
    });
  }

  // ─── Normal mode: cache lookup, then generate ──────────────
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-WEURA-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await fetchImage(prompt);

    if (result) {
      cache.set(cacheKey, {
        buffer: result.buffer,
        contentType: result.contentType,
        expiresAt: now + CACHE_TTL_MS,
      });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('Content-Length', String(result.buffer.length));
      res.setHeader('X-WEURA-Cache', 'MISS');
      res.setHeader('X-WEURA-Attempt', String(attempt));
      return res.send(result.buffer);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  return res.status(502).json({
    success: false,
    error: 'Image service is busy. Please try again.',
  });
});

/* ============================================================
 *  ROUTE — EDIT IMAGE (describe → FLUX regenerate)
 * ============================================================ */

router.post('/image/edit', async (req, res) => {
  try {
    const body = req.body as { image?: unknown; prompt?: unknown };

    const imageData =
      typeof body.image === 'string' ? body.image.trim() : '';
    const editPrompt =
      typeof body.prompt === 'string' ? body.prompt.trim() : '';

    // ─── Validation ─────────────────────────────────────────
    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'Image is required.',
      });
    }

    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Expected a data URL.',
      });
    }

    if (imageData.length > MAX_IMAGE_DATA_URL_LENGTH) {
      const mb = (imageData.length / (1024 * 1024)).toFixed(1);
      return res.status(413).json({
        success: false,
        error: `Image is too large (${mb} MB). Maximum ~4 MB.`,
      });
    }

    if (!editPrompt) {
      return res.status(400).json({
        success: false,
        error: 'Edit instruction is required.',
      });
    }

    if (editPrompt.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Edit instruction is too long (max 500 chars).',
      });
    }

    // ─── Safety check on the edit instruction itself ────────
    if (hardReject(editPrompt)) {
      return res.status(400).json({
        success: false,
        error: 'لا يمكنني تعديل الصورة بهذا الشكل. جرّب طلباً آخر.',
      });
    }

    // ─── Step 1: describe the image ─────────────────────────
    console.log('[WEURA] /image/edit — describing image...');
    const description = await describeImage(imageData);

    if (!description) {
      return res.status(502).json({
        success: false,
        error:
          'Could not analyze the image. The vision model may be rate-limited. ' +
          'Please try again in a few seconds.',
      });
    }

    console.log(
      `[WEURA] /image/edit — description: ${description.slice(0, 80)}...`,
    );

    // ─── Step 2: combine description + edit → enhance ───────
    const combined =
      `${description}\n\n` +
      `Modification requested by user: ${editPrompt}\n\n` +
      `Generate the SAME subject/scene, but apply the modification above.`;

    const enhanced = await enhancePrompt(combined);

    if (!enhanced.ok || !enhanced.prompt) {
      return res.status(400).json({
        success: false,
        error: enhanced.error ?? 'Cannot edit this image.',
      });
    }

    console.log(
      `[WEURA] /image/edit — enhanced prompt: ${enhanced.prompt.slice(0, 100)}...`,
    );

    // ─── Step 3: generate new image via FLUX ────────────────
    let result: { buffer: Buffer; contentType: string } | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      result = await fetchImage(enhanced.prompt);
      if (result) break;

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) =>
          setTimeout(r, 1000 * Math.pow(2, attempt - 1)),
        );
      }
    }

    if (!result) {
      return res.status(502).json({
        success: false,
        error: 'Image service is busy. Please try again.',
      });
    }

    // ─── Success ────────────────────────────────────────────
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-WEURA-Edited', 'true');
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  } catch (error) {
    console.error('[WEURA] Image edit error:', error);
    return res.status(500).json({
      success: false,
      error: 'Image edit failed.',
    });
  }
});

/* ============================================================
 *  ROUTE — PING (Cloudflare health check)
 * ============================================================ */

router.get('/image/ping', async (_req, res) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    return res.json({ success: false, error: 'Cloudflare credentials missing.' });
  }

  try {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${accountId}/ai/run/${CF_MODEL}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ prompt: 'a red apple on a wooden table', steps: 4 }),
      signal: AbortSignal.timeout(30000),
    });

    return res.json({
      success: response.ok,
      status: response.status,
    });
  } catch (error) {
    return res.json({
      success: false,
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    });
  }
});

export default router;