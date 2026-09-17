import express from 'express';

const router = express.Router();

/* ============================================================
 *  CACHE
 * ============================================================ */

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

type RejectEntry = {
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const rejectedCache = new Map<string, RejectEntry>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const CACHE_MAX_ENTRIES = 50;

const REJECT_TTL_MS = 30 * 60 * 1000; // 30 min
const REJECT_MAX_ENTRIES = 200;

/** Removes expired entries + enforces max size on both caches. */
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

/* ============================================================
 *  SAFETY — hard reject
 * ============================================================ */

const HARD_REJECT_PATTERNS: RegExp[] = [
  /\b(عارية|عاري|عريان|مكشوف|جنسي|إباحي|اباحي|نود|بورن)\b/i,
  /\b(nude|naked|nsfw|porn|sexual|erotic|explicit)\b/i,
  /\b(porno|sexuel|érotique)\b/i,
  /\b(جثة|دماء|قتل|ذبح|تعذيب|إرهاب|ارهاب)\b/i,
  /\b(gore|beheading|torture|terrorist|murder)\b/i,
];

function hardReject(prompt: string): boolean {
  for (const pattern of HARD_REJECT_PATTERNS) {
    if (pattern.test(prompt)) return true;
  }
  return false;
}

/* ============================================================
 *  GROQ ENHANCER
 * ============================================================ */

type EnhancedPrompt = {
  ok: boolean;
  prompt?: string;
  error?: string;
};

const SYSTEM_PROMPT = `You are WEURA's image prompt engineer. Translate the user's request (ANY language) to ONE clean English prompt for FLUX.

RULES:
1. Translate everything to English.
2. For fictional characters (Batman, Spider-Man, Naruto, Goku, Luffy, Mickey, Mario, Darth Vader, etc.), describe them accurately with their ICONIC costume, colors, symbols.
3. Spider-Man -> "a superhero in a tight red and blue suit with black web pattern, spider emblem on chest, masked face with white eyes".
4. Batman -> "a masked superhero in dark grey and black armored suit with bat emblem on chest, cape, pointy bat ears on cowl".
5. For real athletes: describe respectfully in sports context (no real face).
6. ALWAYS append: "ultra detailed, 8k, sharp focus, cinematic lighting, masterpiece, professional color grading".

SAFETY - output EXACTLY "REJECT" alone if the request asks for:
- sexual/nude content of ANY person
- sexual content involving minors (ALWAYS)
- graphic violence, gore
- hate symbols, terrorism, religion targeting
- ANY religious reference
- real celebrities in sexual contexts

Output ONLY the final English prompt (or "REJECT").

EXAMPLES:

User: "ارسم لي سبايدر مان"
Output: Spider-Man in his classic red and blue suit with black web pattern, spider emblem on chest, masked face with large white eyes, dynamic web-swinging pose between New York skyscrapers at golden hour, comic-book style, vibrant colors, cinematic lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي باتمان"
Output: Batman in his iconic dark grey and black armored suit, bat emblem on chest, flowing cape, pointy bat ears on the cowl, standing on a gothic rooftop in Gotham at night, dramatic low-angle shot, deep shadows, ultra detailed, 8k, masterpiece

User: "ارسم لي قطة في الفضاء"
Output: A cute fluffy cat floating in outer space wearing a small astronaut helmet, colorful nebula background, cinematic composition, ultra detailed, 8k, photorealistic, masterpiece

User: "ارسم فتاة عارية"
Output: REJECT`;

async function enhancePrompt(
  userPrompt: string,
): Promise<EnhancedPrompt> {
  if (hardReject(userPrompt)) {
    return {
      ok: false,
      error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.',
    };
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { ok: true, prompt: userPrompt };

  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:
            process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      return { ok: true, prompt: userPrompt };
    }

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    if (!content) return { ok: true, prompt: userPrompt };

    // Strict REJECT detection: only if content IS "REJECT".
    if (/^reject\b/i.test(content.trim())) {
      return {
        ok: false,
        error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.',
      };
    }

    const cleaned = content
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return { ok: true, prompt: userPrompt };

    return {
      ok: true,
      prompt: cleaned.slice(0, MAX_PROMPT_LENGTH),
    };
  } catch {
    return { ok: true, prompt: userPrompt };
  }
}

/* ============================================================
 *  CLOUDFLARE WORKERS AI
 * ============================================================ */

async function fetchImage(
  prompt: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    console.error('[WEURA] Cloudflare credentials missing.');
    return null;
  }

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
      body: JSON.stringify({
        prompt,
        steps: 4,
      }),
      signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(
        `[WEURA] CF HTTP ${response.status}: ${errText.slice(0, 500)}`,
      );
      return null;
    }

    const contentType =
      response.headers.get('content-type') ?? 'application/json';

    if (contentType.includes('application/json')) {
      const data: any = await response.json();

      if (data?.success === false) {
        console.error(
          '[WEURA] CF response error:',
          JSON.stringify(data.errors ?? data).slice(0, 300),
        );
        return null;
      }

      const base64 = data?.result?.image;

      if (typeof base64 !== 'string' || base64.length === 0) {
        return null;
      }

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
 *  ROUTE
 * ============================================================ */

router.get('/image', async (req, res) => {
  const rawPrompt = String(req.query.prompt ?? '').trim();

  if (!rawPrompt) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is required.',
    });
  }

  if (rawPrompt.length > MAX_PROMPT_LENGTH * 2) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is too long. Maximum 3000 characters.',
    });
  }

  // ---- Step 1: check rejected cache ----
  const rejectKey = rawPrompt.toLowerCase();
  const rejected = rejectedCache.get(rejectKey);
  if (rejected && rejected.expiresAt > Date.now()) {
    return res.status(400).json({
      success: false,
      error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.',
    });
  }

  // ---- Step 2: enhance prompt ----
  const enhanced = await enhancePrompt(rawPrompt);

  if (!enhanced.ok || !enhanced.prompt) {
    // Cache the rejection to avoid re-calling Groq.
    rejectedCache.set(rejectKey, {
      expiresAt: Date.now() + REJECT_TTL_MS,
    });
    return res.status(400).json({
      success: false,
      error: enhanced.error ?? 'Cannot generate this image.',
    });
  }

  const prompt = enhanced.prompt;

  // ---- Step 3: check image cache ----
  const cacheKey = prompt;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-WEURA-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  // ---- Step 4: generate with retry ----
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

    // Exponential backoff: 1s, then 2s.
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
});

/* ============================================================
 *  PING (diagnostic)
 * ============================================================ */

router.get('/image/ping', async (_req, res) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    return res.json({
      success: false,
      error: 'Cloudflare credentials missing.',
    });
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
      body: JSON.stringify({
        prompt: 'a red apple on a wooden table',
        steps: 4,
      }),
      signal: AbortSignal.timeout(30000),
    });

    let detail = '';

    if (!response.ok) {
      detail = (await response.text().catch(() => '')).slice(0, 300);
    } else {
      const contentType =
        response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data: any = await response.json().catch(() => null);
        if (data?.success === false) {
          detail = JSON.stringify(data.errors ?? data).slice(0, 300);
        }
      }
    }

    return res.json({
      success: response.ok && !detail,
      status: response.status,
      detail: detail || undefined,
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