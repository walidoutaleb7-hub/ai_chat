import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';

/* ============================================================
 *  CACHES
 * ============================================================ */

type TranslationCache = { english: string; expiresAt: number };
const TRANSLATION_CACHE = new Map<string, TranslationCache>();
const TRANSLATION_TTL = 24 * 60 * 60 * 1000;
const TRANSLATION_MAX = 500;

type CardCache = { data: any; expiresAt: number };
const CARD_CACHE = new Map<string, CardCache>();
const CARD_TTL = 3 * 60 * 1000;
const CARD_MAX = 100;

function pruneCache<K, V extends { expiresAt: number }>(
  map: Map<K, V>,
  max: number,
): void {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (entry.expiresAt <= now) map.delete(key);
  }
  if (map.size > max) {
    const overflow = map.size - max;
    let removed = 0;
    for (const key of map.keys()) {
      if (removed >= overflow) break;
      map.delete(key);
      removed++;
    }
  }
}

setInterval(() => {
  pruneCache(TRANSLATION_CACHE, TRANSLATION_MAX);
  pruneCache(CARD_CACHE, CARD_MAX);
}, 10 * 60 * 1000).unref();

/* ============================================================
 *  FAST ALIASES (Arabic → English)
 * ============================================================ */

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
  'بيلينجهام': 'Jude Bellingham',
  'مودريتش': 'Luka Modric',
  'محرز': 'Riyad Mahrez',
  'زياش': 'Hakim Ziyech',
  'حكيمي': 'Achraf Hakimi',
  'أشرف حكيمي': 'Achraf Hakimi',
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
  'كورتوا': 'Thibaut Courtois',
  'موسيالا': 'Jamal Musiala',
  'أونانا': 'Andre Onana',
  'بونو': 'Yassine Bounou',
  'ماني': 'Sadio Mane',
  'كوليبالي': 'Kalidou Koulibaly',
  'أمرابط': 'Sofyan Amrabat',
  'أوناحي': 'Azzedine Ounahi',
  'رودري': 'Rodri',
  'كاكا': 'Kaka',
  'إبراهيموفيتش': 'Zlatan Ibrahimovic',
  'ديبالا': 'Paulo Dybala',
  'لوكاكو': 'Romelu Lukaku',
  'غريزمان': 'Antoine Griezmann',
  'بوجبا': 'Paul Pogba',
  'كانتي': 'N Golo Kante',
  'راموس': 'Sergio Ramos',
  'بيكيه': 'Gerard Pique',
  'سواريز': 'Luis Suarez',
  'دي ماريا': 'Angel Di Maria',
  'روني': 'Wayne Rooney',
  'جيرارد': 'Steven Gerrard',
  'دروغبا': 'Didier Drogba',
  'إيتو': "Samuel Eto'o",
  'برونو فيرنانديز': 'Bruno Fernandes',
  'راشفورد': 'Marcus Rashford',
  'ساكا': 'Bukayo Saka',
  'رودريغو': 'Rodrygo',
  'رافينيا': 'Raphinha',
  'دي يونغ': 'Frenkie de Jong',
  'أوبلاك': 'Jan Oblak',
  'نوير': 'Manuel Neuer',
  'دوناروما': 'Gianluigi Donnarumma',
  'بن ناصر': 'Ismael Bennacer',
  'بلايلي': 'Youcef Belaili',
  'براهيمي': 'Yacine Brahimi',
  'بن رحمة': 'Said Benrahma',
  'بن سبعيني': 'Ramy Bensebaini',
};

/* ============================================================
 *  TRANSLATOR
 * ============================================================ */

