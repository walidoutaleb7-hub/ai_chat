import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

type TranslationCache = {
  english: string;
  expiresAt: number;
};

const TRANSLATION_CACHE = new Map<string, TranslationCache>();
const TRANSLATION_TTL = 24 * 60 * 60 * 1000;

type CardCache = {
  data: any;
  expiresAt: number;
};

const CARD_CACHE = new Map<string, CardCache>();
const CARD_TTL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fast dictionary (60+ popular Arabic names → English)
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
  'حكيمي': 'Achraf Hakimi',
  'أشرف حكيمي': 'Achraf Hakimi',
  'أونانا': 'Andre Onana',
  'بونو': 'Yassine Bounou',
  'ياسين بونو': 'Yassine Bounou',
  'أوباميانغ': 'Pierre-Emerick Aubameyang',
  'ماني': 'Sadio Mane',
  'كوليبالي': 'Kalidou Koulibaly',
  'أمرابط': 'Sofyan Amrabat',
  'أوناحي': 'Azzedine Ounahi',
  'بوفال': 'Sofiane Boufal',
  'بيلينغهام': 'Jude Bellingham',
  'رودري': 'Rodri',
  'كاكا': 'Kaka',
  'إبراهيموفيتش': 'Zlatan Ibrahimovic',
  'ديبالا': 'Paulo Dybala',
  'لوكاكو': 'Romelu Lukaku',
  'غريزمان': 'Antoine Griezmann',
  'بوجبا': 'Paul Pogba',
  'كانتي': 'N Golo Kante',
  'بينزيم': 'Karim Benzema',
  'أليسون': 'Alisson Becker',
  'إيدرسون': 'Ederson',
  'كورتوا': 'Thibaut Courtois',
  'دي خيا': 'David de Gea',
};

