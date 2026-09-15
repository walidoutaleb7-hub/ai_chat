import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

// ---------------------------------------------------------------------------
// Translation cache (Arabic → English player name)
// ---------------------------------------------------------------------------

type CacheEntry = {
  english: string;
  expiresAt: number;
};

const TRANSLATION_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------------------------------------------------------------------
// Quick dictionary for the most common names (instant, no Groq call)
// ---------------------------------------------------------------------------

const FAST_ALIASES: Record<string, string> = {
  'مبابي': 'Kylian Mbappe',
  'كيليان مبابي': 'Kylian Mbappe',
  'ميسي': 'Lionel Messi',
  'ليونيل ميسي': 'Lionel Messi',
  'رونالدو': 'Cristiano Ronaldo',
  'كريستيانو رونالدو': 'Cristiano Ronaldo',
  'بنزيمة': 'Karim Benzema',
  'بنزيما': 'Karim Benzema',
  'كريم بنزيمة': 'Karim Benzema',
  'صلاح': 'Mohamed Salah',
  'محمد صلاح': 'Mohamed Salah',
  'نيمار': 'Neymar',
  'هالاند': 'Erling Haaland',
  'فينيسيوس': 'Vinicius Junior',
  'بيلينغهام': 'Jude Bellingham',
  'مودريتش': 'Luka Modric',
  'محرز': 'Riyad Mahrez',
  'زياش': 'Hakim Ziyech',
  'النصيري': 'Youssef En-Nesyri',
  'بونجاح': 'Baghdad Bounedjah',
  'سليماني': 'Islam Slimani',
  'دي بروين': 'Kevin De Bruyne',
  'هاري كين': 'Harry Kane',
  'ليفاندوفسكي': 'Robert Lewandowski',
  'فان دايك': 'Virgil van Dijk',
  'زيدان': 'Zinedine Zidane',
  'رونالدينيو': 'Ronaldinho',
  'مارادونا': 'Diego Maradona',
  'بيليه': 'Pele',
  'ميسي': 'Lionel Messi',
  'ديبالا': 'Paulo Dybala',
  'لوكاكو': 'Romelu Lukaku',
  'أوباميانغ': 'Pierre-Emerick Aubameyang',
  'ماني': 'Sadio Mane',
  'كوليبالي': 'Kalidou Koulibaly',
  'زياش': 'Hakim Ziyech',
  'أونانا': 'Andre Onana',
  'حكيمي': 'Achraf Hakimi',
  'أشرف حكيمي': 'Achraf Hakimi',
  'بونو': 'Yassine Bounou',
  'ياسين بونو': 'Yassine Bounou',
  'عمورة': 'Mohamed Amoura',
  'بن ناصر': 'Ismael Bennacer',
  'إسماعيل بن ناصر': 'Ismael Bennacer',
  'بلعيد': 'Youcef Belaili',
  'بلايلي': 'Youcef Belaili',
  'ياسين براهيمي': 'Yacine Brahimi',
  'براهيمي': 'Yacine Brahimi',
};

// ---------------------------------------------------------------------------
// Groq translator for any Arabic / dialect player name
// ---------------------------------------------------------------------------

const TRANSLATOR_SYSTEM_PROMPT = `
You are a football expert.

The user will give you a footballer's name in Arabic, Algerian Darija,
French, or any language.

Your task: return ONLY the player's name in English (Latin script),
as it appears on international football databases like TheSportsDB.

Rules:
- Return ONLY the name. No quotes, no explanation, no punctuation.
- Use the most common international spelling.
  Examples:
    "مبابي"  → Kylian Mbappe
    "بنزيمة" → Karim Benzema
    "رونالدو" → Cristiano Ronaldo
    "هالاند" → Erling Haaland
    "بوعلام" → Ramy Bensebaini
    "زياش"   → Hakim Ziyech
- If the name is already Latin, return it as-is (correct the spelling).
- If you are not sure, return your best guess — never refuse.
- Never return Arabic characters. Only Latin script.
`;