const TRANSLATOR_SYSTEM_PROMPT = [
  'You are a football expert.',
  'The user gives you a footballer name in Arabic, Darija, French, or any language.',
  'Return ONLY the player name in English (Latin script).',
  'Rules:',
  '- Return ONLY the name. No quotes, no explanation, no punctuation.',
  '- Use the standard international spelling used on Transfermarkt.',
  '- If the name is already Latin, return it as-is.',
  '- NEVER return Arabic characters. Only Latin letters.',
  '- If you do not know the player, return exactly: UNKNOWN',
  'Examples:',
  '  موسيالا => Jamal Musiala',
  '  كورتوا => Thibaut Courtois',
  '  مبابي => Kylian Mbappe',
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
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT },
          { role: 'user', content: clean },
        ],
        temperature: 0.1,
        max_tokens: 50,
        tools: [],
        tool_choice: 'none',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return clean;

    const data: any = await response.json();
    const translated = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?]/g, '')
      .trim();

    if (
      !translated ||
      translated.toUpperCase() === 'UNKNOWN' ||
      /[\u0600-\u06FF]/.test(translated)
    ) {
      return clean;
    }

    TRANSLATION_CACHE.set(clean, {
      english: translated,
      expiresAt: Date.now() + TRANSLATION_TTL,
    });
    if (TRANSLATION_CACHE.size > TRANSLATION_MAX) {
      pruneCache(TRANSLATION_CACHE, TRANSLATION_MAX);
    }

    return translated;
  } catch {
    return clean;
  }
}

/* ============================================================
 *  TAVILY
 * ============================================================ */

const FOOTBALL_DOMAINS = [
  'espn.com', 'bbc.com', 'skysports.com', 'marca.com', 'as.com',
  'goal.com', 'fotmob.com', 'transfermarkt.com', 'sofascore.com',
  'realmadrid.com', 'fcbarcelona.com', 'liverpoolfc.com', 'manutd.com',
  'chelseafc.com', 'juventus.com', 'acmilan.com', 'psg.fr',
  'fifa.com', 'uefa.com', 'premierleague.com', 'laliga.com',
  'bundesliga.com', 'legaseriea.it', 'ligue1.com',
  'alnassr.sa', 'alhilal.com', 'arsenal.com', 'tottenhamhotspur.com',
  'atleticodemadrid.com', 'sevillafc.es', 'valenciacf.com',
  'besoccer.com', 'onefootball.com', 'football-italia.net',
];

async function tavilySearch(
  query: string,
  limit: number = 5,
  days: number = 90,
): Promise<
  Array<{ title: string; url: string; snippet: string; date?: string }>
> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const body: Record<string, unknown> = {
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.map((r: any) => {
      const raw =
        typeof r?.raw_content === 'string' && r.raw_content.trim().length > 0
          ? r.raw_content
          : String(r?.content ?? '');

      const clean = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900);

      return {
        title: String(r?.title ?? ''),
        url: String(r?.url ?? ''),
        snippet: clean,
        date: r?.published_date ? String(r.published_date) : undefined,
      };
    });
  } catch {
    return [];
  }
}

/* ============================================================
 *  CLUB DICTIONARY
 * ============================================================ */

