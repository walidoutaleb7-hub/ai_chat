import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';

// ---------------------------------------------------------------------------
// Translation cache
// ---------------------------------------------------------------------------

type TranslationCache = {
  english: string;
  expiresAt: number;
};

const TRANSLATION_CACHE = new Map<string, TranslationCache>();
const TRANSLATION_TTL = 24 * 60 * 60 * 1000;

// Player card cache (5 minutes)
type CardCache = {
  data: any;
  expiresAt: number;
};

const CARD_CACHE = new Map<string, CardCache>();
const CARD_TTL = 5 * 60 * 1000;

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
  'حكيمي': 'Achraf Hakimi',
  'أشرف حكيمي': 'Achraf Hakimi',
  'أونانا': 'Andre Onana',
  'بونو': 'Yassine Bounou',
  'ياسين بونو': 'Yassine Bounou',
  'زياش': 'Hakim Ziyech',
  'أوباميانغ': 'Pierre-Emerick Aubameyang',
  'ماني': 'Sadio Mane',
  'كوليبالي': 'Kalidou Koulibaly',
  'أمرابط': 'Sofyan Amrabat',
  'أوناحي': 'Azzedine Ounahi',
  'بوفال': 'Sofiane Boufal',
};

const TRANSLATOR_SYSTEM_PROMPT = `
You are a football expert.

The user will give you a footballer's name in Arabic, Algerian Darija,
French, or any language.

Return ONLY the player's name in English (Latin script), as it appears
on international football databases like TheSportsDB.

Rules:
- Return ONLY the name. No quotes, no explanation, no punctuation.
- Use the most common international spelling.
- Examples:
    "مبابي"  → Kylian Mbappe
    "بنزيمة" → Karim Benzema
    "رودري"  → Rodri
    "بيليجريني" → Lorenzo Pellegrini
- If the name is already Latin, return it as-is (correct spelling).
- Never return Arabic characters.
`;

async function translatePlayerName(raw: string): Promise<string> {
  const clean = raw.trim();
  if (!clean) return clean;

  if (FAST_ALIASES[clean]) return FAST_ALIASES[clean];

  for (const [ar, en] of Object.entries(FAST_ALIASES)) {
    if (clean.includes(ar)) return en;
  }

  if (/^[\x00-\x7F\s.\-']+$/.test(clean)) return clean;

  const cached = TRANSLATION_CACHE.get(clean);
  if (cached && cached.expiresAt > Date.now()) return cached.english;

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

    if (!response.ok) return clean;

    const data: any = await response.json();
    const translated = String(
      data?.choices?.[0]?.message?.content ?? '',
    )
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?،؟]/g, '')
      .trim();

    if (!translated || /[\u0600-\u06FF]/.test(translated)) return clean;

    TRANSLATION_CACHE.set(clean, {
      english: translated,
      expiresAt: Date.now() + TRANSLATION_TTL,
    });

    return translated;
  } catch (_) {
    return clean;
  }
}

// ---------------------------------------------------------------------------
// Tavily — fresh football info
// ---------------------------------------------------------------------------

const FOOTBALL_DOMAINS = [
  'espn.com',
  'bbc.com',
  'skysports.com',
  'marca.com',
  'as.com',
  'goal.com',
  'fotmob.com',
  'transfermarkt.com',
  'sofascore.com',
  'realmadrid.com',
  'fcbarcelona.com',
  'liverpoolfc.com',
  'manutd.com',
  'chelseafc.com',
  'juventus.com',
  'acmilan.com',
  'psg.fr',
  'fifa.com',
  'uefa.com',
  'premierleague.com',
  'laliga.com',
  'bundesliga.com',
  'legaseriea.it',
  'ligue1.com',
];