const TRANSLATOR_SYSTEM_PROMPT = [
  'You are a football expert.',
  '',
  'The user will give you a footballer name in Arabic, Algerian Darija,',
  'French, or any language.',
  '',
  'Return ONLY the player name in English (Latin script), as it appears',
  'on international football databases like TheSportsDB.',
  '',
  'Rules:',
  '- Return ONLY the name. No quotes, no explanation, no punctuation.',
  '- Use the most common international spelling.',
  '- Examples:',
  '    "مبابي"    => Kylian Mbappe',
  '    "بنزيمة"   => Karim Benzema',
  '    "رودري"    => Rodri',
  '    "بيليجريني" => Lorenzo Pellegrini',
  '- If the name is already Latin, return it as-is (correct spelling).',
  '- Never return Arabic characters.',
].join('\n');

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
          process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
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
      .replace(/[.!?]/g, '')
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
// Tavily search — football trusted domains
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
  limit: number = 3,
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

      const clean = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800);

      return {
        title: String(r?.title ?? ''),
        url: String(r?.url ?? ''),
        snippet: clean,
      };
    });
  } catch (e) {
    console.error('[WEURA] Player Tavily error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Groq extractor — pull structured data from search results
// ---------------------------------------------------------------------------

const EXTRACTOR_SYSTEM_PROMPT = [
  'You are a football data extractor. Return a JSON object.',
  '',
  'Input: player name + web search results.',
  '',
  'Output: this exact JSON structure. Nothing else.',
  '{',
  '  "currentClub": "",',
  '  "currentClubCountry": "",',
  '  "lastTransfer": "",',
  '  "marketValue": "",',
  '  "stats": {',
  '    "goals": "",',
  '    "assists": "",',
  '    "appearances": "",',
  '    "season": ""',
  '  },',
  '  "trophies": [],',
  '  "latestNews": ""',
  '}',
  '',
  'Rules:',
  '- Read the search results carefully.',
  '- Fill each field with info FOUND in the results.',
  '- If a field is not in the results, leave it as "".',
  '- For "currentClub", look for the club he plays for NOW (2025 or 2026).',
  '- For "lastTransfer", format: "FromClub to ToClub (Year)".',
  '- For "latestNews", one short sentence.',
  '- Return ONLY the JSON. No markdown, no explanation.',
].join('\n');

async function extractPlayerData(
  playerName: string,
  nationality: string,
  searchResults: Array<{
    title: string;
    snippet: string;
    url: string;
  }>,
): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error('[WEURA] Extractor: no Groq key');
    return null;
  }

  if (searchResults.length === 0) {
    console.error('[WEURA] Extractor: no search results');
    return null;
  }

  const context = searchResults
    .slice(0, 6)
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet.slice(0, 500)}`,
    )
    .join('\n\n');

  const userMessage =
    `Player: ${playerName}\n` +
    `Nationality: ${nationality}\n\n` +
    `Search results:\n\n${context}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:
          process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(
        `[WEURA] Extractor HTTP ${response.status}: ${errText.slice(0, 300)}`,
      );
      return null;
    }

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    console.log(
      `[WEURA] Extractor raw: ${content.slice(0, 300)}`,
    );

    if (!content) {
      console.error('[WEURA] Extractor: empty content');
      return null;
    }

    let parsed: any;

    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[WEURA] Extractor: no JSON found');
        return null;
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return {
      currentClub: String(parsed.currentClub ?? ''),
      currentClubCountry: String(parsed.currentClubCountry ?? ''),
      lastTransfer: String(parsed.lastTransfer ?? ''),
      marketValue: String(parsed.marketValue ?? ''),
      stats: {
        goals: String(parsed?.stats?.goals ?? ''),
        assists: String(parsed?.stats?.assists ?? ''),
        appearances: String(parsed?.stats?.appearances ?? ''),
        season: String(parsed?.stats?.season ?? ''),
      },
      trophies: Array.isArray(parsed.trophies) ? parsed.trophies : [],
      latestNews: String(parsed.latestNews ?? ''),
    };
  } catch (e) {
    console.error('[WEURA] Extractor error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
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
    'ivory coast': '🇨🇮',
    japan: '🇯🇵',
    'south korea': '🇰🇷',
    australia: '🇦🇺',
    mexico: '🇲🇽',
    canada: '🇨🇦',
    sweden: '🇸🇪',
    denmark: '🇩🇰',
    switzerland: '🇨🇭',
    turkey: '🇹🇷',
    greece: '🇬🇷',
    russia: '🇷🇺',
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

  const cached = CARD_CACHE.get(rawName);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  const englishName = await translatePlayerName(rawName);

  console.log(
    `[WEURA] Player lookup: "${rawName}" -> "${englishName}"`,
  );

  try {
    // -------------------------------------------------------------------
    // 1. TheSportsDB: basic info + photo
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // 2. Tavily: fresh info from football sites
    // -------------------------------------------------------------------
    const searchQueries = [
      `${englishName} current club 2025 2026`,
      `${englishName} transfer news`,
      `${englishName} goals assists stats this season`,
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

    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (!r.url || seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    // -------------------------------------------------------------------
    // 3. Groq: extract structured data
    // -------------------------------------------------------------------
    const freshData = await extractPlayerData(
      englishName,
      player?.strNationality ?? '',
      uniqueResults.slice(0, 6),
    );

    // -------------------------------------------------------------------
    // 4. Merge
    // -------------------------------------------------------------------
    const nationality = String(player?.strNationality ?? '');
    const flag = flagEmoji(nationality);

    const responseData = {
      success: true,
      searchedFor: englishName,

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

        thumb: player?.strThumb ?? '',
        cutout: player?.strCutout ?? '',
        render: player?.strRender ?? '',
        banner: player?.strBanner ?? '',

        instagram: player?.strInstagram ?? '',
        twitter: player?.strTwitter ?? '',
      },

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

      sources: uniqueResults.slice(0, 6).map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
      })),
    };

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
