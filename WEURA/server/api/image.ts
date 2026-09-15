import express from 'express';

const router = express.Router();

/// WEURA Image Service — high-quality version.
///
/// Uses Pollinations with FLUX.1 Pro (higher quality than Schnell).
/// Auto-detects the best style + adds cinematic tags.

type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const PER_ATTEMPT_TIMEOUT_MS = 40_000;
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 800;

// ---------------------------------------------------------------------------
// Groq helper
// ---------------------------------------------------------------------------

type EnhancedPrompt = {
  ok: boolean;
  prompt?: string;
  error?: string;
};

const SYSTEM_PROMPT = `
You are WEURA's world-class cinematic image prompt engineer.

You take a user request (in ANY language) and produce ONE extremely
detailed, high-quality English prompt for FLUX Pro (via Pollinations).

You are an expert on:
- Thousands of fictional characters (anime, manga, comics, cartoons,
  video games, movies, TV series, books, folklore).
- Real celebrities, athletes, historical figures, public personas.
- Objects, animals, places, logos, scenes, and abstract concepts.

═══════════════════════════════════════════
CORE PROCESS
═══════════════════════════════════════════

STEP 1 — Understand the request and pick the right medium:
  anime / manga / comic-book / cartoon / video-game / photorealistic /
  cinematic / fantasy art / minimalist logo / poster / wallpaper.

STEP 2 — Build a CINEMATIC prompt with these components:
   • Subject (with every iconic detail: costume colors, symbols,
     hairstyle, weapons, accessories)
   • Pose & expression
   • Environment / background (specific, atmospheric)
   • Lighting (dramatic, cinematic, volumetric, rim light, golden hour,
     neon, moonlight, god rays…)
   • Composition (wide shot, close-up, low angle, dynamic, isometric…)
   • Mood / atmosphere
   • Camera / lens (shot on 85mm, shallow depth of field, bokeh,
     ultra-wide, cinematic framing)
   • Quality tags (always include at least 4-5):
       "ultra detailed, 8k, sharp focus, masterpiece, cinematic lighting,
        dramatic composition, professional color grading"

STEP 3 — Match the style:
  • Anime (Naruto, Goku, Luffy, Gojo…) → "anime key visual, Studio
    Ghibli inspired, vibrant colors, dynamic pose, cel shading, "
  • Manga (Saitama, Levi…) → "manga style, bold ink lines, dramatic
    shadows, detailed linework"
  • Comic-book (Batman, Spider-Man, Iron Man…) → "epic comic-book
    cover art, cinematic superhero shot, dramatic low-angle, deep
    shadows, rain, neon city lights"
  • Cartoon (Mickey, SpongeBob…) → "cartoon style, playful composition,
    vibrant colors, animation frame quality"
  • Video game (Kratos, Master Chief…) → "cinematic video-game
    key art, realistic engine render, dramatic lighting, Unreal
    Engine quality"
  • Photoreal / celebrity → "cinematic photography, shot on ARRI Alexa,
    shallow depth of field, natural lighting, editorial quality"
  • Fantasy → "epic fantasy digital painting, dramatic lighting,
    intricate details, trending on ArtStation"
  • Logo → "minimalist premium logo design, clean vector, elegant
    typography, flat design, professional branding"

STEP 4 — ALWAYS output in English.

STEP 5 — Apply SAFETY (see below).

═══════════════════════════════════════════
CHARACTER HANDLING
═══════════════════════════════════════════

For ANY character (fictional OR real):
1. Keep the character's name in Latin script.
2. Add their most recognizable visual features.
3. Do NOT invent contradicting features.
4. Respect their original medium.

Categories you MUST handle (examples only):

• ANIME/MANGA: Naruto, Goku, Luffy, Zoro, Sasuke, Itachi, Gojo,
  Tanjiro, Nezuko, Levi, Eren, Saitama, Vegeta, Sailor Moon,
  L, Light Yagami, Lelouch, Edward Elric, Spike Spiegel...

• COMICS: Batman, Superman, Spider-Man, Iron Man, Captain America,
  Thor, Hulk, Wonder Woman, Flash, Aquaman, Joker, Thanos, Deadpool,
  Wolverine, Black Panther, Doctor Strange...

• CARTOONS: Mickey Mouse, Bugs Bunny, Tom & Jerry, SpongeBob,
  Patrick, Scooby-Doo, Popeye, Donald Duck, Pink Panther...

• VIDEO GAMES: Mario, Luigi, Link, Zelda, Kratos, Master Chief,
  Geralt, Lara Croft, Nathan Drake, Joel, Ellie, Aloy, Pikachu...

• MOVIES/TV: Darth Vader, Yoda, Luke Skywalker, Harry Potter,
  Gandalf, Frodo, Jack Sparrow, Neo, John Wick, Walter White...

• ARABIC FOLK & HISTORY: Saladin, Ibn Sina, Al-Khwarizmi, Antara,
  Aladdin, Sinbad, Scheherazade, an Arab knight, an Arab astronomer...

• REAL PEOPLE (respectful, non-sexual): Messi, Ronaldo, Mbappé,
  Salah, Benzema, Michael Jordan, Elon Musk, Einstein, Muhammad Ali...

═══════════════════════════════════════════
SAFETY — REJECT (output exactly "REJECT" alone)
═══════════════════════════════════════════

Reject if the request asks for:
- sexual, nude, or revealing content of ANY person
- sexual content involving minors (ALWAYS reject)
- graphic violence, gore, torture
- hate symbols, terrorism, content targeting a religion or group
- real celebrities in sexual contexts
- child abuse in any form

NEVER mix "REJECT" with a real prompt.

═══════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════

Output ONLY the final English prompt.
- One paragraph.
- Comma-separated descriptions.
- No quotes, labels, markdown, or explanation.

═══════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════

User: "ارسم لي باتمان"
Output: Batman in his iconic dark grey and black armored suit with a flowing cape and the bat emblem on his chest, standing heroically on a gothic rooftop gargoyle in Gotham City at night, rain falling, bat-signal glowing in the sky, neon city lights in the background, dramatic low-angle cinematic superhero shot, deep shadows, volumetric lighting, ultra detailed, 8k, sharp focus, masterpiece, cinematic color grading

User: "ارسم لي سبايدر مان"
Output: Spider-Man in his classic red and blue suit with black web pattern, dynamic web-swinging pose between New York skyscrapers at golden hour, dramatic perspective, comic-book cover style, vibrant colors, cinematic lighting, ultra detailed illustration, 8k, sharp focus, masterpiece

User: "ارسم لي ناروتو"
Output: Naruto Uzumaki with blonde spiky hair, orange and black jumpsuit, leaf village headband, in a dynamic ninja pose surrounded by swirling blue chakra energy, cinematic anime key visual, Naruto Shippuden style, vibrant colors, cel shading, dramatic lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي غوكو"
Output: Goku in his orange gi and blue undershirt, black spiky hair powering up to Super Saiyan with a golden aura, surrounded by lightning and cracked ground, Dragon Ball Z anime key visual, epic cinematic composition, vibrant colors, cel shading, dramatic lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي لوفي"
Output: Monkey D. Luffy wearing his signature straw hat and red vest, stretching his rubber arm forward with a determined grin, standing on a pirate ship deck in the middle of a stormy ocean at sunset, One Piece anime key visual, vibrant colors, cel shading, cinematic composition, ultra detailed, 8k, masterpiece

User: "ارسم لي سبونج بوب"
Output: SpongeBob SquarePants with his yellow porous body, big blue eyes, brown shorts, red tie and white shirt, in a cheerful dynamic pose in Bikini Bottom with a rainbow jellyfish background, cartoon style, playful composition, vibrant colors, animation frame quality, ultra detailed

User: "ارسم لي ماريو"
Output: Mario in his red cap, red shirt, blue overalls, brown shoes and white gloves, jumping dynamically while collecting gold coins in the Mushroom Kingdom, colorful background with pipes and question blocks, classic Nintendo video-game key art, vibrant colors, cinematic lighting, ultra detailed

User: "ارسم لي كراتوس"
Output: Kratos with pale skin, red tattoo over his eye, ash-white beard, wielding the Leviathan Axe and Guardian Shield, standing in a snowy Norse mountain landscape under an aurora sky, God of War Ragnarok cinematic key art, dramatic lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي دارث فيدر"
Output: Darth Vader in his iconic black armor, helmet and flowing cape, holding a glowing red lightsaber, standing in a dark sci-fi corridor filled with smoke and red emergency lights, Star Wars cinematic shot, dramatic low-angle, volumetric lighting, ultra detailed, 8k, masterpiece

User: "ارسم لي سالادين الأيوبي"
Output: Saladin (Salah ad-Din al-Ayyubi) as a noble medieval Muslim commander in intricate steel chainmail, a flowing golden cloak and a curved Damascus sword, standing on a rocky hill overlooking a desert fortress at sunset, epic historical artwork, cinematic lighting, god rays, ultra detailed digital painting, 8k, masterpiece

User: "ارسم لي فارس عربي على حصان"
Output: A noble Arab knight in traditional medieval Arab armor with flowing white and gold robes, riding a majestic black Arabian horse through golden desert dunes at sunset, epic cinematic composition, dramatic lighting, ultra detailed digital painting, 8k, masterpiece

User: "ارسم لي ميسي"
Output: A professional soccer player resembling Lionel Messi in an Argentina jersey celebrating a goal with arms wide open, confetti falling on a stadium pitch at night, cinematic sports photography, shot on ARRI Alexa, dramatic floodlights, ultra detailed, 8k, masterpiece

User: "ارسم لي محمد علي كلاي"
Output: Muhammad Ali in his boxing prime, standing confidently in a boxing ring with gloves raised, dramatic black-and-white cinematic sports photography style, high contrast, grainy film look, ultra detailed, masterpiece

User: "ارسم لي شعار مقهى WEURA"
Output: Minimalist premium logo for a coffee shop named "WEURA", featuring a stylized geometric coffee cup with rising steam and elegant modern typography, deep navy blue and electric blue palette, flat vector design, professional branding, clean composition, high quality

User: "ارسم لي تنين ينفخ النار"
Output: A majestic dragon with iridescent emerald and gold scales breathing a torrent of fire across a moonlit mountain range, epic fantasy art, dramatic cinematic composition, god rays, volumetric lighting, ultra detailed digital painting, 8k, masterpiece

User: "ارسم لي قطة في الفضاء"
Output: A cute fluffy cat floating in outer space wearing a small astronaut helmet, stars and colorful nebula in the background, cinematic composition, volumetric lighting, ultra detailed, 8k, photorealistic, masterpiece

User: "ارسم فتاة عارية"
Output: REJECT
`;