async function translatePlayerName(raw: string): Promise<string> {
  const clean = raw.trim();

  if (!clean) return clean;

  // 1. Fast dictionary.
  if (FAST_ALIASES[clean]) return FAST_ALIASES[clean];

  // Partial match on the fast dictionary.
  for (const [ar, en] of Object.entries(FAST_ALIASES)) {
    if (clean.includes(ar)) return en;
  }

  // 2. Already Latin? Return as-is.
  if (/^[\x00-\x7F\s.\-']+$/.test(clean)) return clean;

  // 3. Cache hit?
  const cached = TRANSLATION_CACHE.get(clean);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.english;
  }

  // 4. Ask Groq to translate.
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return clean;

  try {
    const response = await fetch(GROQ_API_URL, {
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
          { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT },
          { role: 'user', content: clean },
        ],
        temperature: 0.2,
        max_tokens: 50,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(
        `[WEURA] Translator HTTP ${response.status}`,
      );
      return clean;
    }

    const data: any = await response.json();
    const translated = String(
      data?.choices?.[0]?.message?.content ?? '',
    )
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?،؟]/g, '')
      .trim();

    if (!translated || /[\u0600-\u06FF]/.test(translated)) {
      return clean;
    }

    TRANSLATION_CACHE.set(clean, {
      english: translated,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    console.log(
      `[WEURA] Player translated: "${clean}" → "${translated}"`,
    );

    return translated;
  } catch (error) {
    console.error('[WEURA] Translator error:', error);
    return clean;
  }
}

// ---------------------------------------------------------------------------
// Flag emoji
// ---------------------------------------------------------------------------

function flagEmoji(country: string | undefined): string {
  if (!country) return '';

  const map: Record<string, string> = {
    france: '🇫🇷',
    argentina: '🇦🇷',
    portugal: '🇵🇹',
    brazil: '🇧🇷',
    spain: '🇪🇸',
    england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    germany: '🇩🇪',
    italy: '🇮🇹',
    netherlands: '🇳🇱',
    belgium: '🇧🇪',
    algeria: '🇩🇿',
    morocco: '🇲🇦',
    tunisia: '🇹🇳',
    egypt: '🇪🇬',
    norway: '🇳🇴',
    croatia: '🇭🇷',
    poland: '🇵🇱',
    usa: '🇺🇸',
    'united states': '🇺🇸',
    uruguay: '🇺🇾',
    senegal: '🇸🇳',
    cameroon: '🇨🇲',
    nigeria: '🇳🇬',
    ghana: '🇬🇭',
    ivory: '🇨🇮',
    'ivory coast': '🇨🇮',
    japan: '🇯🇵',
    'south korea': '🇰🇷',
    australia: '🇦🇺',
    mexico: '🇲🇽',
    canada: '🇨🇦',
    sweden: '🇸🇪',
    denmark: '🇩🇰',
    switzerland: '🇨🇭',
    austria: '🇦🇹',
    turkey: '🇹🇷',
    greece: '🇬🇷',
    russia: '🇷🇺',
    ukraine: '🇺🇦',
    serbia: '🇷🇸',
    colombia: '🇨🇴',
    chile: '🇨🇱',
    peru: '🇵🇪',
    ecuador: '🇪🇨',
  };

  return map[country.toLowerCase()] ?? '';
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

router.get('/player', async (req, res) => {
  const rawName = String(req.query.name ?? '').trim();

  if (!rawName) {
    return res.status(400).json({
      success: false,
      error: 'name is required.',
    });
  }

  const englishName = await translatePlayerName(rawName);

  console.log(
    `[WEURA] Player lookup: "${rawName}" → "${englishName}"`,
  );

  try {
    const searchRes = await fetch(
      `${BASE}/searchplayers.php?p=${encodeURIComponent(englishName)}`,
      { signal: AbortSignal.timeout(15000) },
    );

    if (!searchRes.ok) {
      throw new Error(`Search HTTP ${searchRes.status}`);
    }

    const searchData: any = await searchRes.json();
    const players = Array.isArray(searchData?.player)
      ? searchData.player
      : [];

    if (players.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Player not found.',
        searchedFor: englishName,
      });
    }

    let player =
      players.find((p: any) => p.strSport === 'Soccer') ?? players[0];

    try {
      const detailRes = await fetch(
        `${BASE}/lookupplayer.php?id=${player.idPlayer}`,
        { signal: AbortSignal.timeout(15000) },
      );

      if (detailRes.ok) {
        const detailData: any = await detailRes.json();
        if (
          Array.isArray(detailData?.players) &&
          detailData.players[0]
        ) {
          player = detailData.players[0];
        }
      }
    } catch (_) {
      // fallback
    }

    const nationality = String(player.strNationality ?? '');

    return res.json({
      success: true,
      searchedFor: englishName,
      player: {
        id: player.idPlayer ?? '',
        name: player.strPlayer ?? '',
        nameAlternate: player.strPlayerAlternate ?? '',
        team: player.strTeam ?? '',
        team2: player.strTeam2 ?? '',
        sport: player.strSport ?? '',
        position: player.strPosition ?? '',
        position2: player.strPosition2 ?? '',
        nationality: nationality,
        flag: flagEmoji(nationality),
        nationality2: player.strNationality2 ?? '',
        birthDate: player.dateBorn ?? '',
        birthLocation: player.strBirthLocation ?? '',
        height: player.strHeight ?? '',
        weight: player.strWeight ?? '',
        number: player.strNumber ?? '',
        side: player.strSide ?? '',
        status: player.strStatus ?? '',
        description: player.strDescriptionEN ?? '',
        thumb: player.strThumb ?? '',
        cutout: player.strCutout ?? '',
        render: player.strRender ?? '',
        banner: player.strBanner ?? '',
        instagram: player.strInstagram ?? '',
        twitter: player.strTwitter ?? '',
      },
    });
  } catch (error) {
    console.error('[WEURA] Player fetch error:', error);
    return res.status(500).json({
      success: false,
      error: 'Player service is unavailable.',
    });
  }
});

export default router;