async function tavilySearch(
  query: string,
  limit: number = 5,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query,
      max_results: limit,
      include_answer: false,
      include_raw_content: true,
      search_depth: 'advanced',
      topic: 'general',
      include_domains: FOOTBALL_DOMAINS,
    };

    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.map((r: any) => {
      const raw =
        typeof r?.raw_content === 'string' &&
        r.raw_content.trim().length > 0
          ? r.raw_content
          : String(r?.content ?? '');

      return {
        title: String(r?.title ?? ''),
        url: String(r?.url ?? ''),
        snippet: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
      };
    });
  } catch (e) {
    console.error('[WEURA] Player Tavily error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Groq — extract structured data from search results
// ---------------------------------------------------------------------------

const EXTRACTOR_SYSTEM_PROMPT = `
You are a football data extractor.

You receive:
1. A player's basic info (name, nationality, DOB).
2. Web search results about the player.

Extract the following CURRENT information (as of today). Answer in
JSON ONLY, no explanation, no markdown.

Return this exact JSON structure:
{
  "currentClub": "name or empty",
  "currentClubCountry": "name or empty",
  "lastTransfer": "from → to (year) or empty",
  "marketValue": "e.g. 180M € or empty",
  "stats": {
    "goals": "number or empty",
    "assists": "number or empty",
    "appearances": "number or empty",
    "season": "e.g. 2024/25 or empty"
  },
  "trophies": ["list of recent trophies"],
  "latestNews": "one-line summary of the most recent news about the player"
}

Rules:
- Only use info EXPLICITLY written in the search results.
- If a field is not in the results, leave it empty ("" or []).
- Never invent numbers or clubs.
- Be concise.
`;

async function extractPlayerData(
  playerName: string,
  nationality: string,
  searchResults: Array<{ title: string; snippet: string; url: string }>,
): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || searchResults.length === 0) return null;

  const context = searchResults
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`,
    )
    .join('\n\n');

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
          { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `Player: ${playerName}\n` +
              `Nationality: ${nationality}\n\n` +
              `Search results:\n\n${context}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    // Extract JSON from response (may be wrapped in ```json```).
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[WEURA] Player extractor error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Flag emoji
// ---------------------------------------------------------------------------

function flagEmoji(country: string | undefined): string {
  if (!country) return '';
  const map: Record<string, string> = {
    france: '🇫🇷', argentina: '🇦🇷', portugal: '🇵🇹',
    brazil: '🇧🇷', spain: '🇪🇸', england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    germany: '🇩🇪', italy: '🇮🇹', netherlands: '🇳🇱',
    belgium: '🇧🇪', algeria: '🇩🇿', morocco: '🇲🇦',
    tunisia: '🇹🇳', egypt: '🇪🇬', norway: '🇳🇴',
    croatia: '🇭🇷', poland: '🇵🇱', usa: '🇺🇸',
    'united states': '🇺🇸', uruguay: '🇺🇾',
    senegal: '🇸🇳', cameroon: '🇨🇲', nigeria: '🇳🇬',
    ghana: '🇬🇭', 'ivory coast': '🇨🇮', japan: '🇯🇵',
    'south korea': '🇰🇷', australia: '🇦🇺', mexico: '🇲🇽',
    canada: '🇨🇦', sweden: '🇸🇪', denmark: '🇩🇰',
    switzerland: '🇨🇭', turkey: '🇹🇷', greece: '🇬🇷',
    russia: '🇷🇺', serbia: '🇷🇸', colombia: '🇨🇴',
    chile: '🇨🇱', peru: '🇵🇪', ecuador: '🇪🇨',
  };
  return map[country.toLowerCase()] ?? '';
}

// ---------------------------------------------------------------------------
// Player endpoint — hybrid (TheSportsDB + Tavily + Groq)
// ---------------------------------------------------------------------------

router.get('/player', async (req, res) => {
  const rawName = String(req.query.name ?? '').trim();

  if (!rawName) {
    return res.status(400).json({
      success: false,
      error: 'name is required.',
    });
  }

  // Cache?
  const cached = CARD_CACHE.get(rawName);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  const englishName = await translatePlayerName(rawName);

  console.log(
    `[WEURA] Player lookup: "${rawName}" → "${englishName}"`,
  );

  try {
    // ---------------------------------------------------------------------
    // 1. TheSportsDB — basic info + photo
    // ---------------------------------------------------------------------
    let player: any = null;

    try {
      const searchRes = await fetch(
        `${BASE}/searchplayers.php?p=${encodeURIComponent(englishName)}`,
        { signal: AbortSignal.timeout(15000) },
      );

      if (searchRes.ok) {
        const searchData: any = await searchRes.json();
        const players = Array.isArray(searchData?.player)
          ? searchData.player
          : [];

        if (players.length > 0) {
          player =
            players.find((p: any) => p.strSport === 'Soccer') ??
            players[0];

          // Get detailed version
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
            // keep search result
          }
        }
      }
    } catch (e) {
      console.error('[WEURA] TheSportsDB error:', e);
    }

    // ---------------------------------------------------------------------
    // 2. Tavily — fresh info (current club, transfers, stats)
    // ---------------------------------------------------------------------
    const searchQueries = [
      `${englishName} current club 2025`,
      `${englishName} latest transfer news`,
      `${englishName} stats goals assists 2025`,
    ];

    const allResults: Array<{
      title: string;
      url: string;
      snippet: string;
    }> = [];

    for (const q of searchQueries) {
      const results = await tavilySearch(q, 3);
      allResults.push(...results);
    }

    // Dedupe by URL.
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (!r.url || seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    // ---------------------------------------------------------------------
    // 3. Groq — extract structured fresh data
    // ---------------------------------------------------------------------
    const freshData = await extractPlayerData(
      englishName,
      player?.strNationality ?? '',
      uniqueResults.slice(0, 8),
    );

    // ---------------------------------------------------------------------
    // 4. Merge everything
    // ---------------------------------------------------------------------
    const nationality = String(player?.strNationality ?? '');
    const flag = flagEmoji(nationality);

    const responseData = {
      success: true,
      searchedFor: englishName,

      // Basic (TheSportsDB)
      player: {
        id: player?.idPlayer ?? '',
        name: player?.strPlayer ?? englishName,
        nameAlternate: player?.strPlayerAlternate ?? '',
        sport: player?.strSport ?? 'Soccer',
        nationality,
        flag,
        birthDate: player?.dateBorn ?? '',
        birthLocation: player?.strBirthLocation ?? '',
        height: player?.strHeight ?? '',
        weight: player?.strWeight ?? '',
        side: player?.strSide ?? '',
        number: player?.strNumber ?? '',
        position: player?.strPosition ?? '',
        position2: player?.strPosition2 ?? '',
        description: player?.strDescriptionEN ?? '',

        // Photos
        thumb: player?.strThumb ?? '',
        cutout: player?.strCutout ?? '',
        render: player?.strRender ?? '',
        banner: player?.strBanner ?? '',

        // Social
        instagram: player?.strInstagram ?? '',
        twitter: player?.strTwitter ?? '',
      },

      // Fresh data (Tavily + Groq)
      current: freshData ?? {
        currentClub: '',
        currentClubCountry: '',
        lastTransfer: '',
        marketValue: '',
        stats: {
          goals: '',
          assists: '',
          appearances: '',
          season: '',
        },
        trophies: [],
        latestNews: '',
      },

      // Sources
      sources: uniqueResults.slice(0, 6).map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
      })),
    };

    // Cache for 5 minutes.
    CARD_CACHE.set(rawName, {
      data: responseData,
      expiresAt: Date.now() + CARD_TTL,
    });

    return res.json(responseData);
  } catch (error) {
    console.error('[WEURA] Player handler error:', error);
    return res.status(500).json({
      success: false,
      error: 'Player service is unavailable.',
    });
  }
});

export default router;