const CLUB_ALIASES: Record<string, string> = {
  'real madrid': 'Real Madrid',
  'fc barcelona': 'FC Barcelona',
  barcelona: 'FC Barcelona',
  'atletico madrid': 'Atletico Madrid',
  'atlético madrid': 'Atletico Madrid',
  sevilla: 'Sevilla',
  valencia: 'Valencia',
  'real betis': 'Real Betis',
  'real sociedad': 'Real Sociedad',
  villarreal: 'Villarreal',
  'athletic bilbao': 'Athletic Bilbao',
  'celta vigo': 'Celta Vigo',
  'rayo vallecano': 'Rayo Vallecano',
  girona: 'Girona',
  'manchester city': 'Manchester City',
  'manchester united': 'Manchester United',
  'man utd': 'Manchester United',
  liverpool: 'Liverpool',
  chelsea: 'Chelsea',
  arsenal: 'Arsenal',
  tottenham: 'Tottenham',
  'tottenham hotspur': 'Tottenham',
  newcastle: 'Newcastle United',
  'newcastle united': 'Newcastle United',
  'aston villa': 'Aston Villa',
  'west ham': 'West Ham',
  everton: 'Everton',
  brighton: 'Brighton',
  'brighton & hove albion': 'Brighton',
  'crystal palace': 'Crystal Palace',
  'nottingham forest': 'Nottingham Forest',
  wolves: 'Wolves',
  wolverhampton: 'Wolves',
  fulham: 'Fulham',
  brentford: 'Brentford',
  bournemouth: 'Bournemouth',
  leeds: 'Leeds United',
  southampton: 'Southampton',
  ipswich: 'Ipswich Town',
  'bayern munich': 'Bayern Munich',
  bayern: 'Bayern Munich',
  'borussia dortmund': 'Borussia Dortmund',
  dortmund: 'Borussia Dortmund',
  'rb leipzig': 'RB Leipzig',
  leipzig: 'RB Leipzig',
  'bayer leverkusen': 'Bayer Leverkusen',
  leverkusen: 'Bayer Leverkusen',
  frankfurt: 'Eintracht Frankfurt',
  'eintracht frankfurt': 'Eintracht Frankfurt',
  'vfb stuttgart': 'VfB Stuttgart',
  stuttgart: 'VfB Stuttgart',
  wolfsburg: 'VfL Wolfsburg',
  monchengladbach: 'Borussia Monchengladbach',
  'borussia monchengladbach': 'Borussia Monchengladbach',
  juventus: 'Juventus',
  'inter milan': 'Inter Milan',
  inter: 'Inter Milan',
  'ac milan': 'AC Milan',
  milan: 'AC Milan',
  napoli: 'Napoli',
  roma: 'AS Roma',
  'as roma': 'AS Roma',
  lazio: 'Lazio',
  atalanta: 'Atalanta',
  fiorentina: 'Fiorentina',
  bologna: 'Bologna',
  torino: 'Torino',
  'paris saint-germain': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  'paris sg': 'Paris Saint-Germain',
  psg: 'Paris Saint-Germain',
  monaco: 'AS Monaco',
  'as monaco': 'AS Monaco',
  marseille: 'Marseille',
  lyon: 'Olympique Lyonnais',
  lille: 'Lille',
  nice: 'Nice',
  'stade rennais': 'Stade Rennais',
  rennes: 'Stade Rennais',
  benfica: 'Benfica',
  porto: 'FC Porto',
  'fc porto': 'FC Porto',
  sporting: 'Sporting CP',
  'sporting cp': 'Sporting CP',
  ajax: 'Ajax',
  psv: 'PSV',
  feyenoord: 'Feyenoord',
  'al nassr': 'Al Nassr',
  'al-nassr': 'Al Nassr',
  alnassr: 'Al Nassr',
  'al hilal': 'Al Hilal',
  'al-hilal': 'Al Hilal',
  alhilal: 'Al Hilal',
  'al ittihad': 'Al-Ittihad',
  'al-ittihad': 'Al-Ittihad',
  'alittihad': 'Al-Ittihad',
  'al ahli saudi': 'Al-Ahli Saudi',
  'al-ahli saudi': 'Al-Ahli Saudi',
  'al shabab': 'Al-Shabab',
  'al-shabab': 'Al-Shabab',
  'al ettifaq': 'Al-Ettifaq',
  'al-ettifaq': 'Al-Ettifaq',
  'al taawoun': 'Al-Taawoun',
  'al ain': 'Al Ain',
  'al-ain': 'Al Ain',
  'al wasl': 'Al Wasl',
  'al-wasl': 'Al Wasl',
  'al jazira': 'Al Jazira',
  sharjah: 'Sharjah',
  'al sadd': 'Al Sadd',
  'al-sadd': 'Al Sadd',
  'al duhail': 'Al Duhail',
  'al-duhail': 'Al Duhail',
  'al rayyan': 'Al Rayyan',
  'al ahly': 'Al Ahly',
  'al-ahly': 'Al Ahly',
  'al ahly cairo': 'Al Ahly',
  zamalek: 'Zamalek',
  'pyramids fc': 'Pyramids FC',
  pyramids: 'Pyramids FC',
  'raja casablanca': 'Raja Casablanca',
  raja: 'Raja Casablanca',
  'wydad casablanca': 'Wydad Casablanca',
  wydad: 'Wydad Casablanca',
  'cr belouizdad': 'CR Belouizdad',
  belouizdad: 'CR Belouizdad',
  'js kabylie': 'JS Kabylie',
  'js saoura': 'JS Saoura',
  'mc alger': 'MC Alger',
  'usm alger': 'USM Alger',
  'es setif': 'ES Setif',
  esperance: 'Esperance de Tunis',
  'etoile du sahel': 'Etoile du Sahel',
  'cs sfaxien': 'CS Sfaxien',
  'club africain': 'Club Africain',
  'inter miami': 'Inter Miami',
  'la galaxy': 'LA Galaxy',
  lafc: 'LAFC',
  'atlanta united': 'Atlanta United',
  'seattle sounders': 'Seattle Sounders',
  celtic: 'Celtic',
  rangers: 'Rangers',
  besiktas: 'Besiktas',
  galatasaray: 'Galatasaray',
  fenerbahce: 'Fenerbahce',
  zenit: 'Zenit',
  'shakhtar donetsk': 'Shakhtar Donetsk',
  'dynamo kyiv': 'Dynamo Kyiv',
  'red star belgrade': 'Red Star Belgrade',
};

