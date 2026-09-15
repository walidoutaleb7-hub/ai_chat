import express from 'express';

const router = express.Router();

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';
const HF_ROUTER_URL =
  `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;

const PER_ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 1000;

// Hardcoded safety
const HARD_REJECT_PATTERNS: RegExp[] = [
  /عارية|عاري|عريان|مكشوف|جنسي|جنس|إباحي|اباحي|نود|بورن/i,
  /nude|naked|nsfw|porn|sexual|erotic|explicit/i,
  /nue|nu|porno|sexuel|érotique/i,
  /والله|بالله|أقسم|اقسم|بسم الله|الحمد لله|سبحان الله|الله أكبر|آية|قرآن|حديث شريف/i,
  /quran|hadith|islamic verse/i,
  /جثة|دماء|قتل|ذبح|تعذيب|إرهاب|ارهاب/i,
  /gore|beheading|torture|terrorist|murder/i,
];

function hardReject(prompt: string): boolean {
  for (const pattern of HARD_REJECT_PATTERNS) {
    if (pattern.test(prompt)) return true;
  }
  return false;
}

type EnhancedPrompt = {
  ok: boolean;
  prompt?: string;
  error?: string;
};

const SYSTEM_PROMPT = `
You are WEURA's image prompt engineer. Translate the user's request
(ANY language) to ONE clean English prompt for FLUX.

RULES:
1. Translate everything to English.
2. For fictional characters (Batman, Spider-Man, Naruto, Goku, Luffy,
   Mickey, Mario, Darth Vader, etc.), describe them accurately with
   their ICONIC costume, colors, symbols so the model renders the
   RIGHT character. Do NOT invent a different person.
3. Spider-Man → "a superhero in a tight red and blue suit with black
   web pattern, spider emblem on chest, masked face with white eyes".
4. Batman → "a masked superhero in dark grey and black armored suit
   with bat emblem on chest, cape, pointy bat ears on cowl".
5. For real celebrities (Messi, Ronaldo, etc.): describe respectfully
   in a sports/portrait context.
6. ALWAYS append: "ultra detailed, 8k, sharp focus, cinematic lighting,
   masterpiece, professional color grading".

SAFETY — output EXACTLY "REJECT" alone if the request asks for:
- sexual/nude content of ANY person
- sexual content involving minors (ALWAYS)
- graphic violence, gore
- hate symbols, terrorism, religion targeting
- ANY religious reference
- real celebrities in sexual contexts

Output ONLY the final English prompt (or "REJECT"). No quotes, no
labels, no explanation.

EXAMPLES:

User: "ارسم لي سبايدر مان"
Output: Spider-Man in his classic red and blue suit with black web pattern, spider emblem on chest, masked face with large white eyes, dynamic web-swinging pose between New York skyscrapers at golden hour, comic-book style, vibrant colors, cinematic lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي باتمان"
Output: Batman in his iconic dark grey and black armored suit, bat emblem on chest, flowing cape, pointy bat ears on the cowl, standing on a gothic rooftop in Gotham at night, dramatic low-angle shot, deep shadows, ultra detailed, 8k, masterpiece

User: "ارسم لي ناروتو"
Output: Naruto Uzumaki with blonde spiky hair, orange and black jumpsuit, leaf village headband, dynamic ninja pose with blue chakra energy, anime key visual style, vibrant colors, ultra detailed, 8k, masterpiece

User: "ارسم لي قطة في الفضاء"
Output: A cute fluffy cat floating in outer space wearing a small astronaut helmet, colorful nebula background, cinematic composition, ultra detailed, 8k, photorealistic, masterpiece

User: "ارسم لي ميسي"
Output: A professional soccer player resembling Lionel Messi in an Argentina jersey celebrating a goal, cinematic sports photography, dramatic floodlights, ultra detailed, 8k, masterpiece

User: "ارسم فتاة عارية"
Output: REJECT
`;

async function enhancePrompt(
  userPrompt: string,
): Promise<EnhancedPrompt> {
  if (hardReject(userPrompt)) {
    console.log(`[WEURA] Image hard-rejected: "${userPrompt}"`);
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
            process.env.GROQ_MODEL?.trim() ||
            'openai/gpt-oss-120b',
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
      console.error(
        `[WEURA] Groq enhance failed HTTP ${response.status}`,
      );
      return { ok: true, prompt: userPrompt };
    }

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    if (!content) return { ok: true, prompt: userPrompt };

    if (content.toUpperCase().includes('REJECT')) {
      return {
        ok: false,
        error: 'لا يمكنني إنشاء هذه الصورة. جرّب وصفاً آخر.',
      };
    }

    const cleaned = content
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { ok: true, prompt: cleaned };
  } catch (error) {
    console.error('[WEURA] Groq enhance error:', error);
    return { ok: true, prompt: userPrompt };
  }
}

async function fetchImage(
  prompt: string,
  width: number,
  height: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) {
    console.error('[WEURA] HUGGINGFACE_API_KEY not configured.');
    return null;
  }

  try {
    const response = await fetch(HF_ROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'image/png',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { width, height },
      }),
      signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(
        `[WEURA] HF HTTP ${response.status}: ${errText.slice(0, 300)}`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 1024) {
      console.error(
        `[WEURA] HF tiny response (${buffer.length} bytes)`,
      );
      return null;
    }

    const contentType =
      response.headers.get('content-type') ?? 'image/png';

    return { buffer, contentType };
  } catch (error) {
    console.error('[WEURA] HF fetch failed:', error);
    return null;
  }
}

router.get('/image', async (req, res) => {
  const rawPrompt = String(req.query.prompt ?? '').trim();

  const widthRaw = Number(req.query.width ?? 1024);
  const heightRaw = Number(req.query.height ?? 1024);

  const width = Number.isFinite(widthRaw)
    ? Math.min(Math.max(Math.round(widthRaw), 256), 1024)
    : 1024;

  const height = Number.isFinite(heightRaw)
    ? Math.min(Math.max(Math.round(heightRaw), 256), 1024)
    : 1024;

  if (!rawPrompt) {
    return res.status(400).json({
      success: false,
      error: 'Prompt is required.',
    });
  }

  const enhanced = await enhancePrompt(rawPrompt);

  if (!enhanced.ok || !enhanced.prompt) {
    return res.status(400).json({
      success: false,
      error: enhanced.error ?? 'Cannot generate this image.',
    });
  }

  const prompt = enhanced.prompt;
  console.log(
    `[WEURA] Image enhanced: "${rawPrompt}" → "${prompt}"`,
  );

  const cacheKey = `${prompt}|${width}|${height}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-WEURA-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[WEURA] Image attempt ${attempt}/${MAX_ATTEMPTS}`);

    const result = await fetchImage(prompt, width, height);

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
    error: 'Image service is busy. Please try again.',
  });
});

router.get('/image/ping', async (_req, res) => {
  try {
    const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
    if (!apiKey) {
      return res.json({ success: false, error: 'No API key' });
    }

    const response = await fetch(HF_ROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: 'test',
        parameters: { width: 256, height: 256 },
      }),
      signal: AbortSignal.timeout(20000),
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