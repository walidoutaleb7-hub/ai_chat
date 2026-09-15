import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

type TranslationCache = { english: string; expiresAt: number };
const TRANSLATION_CACHE = new Map<string, TranslationCache>();
const TRANSLATION_TTL = 24 * 60 * 60 * 1000;

type CardCache = { data: any; expiresAt: number };
const CARD_CACHE = new Map<string, CardCache>();
const CARD_TTL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fast dictionary
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
  'رودري': 'Rodri',
  'كاكا': 'Kaka',
  'إبراهيموفيتش': 'Zlatan Ibrahimovic',
  'ديبالا': 'Paulo Dybala',
  'لوكاكو': 'Romelu Lukaku',
  'غريزمان': 'Antoine Griezmann',
  'بوجبا': 'Paul Pogba',
  'كانتي': 'N Golo Kante',
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
  'Return ONLY the player name in English (Latin script).',
  '',
  'Rules:',
  '- Return ONLY the name. No quotes, no explanation.',
  '- Use the most common international spelling.',
  '- If the name is already Latin, return it as-is.',
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
// Tavily
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
  days: number = 180,
): Promise<
  Array<{ title: string; url: string; snippet: string; date?: string }>
> {
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
      topic: 'news',
      days,
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
        date: r?.published_date
          ? String(r.published_date)
          : undefined,
      };
    });
  } catch (e) {
    console.error('[WEURA] Player Tavily error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Description fallback — extract current club from TheSportsDB description
// ---------------------------------------------------------------------------

const CLUB_ALIASES: Record<string, string> = {
  'real madrid': 'Real Madrid',
  'fc barcelona': 'FC Barcelona',
  barcelona: 'FC Barcelona',
  'paris saint-germain': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  psg: 'Paris Saint-Germain',
  'manchester city': 'Manchester City',
  'manchester united': 'Manchester United',
  liverpool: 'Liverpool',
  chelsea: 'Chelsea',
  arsenal: 'Arsenal',
  tottenham: 'Tottenham',
  'bayern munich': 'Bayern Munich',
  'borussia dortmund': 'Borussia Dortmund',
  juventus: 'Juventus',
  inter: 'Inter Milan',
  'ac milan': 'AC Milan',
  napoli: 'Napoli',
  'atletico madrid': 'Atletico Madrid',
  sevilla: 'Sevilla',
  valencia: 'Valencia',
  benfica: 'Benfica',
  porto: 'FC Porto',
  ajax: 'Ajax',
  'inter miami': 'Inter Miami',
  'al hilal': 'Al Hilal',
  'al nassr': 'Al Nassr',
  'al ahly': 'Al Ahly',
  zamalek: 'Zamalek',
  'esperance': 'Esperance',
};

function detectClubFromText(text: string): string {
  const lower = text.toLowerCase();

  // Order by length so "paris saint-germain" wins over "psg".
  const sorted = Object.keys(CLUB_ALIASES).sort(
    (a, b) => b.length - a.length,
  );

  for (const alias of sorted) {
    if (lower.includes(alias)) {
      return CLUB_ALIASES[alias];
    }
  }

  return '';
}

function extractFallbackFromDescription(description: string): {
  currentClub: string;
  lastTransfer: string;
  latestNews: string;
} {
  if (!description || description.length === 0) {
    return { currentClub: '', lastTransfer: '', latestNews: '' };
  }

  const text = description.replace(/\s+/g, ' ').trim();

  // Current club patterns
  const currentClubPatterns = [
    /plays as (?:a|an) [a-z- ]+ for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
    /currently plays for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
    /plays for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
  ];

  let currentClub = '';

  for (const pattern of currentClubPatterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const candidate = m[1].trim();
      const known = detectClubFromText(candidate);
      currentClub = known || candidate;
      if (currentClub) break;
    }
  }

  // Fallback: search any known club name in the description
  if (!currentClub) {
    currentClub = detectClubFromText(text);
  }

  // Last transfer pattern: "In 2024, after..., Mbappé joined Real Madrid"
  let lastTransfer = '';

  const joinedPatterns = [
    /In (\d{4})[^.]*?joined ([A-Z][A-Za-z .\-']+?)(?:\.|,| on| for| after)/,
    /in (\d{4})[^.]*?joined ([A-Z][A-Za-z .\-']+?)(?:\.|,| on| for| after)/,
    /in (\d{4})[^.]*?signed for ([A-Z][A-Za-z .\-']+?)(?:\.|,| on| for| after)/,
  ];

  for (const pattern of joinedPatterns) {
    const m = text.match(pattern);
    if (m && m[1] && m[2]) {
      const year = m[1];
      const candidate = m[2].trim();
      const known = detectClubFromText(candidate);
      const club = known || candidate;
      lastTransfer = `${club} (${year})`;
      break;
    }
  }

  // Latest news: first sentence of the description (trimmed)
  let latestNews = '';
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0];
  if (firstSentence && firstSentence.length > 20) {
    latestNews = firstSentence.slice(0, 200);
  }

  return { currentClub, lastTransfer, latestNews };
}

// ---------------------------------------------------------------------------
// Groq extractor
// ---------------------------------------------------------------------------

const EXTRACTOR_SYSTEM_PROMPT = [
  'You are a football data extractor. Return a JSON object.',
  '',
  'You receive:',
  '1. A player name.',
  '2. TheSportsDB official description (may be outdated).',
  '3. Web search results (dated, prefer the newest).',
  '',
  'Return this exact JSON structure:',
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
  '- CurrentClub: the club the player plays for RIGHT NOW.',
  '  Use the MOST RECENT source (by date). Ignore older articles.',
  '  If the description says "plays for X", use X.',
  '- lastTransfer: format "FromClub to ToClub (Year)".',
  '- If a field is absent, leave it "".',
  '- Return ONLY JSON. No markdown.',
].join('\n');

async function extractPlayerData(
  playerName: string,
  nationality: string,
  description: string,
  searchResults: Array<{
    title: string;
    snippet: string;
    url: string;
    date?: string;
  }>,
): Promise<any> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error('[WEURA] Extractor: no Groq API key.');
    return null;
  }

  const today = new Date().toISOString().split('T')[0];

  const context = searchResults
    .slice(0, 8)
    .map(
      (r, i) =>
        `[${i + 1}]${r.date ? ` (${r.date})` : ''} ${r.title}\n` +
        `URL: ${r.url}\n` +
        `${r.snippet.slice(0, 400)}`,
    )
    .join('\n\n');

  const userMessage =
    `Today: ${today}\n` +
    `Player: ${playerName}\n` +
    `Nationality: ${nationality}\n\n` +
    `TheSportsDB description:\n${description.slice(0, 1800)}\n\n` +
    `Search results (newest first):\n\n${context}`;

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

    console.log(`[WEURA] Extractor raw: ${content.slice(0, 300)}`);

    if (!content) {
      console.error('[WEURA] Extractor: empty content.');
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[WEURA] Extractor: no JSON in content.');
        return null;
      }
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.error('[WEURA] Extractor: JSON parse failed.');
        return null;
      }
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
    // 1. TheSportsDB
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
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('[WEURA] TheSportsDB error:', e);
    }

    // -------------------------------------------------------------------
    // 2. Tavily
    // -------------------------------------------------------------------
    const searchQueries = [
      `${englishName} current club 2026`,
      `${englishName} transfer news`,
      `${englishName} stats goals 2025 2026`,
    ];

    const allResults: Array<{
      title: string;
      url: string;
      snippet: string;
      date?: string;
    }> = [];

    for (const q of searchQueries) {
      const results = await tavilySearch(q, 3, 180);
      allResults.push(...results);
    }

    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (!r.url || seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    uniqueResults.sort((a, b) => {
      const da = a.date ?? '';
      const db = b.date ?? '';
      return db.localeCompare(da);
    });

    console.log(
      `[WEURA] Tavily results for ${englishName}: ${uniqueResults.length}`,
    );

    // -------------------------------------------------------------------
    // 3. Groq extractor
    // -------------------------------------------------------------------
    let freshData = await extractPlayerData(
      englishName,
      player?.strNationality ?? '',
      player?.strDescriptionEN ?? '',
      uniqueResults.slice(0, 8),
    );

    // -------------------------------------------------------------------
    // 4. Fallback: parse the description if extractor failed or empty
    // -------------------------------------------------------------------
    const fallback = extractFallbackFromDescription(
      player?.strDescriptionEN ?? '',
    );

    if (!freshData) {
      console.log(
        '[WEURA] Extractor returned null. Using description fallback.',
      );
      freshData = {
        currentClub: fallback.currentClub,
        currentClubCountry: '',
        lastTransfer: fallback.lastTransfer,
        marketValue: '',
        stats: {
          goals: '',
          assists: '',
          appearances: '',
          season: '',
        },
        trophies: [],
        latestNews: fallback.latestNews,
      };
    } else {
      // If extractor returned empty fields, fill from fallback.
      if (!freshData.currentClub && fallback.currentClub) {
        freshData.currentClub = fallback.currentClub;
      }
      if (!freshData.lastTransfer && fallback.lastTransfer) {
        freshData.lastTransfer = fallback.lastTransfer;
      }
      if (!freshData.latestNews && fallback.latestNews) {
        freshData.latestNews = fallback.latestNews;
      }
    }

    // -------------------------------------------------------------------
    // 5. Merge
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

      current: freshData,

      sources: uniqueResults.slice(0, 6).map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
        date: r.date,
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