const CLUB_ALIASES_SORTED = Object.keys(CLUB_ALIASES).sort(
  (a, b) => b.length - a.length,
);

function detectClubFromText(text: string): string {
  const lower = text.toLowerCase();
  for (const alias of CLUB_ALIASES_SORTED) {
    if (lower.includes(alias)) return CLUB_ALIASES[alias];
  }
  return '';
}

/**
 * Weighted club detection from search results.
 * - More-recent results count more.
 * - Mentions in titles count double.
 */
function detectClubFromSearchResults(
  results: Array<{ title: string; snippet: string; date?: string }>,
): { club: string; score: number; mentions: number } | null {
  const scores = new Map<string, number>();
  const mentions = new Map<string, number>();

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const r of results) {
    const titleText = (r.title ?? '').toLowerCase();
    const bodyText = (r.snippet ?? '').toLowerCase();

    let weight = 1.0;
    if (r.date) {
      const d = Date.parse(r.date);
      if (!Number.isNaN(d)) {
        const daysAgo = (now - d) / DAY_MS;
        weight = Math.max(0.3, 1.0 - daysAgo / 180);
      }
    }

    for (const alias of CLUB_ALIASES_SORTED) {
      const club = CLUB_ALIASES[alias];

      const inTitle = titleText.includes(alias);
      const inBody = bodyText.includes(alias);
      if (!inTitle && !inBody) continue;

      const contribution = (inTitle ? 2 : 1) * weight;
      scores.set(club, (scores.get(club) ?? 0) + contribution);
      mentions.set(club, (mentions.get(club) ?? 0) + 1);
    }
  }

  if (scores.size === 0) return null;

  let best = '';
  let bestScore = 0;
  let bestMentions = 0;
  for (const [club, score] of scores.entries()) {
    if (score > bestScore) {
      best = club;
      bestScore = score;
      bestMentions = mentions.get(club) ?? 0;
    }
  }

  return { club: best, score: bestScore, mentions: bestMentions };
}

/* ============================================================
 *  DESCRIPTION FALLBACK
 * ============================================================ */

function extractFallbackFromDescription(description: string): {
  currentClub: string;
  lastTransfer: string;
  latestNews: string;
} {
  if (!description || description.length === 0) {
    return { currentClub: '', lastTransfer: '', latestNews: '' };
  }

  const text = description.replace(/\s+/g, ' ').trim();

  const currentClubPatterns = [
    /plays as (?:a|an) [a-z- ]+ for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club |Saudi Pro League club |UAE Pro League club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
    /currently plays for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club |Saudi Pro League club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
    /plays for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club |Saudi Pro League club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
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
  if (!currentClub) currentClub = detectClubFromText(text);

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

  let latestNews = '';
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0];
  if (firstSentence && firstSentence.length > 20) {
    latestNews = firstSentence.slice(0, 200);
  }

  return { currentClub, lastTransfer, latestNews };
}

/* ============================================================
 *  GROQ EXTRACTOR (STRICT)
 * ============================================================ */

