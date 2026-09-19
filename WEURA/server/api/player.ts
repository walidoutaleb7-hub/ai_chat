import express from 'express';

const router = express.Router();

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
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
const CARD_TTL = 5 * 60 * 1000;
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
  'جمال موسيالا': 'Jamal Musiala',
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
  'Return ONLY the player name in English (Latin script).',
  'Rules:',
  '- Return ONLY the name. No quotes, no explanation, no punctuation.',
  '- Use the standard international spelling used on Transfermarkt.',
  '- If the name is already Latin, return it as-is.',
  '- NEVER return Arabic characters. Only Latin letters.',
  '- If you do not know the player, return exactly: UNKNOWN',
].join('\n');

/**
 * Normalizes Arabic diacritics + spaces so "كريم  بنزيمة" === "كريم بنزيمة".
 */
function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u064B-\u065F\u0670]/g, ''); // remove tashkeel
}

async function translatePlayerName(raw: string): Promise<string> {
  const clean = normalizeName(raw);
  if (!clean) return clean;

  const lower = clean.toLowerCase();

  // 1. Exact match (fast path, case-insensitive)
  if (FAST_ALIASES[clean]) return FAST_ALIASES[clean];
  for (const [ar, en] of Object.entries(FAST_ALIASES)) {
    if (normalizeName(ar).toLowerCase() === lower) return en;
  }

  // 2. Already Latin → return as-is.
  if (/^[\x00-\x7F\s.\-']+$/.test(clean)) return clean;

  // 3. Cache lookup (before any network call)
  const cached = TRANSLATION_CACHE.get(clean);
  if (cached && cached.expiresAt > Date.now()) return cached.english;

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
  'intermiamicf.com', 'fcbayern.com',
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
 *  CLUB DETECTION (from description text)
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
  'crystal palace': 'Crystal Palace',
  'nottingham forest': 'Nottingham Forest',
  wolves: 'Wolves',
  wolverhampton: 'Wolves',
  fulham: 'Fulham',
  brentford: 'Brentford',
  bournemouth: 'Bournemouth',
  'bayern munich': 'Bayern Munich',
  'fc bayern': 'Bayern Munich',
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
  'paris saint-germain': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  psg: 'Paris Saint-Germain',
  monaco: 'AS Monaco',
  marseille: 'Marseille',
  lyon: 'Olympique Lyonnais',
  lille: 'Lille',
  nice: 'Nice',
  benfica: 'Benfica',
  porto: 'FC Porto',
  'fc porto': 'FC Porto',
  sporting: 'Sporting CP',
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
  'al ahli saudi': 'Al-Ahli Saudi',
  'al ahly': 'Al Ahly',
  'al-ahly': 'Al Ahly',
  zamalek: 'Zamalek',
  'raja casablanca': 'Raja Casablanca',
  'wydad casablanca': 'Wydad Casablanca',
  'cr belouizdad': 'CR Belouizdad',
  'js kabylie': 'JS Kabylie',
  'mc alger': 'MC Alger',
  'usm alger': 'USM Alger',
  'es setif': 'ES Setif',
  esperance: 'Esperance de Tunis',
  'inter miami': 'Inter Miami',
  'la galaxy': 'LA Galaxy',
  lafc: 'LAFC',
  celtic: 'Celtic',
  rangers: 'Rangers',
  besiktas: 'Besiktas',
  galatasaray: 'Galatasaray',
  fenerbahce: 'Fenerbahce',
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
    /plays as (?:a|an) [a-z- ]+ for (?:La Liga club |Premier League club |Serie A club |Bundesliga club |Ligue 1 club |Saudi Pro League club )?([A-Z][A-Za-z .\-']+?)(?:,|\.| and | \()/,
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
 *  GROQ EXTRACTOR (VERY STRICT)
 * ============================================================ */

const EXTRACTOR_SYSTEM_PROMPT = [
  'You are a football data extractor. Return ONLY valid JSON.',
  '',
  'INPUT:',
  '1. Player name.',
  '2. TheSportsDB description (may be old).',
  '3. Recent web search results (newest first).',
  '',
  '═══ RULE 1 — currentClub IS SACRED ═══',
  'currentClub = the club the player IS CURRENTLY PLAYING FOR,',
  'confirmed by a source. This is the MOST IMPORTANT field.',
  '',
  'You may ONLY set currentClub to a club if the source EXPLICITLY says:',
  '  ✓ "plays for X"',
  '  ✓ "is a X player"',
  '  ✓ "current club is X"',
  '  ✓ "signed for X" (with a date that is <= today and not future)',
  '  ✓ "joined X" (same condition)',
  '',
  'You MUST IGNORE a club if the source says:',
  '  ✗ "X is interested in him"',
  '  ✗ "X wants to sign him"',
  '  ✗ "X is linked with him"',
  '  ✗ "X is monitoring him"',
  '  ✗ "X is rumored to sign him"',
  '  ✗ "transfer news: X"',
  '  ✗ "could join X"',
  '  ✗ "X target"',
  '  ✗ "negotiating with X"',
  '  ✗ Any RUMOR or SPECULATION',
  '',
  'If you only find rumors → set currentClub to "" and let the',
  'backend use TheSportsDB description as fallback.',
  '',
  '═══ RULE 2 — lastTransfer ═══',
  'Format: "FromClub to ToClub (Year)".',
  'Only the transfer that brought him to the CURRENT club.',
  'Do NOT combine transfers from different years.',
  'If unsure, leave "".',
  '',
  '═══ RULE 3 — latestNews ═══',
  'ONE short sentence in ENGLISH (max 200 chars).',
  'Use the NEWEST search result. Not a rumor, not old news.',
  '',
  '═══ RULE 4 — trophies ═══',
  'Array of STRINGS. Major trophies only.',
  'Example: ["5x Champions League", "Euro 2016", "Nations League 2019"].',
  '',
  '═══ JSON SCHEMA ═══',
  '{',
  '  "currentClub": "",',
  '  "currentClubCountry": "",',
  '  "lastTransfer": "",',
  '  "marketValue": "",',
  '  "stats": {"goals":"","assists":"","appearances":"","season":""},',
  '  "trophies": [],',
  '  "latestNews": ""',
  '}',
  '',
  'Return ONLY JSON. No markdown. No explanation.',
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
    `TheSportsDB description (may be old):\n${description.slice(0, 1500)}\n\n` +
    `Recent search results (newest first):\n\n${context}`;

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
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        parsed = JSON.parse(match[0]);
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
      currentClub: String(parsed.currentClub ?? '').trim(),
      currentClubCountry: String(parsed.currentClubCountry ?? '').trim(),
      lastTransfer: String(parsed.lastTransfer ?? '').trim(),
      marketValue: String(parsed.marketValue ?? '').trim(),
      stats: {
        goals: String(parsed?.stats?.goals ?? '').trim(),
        assists: String(parsed?.stats?.assists ?? '').trim(),
        appearances: String(parsed?.stats?.appearances ?? '').trim(),
        season: String(parsed?.stats?.season ?? '').trim(),
      },
      trophies,
      latestNews: String(parsed.latestNews ?? '').trim(),
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

  if (/[\u0600-\u06FF]/.test(englishName)) {
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

    /* ---- 2. Tavily ---- */
    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const currentMonth = new Date().toLocaleString('en-US', {
      month: 'long',
    });

    const searchQueries = [
      `${englishName} plays for ${currentYear}`,
      `${englishName} current club ${currentYear}`,
      `${englishName} official transfer ${currentYear} ${prevYear}`,
      `${englishName} latest news ${currentMonth} ${currentYear}`,
      `${englishName} contract ${currentYear}`,
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

    /* ---- 3. Groq extractor (strict) ---- */
    const freshData = await extractPlayerData(
      englishName,
      player?.strNationality ?? '',
      player?.strDescriptionEN ?? '',
      uniqueResults.slice(0, 10),
    );

    /* ---- 4. Fallback from description ---- */
    const fallback = extractFallbackFromDescription(
      player?.strDescriptionEN ?? '',
    );

    /* ---- 5. Final merge with STRICT rules ---- */
    const finalData = freshData ?? {
      currentClub: '',
      currentClubCountry: '',
      lastTransfer: '',
      marketValue: '',
      stats: { goals: '', assists: '', appearances: '', season: '' },
      trophies: [],
      latestNews: '',
    };

    if (!finalData.currentClub && fallback.currentClub) {
      finalData.currentClub = fallback.currentClub;
    }

    if (
      finalData.currentClub &&
      fallback.currentClub &&
      finalData.currentClub.toLowerCase() !==
        fallback.currentClub.toLowerCase()
    ) {
      finalData.currentClub = fallback.currentClub;
    }

    if (!finalData.lastTransfer && fallback.lastTransfer) {
      finalData.lastTransfer = fallback.lastTransfer;
    }

    if (!finalData.latestNews && fallback.latestNews) {
      finalData.latestNews = fallback.latestNews;
    }

    if (
      finalData.latestNews &&
      player?.strDescriptionEN &&
      finalData.latestNews.trim().slice(0, 60).toLowerCase() ===
        String(player.strDescriptionEN).trim().slice(0, 60).toLowerCase()
    ) {
      finalData.latestNews = '';
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
      current: finalData,
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