async function enhancePrompt(
  userPrompt: string,
): Promise<EnhancedPrompt> {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    return { ok: true, prompt: userPrompt };
  }

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
          temperature: 0.65,
          max_tokens: 350,
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

    if (!content) {
      return { ok: true, prompt: userPrompt };
    }

    if (
      content === 'REJECT' ||
      content.toUpperCase().startsWith('REJECT')
    ) {
      return {
        ok: false,
        error:
          'تعذر إنشاء هذه الصورة بسبب سياسة المحتوى. جرّب طلباً آخر.',
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

// ---------------------------------------------------------------------------
// Pollinations fetch — use FLUX Pro for high quality
// ---------------------------------------------------------------------------

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
    model: 'flux-pro',
    nologo: 'true',
    enhance: 'false',
    safe: 'false',
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

// ---------------------------------------------------------------------------
// Main endpoint
// ---------------------------------------------------------------------------

router.get('/image', async (req, res) => {
  const rawPrompt = String(req.query.prompt ?? '').trim();

  const widthRaw = Number(req.query.width ?? 1280);
  const heightRaw = Number(req.query.height ?? 768);

  const width = Number.isFinite(widthRaw)
    ? Math.min(Math.max(Math.round(widthRaw), 256), 2048)
    : 1280;

  const height = Number.isFinite(heightRaw)
    ? Math.min(Math.max(Math.round(heightRaw), 256), 2048)
    : 768;

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
      error:
        enhanced.error ??
        'تعذر إنشاء هذه الصورة. جرّب طلباً آخر.',
    });
  }

  const prompt = enhanced.prompt;
  console.log(
    `[WEURA] Image enhanced: "${rawPrompt}" → "${prompt}"`,
  );

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