const EXTRACTOR_SYSTEM_PROMPT = [
  'You are a football data extractor. Return ONLY valid JSON.',
  '',
  'INPUT you will receive:',
  '1. Player name.',
  '2. TheSportsDB description — OFTEN OUTDATED by 1-3 YEARS.',
  '3. Recent web search results — DATED, sorted newest-first.',
  '',
  'PRIORITY ORDER (STRICT):',
  '1. Most recent search result (with a date within 6 months).',
  '2. Second-most recent search result.',
  '3. TheSportsDB description — LAST RESORT ONLY.',
  '',
  'CRITICAL RULES:',
  '- TheSportsDB descriptions are frequently STALE. Ignore them unless',
  '  no recent search result contradicts them.',
  '- If recent search results mention a club that differs from the',
  '  TheSportsDB description, TRUST THE SEARCH RESULTS.',
  '- Example: description says "Manchester United", but the newest',
  '  search result says "signs new deal with Al Nassr" → currentClub',
  '  must be "Al Nassr".',
  '- NEVER mix two clubs. Pick ONE for currentClub.',
  '- If search results disagree, use the most recent one by date.',
  '- If NO search result mentions a current club, use the description.',
  '- NEVER invent a club. Only clubs that literally appear in sources.',
  '',
  'JSON SCHEMA:',
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
  'FIELD RULES:',
  '- currentClub: club the player plays for RIGHT NOW (2026).',
  '- currentClubCountry: country of that club (e.g. "Saudi Arabia", "Spain").',
  '- lastTransfer: format "FromClub to ToClub (Year)".',
  '  IMPORTANT: use ONLY the transfer that brought the player to the',
  '  CURRENT club. Do NOT combine transfers from different years.',
  '  Example: Ronaldo (Al Nassr) → "Manchester United to Al Nassr (2023)".',
  '  NOT "Juventus to Al Nassr" (he left Juventus in 2021).',
  '- stats.season: e.g. "2025-26".',
  '- trophies: array of STRINGS only. Include ALL major trophies',
  '  (Champions League, league titles, Ballon d\'Or count, international',
  '  cups). Example: ["5x Champions League", "Euro 2016", "Nations League 2019"].',
  '- latestNews: ONE short sentence in ENGLISH about the player. Use the',
  '  MOST RECENT search result (check the dates — prefer 2026 over 2025/2024).',
  '- Leave any field "" if not confirmed by sources.',
  '- Return ONLY JSON. No markdown. No explanation.',
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
  if (!apiKey) return null;

  const today = new Date().toISOString().split('T')[0];

  const context = searchResults
    .slice(0, 10)
    .map(
      (r, i) =>
        `[${i + 1}]${r.date ? ` (${r.date})` : ''} ${r.title}\n` +
        `URL: ${r.url}\n` +
        `${r.snippet.slice(0, 500)}`,
    )
    .join('\n\n');

  const userMessage =
    `Today: ${today}\n` +
    `Player: ${playerName}\n` +
    `Nationality: ${nationality}\n\n` +
    `TheSportsDB description (MAY BE OUTDATED):\n${description.slice(0, 1500)}\n\n` +
    `Recent search results (newest first — HIGH PRIORITY):\n\n${context}`;

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
          { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.05,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        tools: [],
        tool_choice: 'none',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return null;

    const data: any = await response.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();

    if (!content) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }

    const trophiesRaw = Array.isArray(parsed.trophies) ? parsed.trophies : [];
    const trophies = trophiesRaw
      .map((t: any) => {
        if (typeof t === 'string') return t.trim();
        if (t && typeof t === 'object') {
          return String(t.name ?? t.title ?? '').trim();
        }
        return '';
      })
      .filter((t: string) => t.length > 0);

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
      trophies,
      latestNews: String(parsed.latestNews ?? ''),
    };
  } catch {
    return null;
  }
}

/* ============================================================
 *  FLAG EMOJI
 * ============================================================ */

const FLAG_MAP: Record<string, string> = {
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
  scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  ireland: '🇮🇪', austria: '🇦🇹', finland: '🇫🇮',
  iceland: '🇮🇸', ukraine: '🇺🇦', romania: '🇷🇴',
  bulgaria: '🇧🇬', hungary: '🇭🇺', 'czech republic': '🇨🇿',
  czechia: '🇨🇿', slovakia: '🇸🇰', slovenia: '🇸🇮',
  'saudi arabia': '🇸🇦', uae: '🇦🇪', qatar: '🇶🇦',
  kuwait: '🇰🇼', bahrain: '🇧🇭', oman: '🇴🇲',
};

function flagEmoji(country: string | undefined): string {
  if (!country) return '';
  return FLAG_MAP[country.toLowerCase()] ?? '';
}

/* ============================================================
 *  ROUTE
 * ============================================================ */

router.get('/player', async (req, res) => {
  const rawName = String(req.query.name ?? '').trim();

  if (!rawName) {
    return res.status(400).json({ success: false, error: 'name is required.' });
  }

  if (rawName.length > 60) {
    return res.status(400).json({ success: false, error: 'name is too long.' });
  }

  const cached = CARD_CACHE.get(rawName);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  const englishName = await translatePlayerName(rawName);

  const stillArabic = /[\u0600-\u06FF]/.test(englishName);
  if (stillArabic) {
    return res.status(404).json({
      success: false,
      error: 'Player not found.',
      searchedFor: englishName,
    });
  }

  try {
    /* ---- 1. TheSportsDB ---- */
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

        const soccerPlayers = players.filter(
          (p: any) => p.strSport === 'Soccer',
        );

        if (soccerPlayers.length > 0) {
          player = soccerPlayers[0];

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
          } catch {}
        }
      }
    } catch (e) {
      console.error('[WEURA] TheSportsDB error:', e);
    }

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found.',
        searchedFor: englishName,
      });
    }

    /* ---- 2. Tavily — multi-query strategy ---- */
    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const currentMonth = new Date().toLocaleString('en-US', {
      month: 'long',
    });

    const searchQueries = [
      `${englishName} current club ${currentYear}`,
      `${englishName} transfer news ${currentYear}`,
      `${englishName} signs for club`,
      `${englishName} joins new club`,
      `${englishName} ${currentMonth} ${currentYear} news`,
      `${englishName} latest news ${currentYear} ${prevYear}`,
    ];

    const allResults: Array<{
      title: string;
      url: string;
      snippet: string;
      date?: string;
    }> = [];

    for (const q of searchQueries) {
      const results = await tavilySearch(q, 5, 90);
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

    /* ---- 3. Groq extractor ---- */
    let freshData = await extractPlayerData(
      englishName,
      player?.strNationality ?? '',
      player?.strDescriptionEN ?? '',
      uniqueResults.slice(0, 10),
    );

    /* ---- 4. Description fallback ---- */
    const fallback = extractFallbackFromDescription(
      player?.strDescriptionEN ?? '',
    );

    /* ---- 5. Search-based club detection ---- */
    const searchDetection = detectClubFromSearchResults(
      uniqueResults.slice(0, 10),
    );

    if (!freshData) {
      freshData = {
        currentClub: searchDetection?.club || fallback.currentClub,
        currentClubCountry: '',
        lastTransfer: fallback.lastTransfer,
        marketValue: '',
        stats: { goals: '', assists: '', appearances: '', season: '' },
        trophies: [],
        latestNews: fallback.latestNews,
      };
    } else {
      if (!freshData.currentClub) {
        freshData.currentClub =
          searchDetection?.club || fallback.currentClub;
      }

      const llmClub = freshData.currentClub.toLowerCase();
      const fallbackClub = fallback.currentClub.toLowerCase();
      const searchClub = (searchDetection?.club ?? '').toLowerCase();

      if (
        searchDetection &&
        searchDetection.mentions >= 2 &&
        searchClub &&
        llmClub === fallbackClub &&
        searchClub !== fallbackClub
      ) {
        freshData.currentClub = searchDetection.club;
      }

      if (!freshData.lastTransfer && fallback.lastTransfer) {
        freshData.lastTransfer = fallback.lastTransfer;
      }
      if (!freshData.latestNews && fallback.latestNews) {
        freshData.latestNews = fallback.latestNews;
      }
    }

    /* ---- 6. Merge ---- */
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

    if (CARD_CACHE.size > CARD_MAX) {
      pruneCache(CARD_CACHE, CARD_MAX);
    }

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