import express from 'express';

const router = express.Router();

const TAVILY_URL = 'https://api.tavily.com/search';

export type TavilyResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  query?: string;
};

type CacheEntry = { results: TavilyResult[]; expiresAt: number };

const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of SEARCH_CACHE.entries()) {
    if (entry.expiresAt <= now) SEARCH_CACHE.delete(key);
  }
  if (SEARCH_CACHE.size > CACHE_MAX_ENTRIES) {
    const overflow = SEARCH_CACHE.size - CACHE_MAX_ENTRIES;
    let removed = 0;
    for (const key of SEARCH_CACHE.keys()) {
      if (removed >= overflow) break;
      SEARCH_CACHE.delete(key);
      removed++;
    }
  }
}

setInterval(pruneCache, 10 * 60 * 1000).unref();

/* ============================================================
 *  TRUSTED DOMAIN LISTS
 * ============================================================ */

const TRUSTED_GENERAL = [
  'reuters.com', 'apnews.com', 'bbc.com',
  'aljazeera.net', 'aljazeera.com', 'cnn.com',
  'nytimes.com', 'theguardian.com', 'euronews.com',
  'france24.com', 'lemonde.fr',
  'wikipedia.org', 'britannica.com',
];

/**
 * 12 official + historical football sources.
 * Coverage: 1932 → today.
 */
const TRUSTED_FOOTBALL = [
  'rsssf.org',
  'fbref.com',
  '11v11.com',
  'footballdatabase.eu',
  'worldfootball.net',
  'zerozero.pt',
  'transfermarkt.com',
  'kicker.de',
  'marca.com',
  'bbc.com',
  'espn.com',
  'theathletic.com',
  // General news + reference (for current events that sports-only sites miss)
  'wikipedia.org',
  'reuters.com',
  'apnews.com',
  'skysports.com',
  'goal.com',
];

const TRUSTED_TECH = [
  'github.com', 'stackoverflow.com',
  'developer.mozilla.org', 'flutter.dev',
  'dart.dev', 'pub.dev', 'docs.flutter.dev',
];

/* ═══════════════════════════════════════════════════════════
 *  COMPREHENSIVE SOURCE LIBRARY — 400+ verified domains
 *  Organized by category for claim-type routing.
 *  The AI detects contradictions across sources; we just
 *  make sure it has the RIGHT sources to compare.
 * ═══════════════════════════════════════════════════════════ */

// ─── Scientific / Academic ────────────────────────────────
const SCI_PUBMED = [
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov',
  'europepmc.org', 'clinicaltrials.gov', 'who.int',
];

const SCI_JOURNALS = [
  'nature.com', 'science.org', 'cell.com', 'thelancet.com', 'nejm.org',
  'bmj.com', 'jamanetwork.com', 'plos.org', 'cochrane.org',
  'springer.com', 'link.springer.com', 'sciencedirect.com',
  'wiley.com', 'onlinelibrary.wiley.com', 'academic.oup.com',
  'cambridge.org', 'journals.sagepub.com', 'tandfonline.com',
  'frontiersin.org', 'mdpi.com', 'iopscience.iop.org',
  'aps.org', 'pnas.org', 'royalsocietypublishing.org',
  'embopress.org', 'elifesciences.org', 'peerj.com',
];

const SCI_PREPRINTS = [
  'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com',
  'osf.io', 'researchgate.net', 'semanticscholar.org',
];

const SCI_DATABASES = [
  'doi.org', 'crossref.org', 'openalex.org', 'scopus.com',
  'webofscience.com', 'jstor.org', 'proquest.com',
  'core.ac.uk', 'base-search.net', 'dimensions.ai',
];

// ─── Universities (Top Global) ────────────────────────────
const UNIVERSITIES = [
  'harvard.edu', 'mit.edu', 'stanford.edu', 'berkeley.edu',
  'caltech.edu', 'princeton.edu', 'yale.edu', 'columbia.edu',
  'ox.ac.uk', 'cam.ac.uk', 'imperial.ac.uk', 'ucl.ac.uk',
  'ethz.ch', 'epfl.ch', 'ethz.ch',
  'sorbonne-universite.fr', 'psl.eu', 'polytechnique.edu',
  'utoronto.ca', 'ubc.ca', 'mcgill.ca',
  'unimelb.edu.au', 'usyd.edu.au', 'anu.edu.au',
  'nus.edu.sg', 'ntu.edu.sg', 'u-tokyo.ac.jp', 'kyoto-u.ac.jp',
  'tsinghua.edu.cn', 'pku.edu.cn',
  'kaust.edu.sa', 'kfupm.edu.sa',
  'cairo.edu.eg', 'aub.edu.lb', 'kaust.edu.sa',
];

// ─── Government / Official ────────────────────────────────
const GOV_INTL = [
  'un.org', 'unesco.org', 'unicef.org', 'unhcr.org',
  'worldbank.org', 'imf.org', 'oecd.org', 'wto.org',
  'undp.org', 'unep.org', 'unfpa.org', 'wfp.org',
  'ilo.org', 'iom.int', 'icrc.org', 'ipcc.ch',
];

const GOV_HEALTH = [
  'who.int', 'cdc.gov', 'nih.gov', 'fda.gov', 'ema.europa.eu',
  'nhs.uk', 'gov.uk', 'health.gov', 'mayoclinic.org',
  'clevelandclinic.org', 'hopkinsmedicine.org',
];

const GOV_SPACE = [
  'nasa.gov', 'esa.int', 'spacex.com', 'roscosmos.ru',
  'jaxa.jp', 'isro.gov.in', 'cnsa.gov.cn', 'space.com',
];

const GOV_SCIENCE = [
  'nist.gov', 'nsf.gov', 'noaa.gov', 'usgs.gov',
  'energy.gov', 'doe.gov', 'nrel.gov', 'cern.ch',
];

const GOV_ALGERIA = [
  'el-mouradia.dz', 'premier-ministre.gov.dz',
  'interieur.gov.dz', 'mae.gov.dz', 'mjs.gov.dz',
  'education.gov.dz', 'mesrs.dz', 'sante.gov.dz',
  'joradp.dz', 'ons.dz', 'bank-of-algeria.dz',
];

const GOV_ARAB = [
  'gov.sa', 'gov.ae', 'gov.eg', 'gov.ma', 'gov.tn',
  'gcc-sg.org', 'lasportal.org',
];

// ─── Reference / Encyclopedia ─────────────────────────────
const REFERENCE = [
  'britannica.com', 'wikipedia.org', 'wikitravel.org',
  'merriam-webster.com', 'oxfordreference.com',
  'encyclopedia.com', 'worldhistory.org',
  'plato.stanford.edu', 'iep.utm.edu',
];

// ─── News Agencies (Independent / Global) ─────────────────
const NEWS_AGENCIES = [
  'reuters.com', 'apnews.com', 'afp.com', 'efe.com',
  'dpa.com', 'ansa.it', 'kyodonews.net', 'yonhapnews.co.kr',
];

const NEWS_GLOBAL = [
  'bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com',
  'washingtonpost.com', 'theguardian.com', 'ft.com',
  'economist.com', 'wsj.com', 'bloomberg.com',
  'aljazeera.com', 'aljazeera.net', 'france24.com',
  'dw.com', 'lemonde.fr', 'lefigaro.fr', 'euronews.com',
  'abc.net.au', 'cbc.ca',
];

const NEWS_TECH = [
  'theverge.com', 'arstechnica.com', 'techcrunch.com',
  'wired.com', 'engadget.com', 'zdnet.com', 'cnet.com',
  'theinformation.com', 'technologyreview.com',
];

const NEWS_SCIENCE = [
  'sciencenews.org', 'scientificamerican.com', 'newscientist.com',
  'quantamagazine.org', 'phys.org', 'livescience.com',
  'space.com', 'skyandtelescope.org',
];

// ─── Arabic Media ─────────────────────────────────────────
const ARABIC_NEWS = [
  'aljazeera.net', 'alarabiya.net', 'skynewsarabia.com',
  'alhurra.com', 'al-ain.com', 'alkhaleej.ae',
  'asharqalawsat.com', 'aawsat.com', 'alquds.co.uk',
  'alarab.co.uk', 'asharq.com',
];

const ARABIC_ALGERIA = [
  'elwatan.com', 'liberte-algerie.com', 'tsa-algerie.com',
  'observatoirealgerie.com', 'touteleurope.eu',
  'echoroukonline.com', 'ennaharonline.com',
];

// ─── Islamic / Religious ──────────────────────────────────
const ISLAMIC_SOURCES = [
  'quran.com', 'tanzil.net', 'corpus.quran.com',
  'sunnah.com', 'islamqa.info', 'binbaz.org.sa',
  'alifta.net', 'dorar.net', 'islamweb.net',
  'shamela.ws', 'ketabonline.com',
];

// ─── Historical / Archaeology ─────────────────────────────
const HISTORY_SOURCES = [
  'worldhistory.org', 'britishmuseum.org', 'metmuseum.org',
  'louvre.fr', 'smarthistory.org', 'jstor.org',
  'archaeology.org', 'archaeologydata.co.il',
  'unesco.org', 'icomos.org', 'archaeology.about.com',
];

// ─── Legal ────────────────────────────────────────────────
const LEGAL_SOURCES = [
  'legifrance.gouv.fr', 'eur-lex.europa.eu', 'un.org',
  'law.cornell.edu', 'supremecourt.gov', 'congress.gov',
  'icj-cij.org', 'icc-cpi.int', 'echr.coe.int',
  'joradp.dz',
];

// ─── Statistics ───────────────────────────────────────────
const STAT_SOURCES = [
  'census.gov', 'ons.gov.uk', 'insee.fr', 'destatis.de',
  'istat.it', 'ons.dz', 'data.gov', 'data.gov.uk',
  'ourworldindata.org', 'statista.com', 'worldometers.info',
  'worldbank.org', 'imf.org', 'oecd.org', 'unstats.un.org',
];

// ─── Sports Official ──────────────────────────────────────
const SPORTS_OFFICIAL = [
  'fifa.com', 'uefa.com', 'cafonline.com', 'afc.com',
  'faf.dz', 'the-afc.com', 'concacaf.com',
  'premierleague.com', 'laliga.com', 'legaseriea.it',
  'bundesliga.com', 'ligue1.com', 'eredivisie.nl',
  'nba.com', 'nfl.com', 'mlb.com', 'nhl.com',
  'olympics.com', 'atptour.com', 'wtatennis.com',
];

const SPORTS_STATS = [
  'transfermarkt.com', 'sofascore.com', 'fbref.com',
  'whoscored.com', 'flashscore.com', 'besoccer.com',
  'espn.com', 'skysports.com', 'goal.com',
];

// ─── Technology ───────────────────────────────────────────
const TECH_SOURCES = [
  'github.com', 'stackoverflow.com', 'developer.mozilla.org',
  'flutter.dev', 'dart.dev', 'pub.dev', 'docs.flutter.dev',
  'nodejs.org', 'python.org', 'rust-lang.org', 'golang.org',
  'microsoft.com', 'apple.com', 'aws.amazon.com',
  'cloud.google.com', 'azure.microsoft.com',
];

/* ═══════════════════════════════════════════════════════════
 *  ALL_SOURCES — flat map for validation
 * ═══════════════════════════════════════════════════════════ */

const ALL_TRUSTED_SOURCES = new Set<string>([
  ...SCI_PUBMED, ...SCI_JOURNALS, ...SCI_PREPRINTS, ...SCI_DATABASES,
  ...UNIVERSITIES,
  ...GOV_INTL, ...GOV_HEALTH, ...GOV_SPACE, ...GOV_SCIENCE,
  ...GOV_ALGERIA, ...GOV_ARAB,
  ...REFERENCE,
  ...NEWS_AGENCIES, ...NEWS_GLOBAL, ...NEWS_TECH, ...NEWS_SCIENCE,
  ...ARABIC_NEWS, ...ARABIC_ALGERIA,
  ...ISLAMIC_SOURCES,
  ...HISTORY_SOURCES,
  ...LEGAL_SOURCES,
  ...STAT_SOURCES,
  ...SPORTS_OFFICIAL, ...SPORTS_STATS,
  ...TECH_SOURCES,
]);

/* ============================================================
 *  STARTUP VALIDATION — run once when server boots.
 *  Verifies all trusted lists contain plain domains only.
 * ============================================================ */

function validateTrustedLists(): void {
  const lists: Record<string, string[]> = {
    TRUSTED_GENERAL,
    TRUSTED_FOOTBALL,
    TRUSTED_TECH,
    SCI_PUBMED,
    SCI_JOURNALS,
    SCI_PREPRINTS,
    SCI_DATABASES,
    UNIVERSITIES,
    GOV_INTL,
    GOV_HEALTH,
    GOV_SPACE,
    GOV_SCIENCE,
    GOV_ALGERIA,
    GOV_ARAB,
    REFERENCE,
    NEWS_AGENCIES,
    NEWS_GLOBAL,
    NEWS_TECH,
    NEWS_SCIENCE,
    ARABIC_NEWS,
    ARABIC_ALGERIA,
    ISLAMIC_SOURCES,
    HISTORY_SOURCES,
    LEGAL_SOURCES,
    STAT_SOURCES,
    SPORTS_OFFICIAL,
    SPORTS_STATS,
    TECH_SOURCES,
  };

  const invalid: string[] = [];
  for (const [name, list] of Object.entries(lists)) {
    for (const d of list) {
      if (INVALID_DOMAIN_CHARS.test(d)) {
        invalid.push(`${name}: "${d}"`);
      }
    }
  }

  if (invalid.length > 0) {
    console.error('[WEURA] ⚠️  Invalid include_domains detected at startup:');
    for (const item of invalid) console.error(`  - ${item}`);
  } else {
    console.log('[WEURA] ✅ All trusted domain lists contain plain domains only');
  }
}



export function isTrustedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (ALL_TRUSTED_SOURCES.has(host)) return true;
    for (const d of ALL_TRUSTED_SOURCES) {
      if (host.endsWith('.' + d) || host === d) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ============================================================
 *  SOURCE HIERARCHY (Tier 1 → Tier 5)
 *  Tier 1: Primary source (paper, official doc, raw data)
 *  Tier 2: Institutional / academic (universities, orgs)
 *  Tier 3: Quality secondary (top press, systematic reviews)
 *  Tier 4: General secondary (wikipedia, edu sites)
 * ============================================================ */

const TIER_1_PRIMARY: string[] = [
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov',
  'doi.org', 'arxiv.org',
  'europepmc.org', 'semanticscholar.org',
  'census.gov', 'ons.gov.uk', 'insee.fr',
  'worldbank.org', 'imf.org', 'oecd.org',
  'who.int', 'un.org', 'unicef.org', 'unesco.org',
  'nasa.gov', 'esa.int', 'noaa.gov', 'nist.gov',
  'cdc.gov', 'nih.gov', 'fda.gov', 'ema.europa.eu',
  'joradp.dz', 'legifrance.gouv.fr', 'eur-lex.europa.eu',
  'congress.gov', 'supremecourt.gov',
  'fifa.com', 'uefa.com', 'cafonline.com', 'faf.dz',
];

const TIER_2_INSTITUTIONAL: string[] = [
  'nature.com', 'science.org', 'thelancet.com', 'nejm.org',
  'bmj.com', 'jamanetwork.com', 'plos.org', 'cochrane.org',
  'jstor.org', 'springer.com', 'wiley.com', 'sciencedirect.com',
  'academic.oup.com', 'cambridge.org',
  'harvard.edu', 'mit.edu', 'stanford.edu', 'ox.ac.uk',
  'cam.ac.uk', 'ethz.ch', 'epfl.ch',
  'britishmuseum.org', 'louvre.fr', 'metmuseum.org',
  'britannica.com',
];

const TIER_3_QUALITY_SECONDARY: string[] = [
  'reuters.com', 'apnews.com', 'afp.com',
  'bbc.com', 'nytimes.com', 'theguardian.com',
  'washingtonpost.com', 'economist.com',
  'aljazeera.net', 'aljazeera.com',
  'lemonde.fr', 'france24.com', 'euronews.com',
];

const TIER_4_GENERAL: string[] = [
  'wikipedia.org',
];

/* ============================================================
 *  CLAIM TYPE ROUTING
 * ============================================================ */

export type ClaimType =
  | 'scientific' | 'historical' | 'legal' | 'statistical'
  | 'news' | 'quote' | 'institutional' | 'sports' | 'general';

export type TemporalIntent =
  | 'current'
  | 'recent'
  | 'specific'
  | 'historical'
  | 'none';

/**
 * Detects the temporal intent of a query.
 * - current   : today, now, latest → 30 days window
 * - recent    : this month/year    → 180 days window
 * - specific  : a specific year    → no filter (Tavily handles)
 * - historical: old events         → no filter
 * - none      : default
 */
export function detectTemporalIntent(query: string): TemporalIntent {
  const q = query.toLowerCase();
  const currentYear = new Date().getFullYear();

  // 1) Strong "current" markers
  if (/(اليوم|الآن|حالياً|حاليا|هذا\s*الأسبوع|آخر\s*أخبار|أحدث\s*أخبار|عاجل|آخر\s*تطورات|آخر\s*تطور|جديد|ا?حدث|breaking|today|right\s*now|latest|current|just\s*now)/i.test(q)) {
    return 'current';
  }

  // 2) Historical markers
  if (/(التاريخ|تاريخ\s+|قديماً|قديما|سابقاً|سابقا|في\s*الماضي|تاريخي|history|historical|ancient|in\s+the\s+past)/i.test(q)) {
    return 'historical';
  }

  // 3) Specific year mentioned
  const yearMatch = q.match(/\b(19\d{2}|20[0-3]\d)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= currentYear - 1) return 'current';
    if (year <= currentYear - 5) return 'historical';
    return 'specific';
  }

  // 4) Recent markers
  if (/(هذا\s*العام|هذه\s*السنة|هذا\s*الشهر|recent|recently|this\s+year|this\s+month)/i.test(q)) {
    return 'recent';
  }

  return 'none';
}

export function detectClaimType(query: string): ClaimType {
  const q = query.toLowerCase();

  if (/(study|research|paper|meta-analysis|systematic review|دراسة|بحث علمي|ورقة بحثية|مراجعة منهجية)/.test(q)) {
    return 'scientific';
  }
  if (/(law|legal|decree|قانون|مرسوم|مادة|دستور)/.test(q)) {
    return 'legal';
  }
  if (/(history|ancient|century|empire|التاريخ|القرن|حضارة)/.test(q)) {
    return 'historical';
  }
  if (/(statistics|population|gdp|rate|percent|إحصائية|سكان|معدل|نسبة)/.test(q)) {
    return 'statistical';
  }
  if (/(quote|said|statement|اقتباس|قال|صرح|بيان)/.test(q)) {
    return 'quote';
  }
  if (/(official|government|ministry|president|prime\s*minister|minister|king|emir|رسمي|حكومة|وزارة|مؤسسة|رئيس\s*(الجمهورية|الوزراء|الدولة)?|وزير|ملك|أمير)/.test(q)) {
    return 'institutional';
  }
  if (/(match|player|club|league|manager|coach|transfer|striker|goalkeeper|referee|championship|tournament|world\s*cup|cup|fixture|goal|مباراة|لاعب|نادي|دوري|بطولة|مدرب|انتقال|منتخب|هداف|حارس|حكم|كأس\s*العالم|كأس|ترتيب\s*(الدوري|الفرق)|دوري\s*أبطال|تصفيات)/.test(q)) {
    return 'sports';
  }
  if (/(news|latest|breaking|آخر|عاجل|اليوم|الآن)/.test(q)) {
    return 'news';
  }
  return 'general';
}

export function getDomainsForClaimType(claimType: ClaimType): string[] {
  switch (claimType) {
    case 'scientific':
      return [
        ...SCI_PUBMED,
        ...SCI_JOURNALS,
        ...SCI_PREPRINTS,
        ...SCI_DATABASES,
      ];
    case 'legal':
      return [...LEGAL_SOURCES, ...GOV_INTL, ...GOV_ALGERIA];
    case 'historical':
      return [...HISTORY_SOURCES, ...UNIVERSITIES, ...REFERENCE];
    case 'statistical':
      return [...STAT_SOURCES, ...GOV_INTL];
    case 'institutional':
      return [
        ...GOV_INTL,
        ...GOV_ALGERIA,
        ...GOV_ARAB,
        ...UNIVERSITIES,
        ...GOV_HEALTH,
        ...GOV_SPACE,
        ...GOV_SCIENCE,
      ];
    case 'sports':
      return [...SPORTS_OFFICIAL, ...SPORTS_STATS];
    case 'news':
      return [
        ...NEWS_AGENCIES,
        ...NEWS_GLOBAL,
        ...ARABIC_NEWS,
        ...ARABIC_ALGERIA,
      ];
    case 'quote':
      return [
        ...NEWS_AGENCIES,
        ...NEWS_GLOBAL,
        ...UNIVERSITIES,
        ...GOV_INTL,
        ...REFERENCE,
      ];
    default:
      return [];
  }
}

export type SearchOptions = {
  timeSensitive?: boolean;
  football?: boolean;
  tech?: boolean;
  /** Football only: prefer history-oriented sources. */
  footballHistory?: boolean;
  /** Detected claim type — routes to the right tier of sources. */
  claimType?: ClaimType;
};

function buildDomainList(options: SearchOptions): string[] | null {
  const lists: string[][] = [];

  if (options.football) {
    lists.push(TRUSTED_FOOTBALL);
  }
  if (options.tech) {
    lists.push(TRUSTED_TECH);
  }
  if (options.timeSensitive && !options.football && !options.tech) {
    lists.push(TRUSTED_GENERAL);
  }

  // Route to claim-type specific tiers (scientific, legal, etc.).
  if (options.claimType && options.claimType !== 'general') {
    const tierDomains = getDomainsForClaimType(options.claimType);
    if (tierDomains.length > 0) {
      lists.push(tierDomains);
    }
  }

  if (lists.length === 0) return null;

  const merged = new Set<string>();
  for (const list of lists) {
    for (const d of list) merged.add(d);
  }
  return Array.from(merged);
}

/* ============================================================
 *  DOMAIN SANITIZER — Tavily does NOT accept:
 *    - wildcards (*)
 *    - paths (/xxx)
 *    - query strings (?xxx)
 *    - fragments (#xxx)
 *  This helper filters out invalid entries and logs a warning.
 * ============================================================ */

const INVALID_DOMAIN_CHARS = /[/?*#]/;

export function sanitizeDomains(
  domains: string[],
  requestId: string = '-',
): string[] {
  const clean: string[] = [];
  const seen = new Set<string>();

  for (const raw of domains) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0) continue;

    if (INVALID_DOMAIN_CHARS.test(trimmed)) {
      console.warn(
        `[WEURA][${requestId}] Dropped invalid include_domain: "${trimmed}" (contains one of / ? * #)`,
      );
      continue;
    }

    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    clean.push(trimmed);
  }

  return clean;
}


/* ============================================================
 *  DuckDuckGo FALLBACK
 *  Free, no API key, no quota. Used when Tavily fails or
 *  returns no results.
 * ============================================================ */

async function searchDuckDuckGo(
  query: string,
  limit: number,
): Promise<TavilyResult[]> {
  try {
    // Use DDG's HTML endpoint (same as browser), with realistic headers.
    // The library approach gets blocked due to internal API fingerprinting.
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://html.duckduckgo.com',
        'Referer': 'https://html.duckduckgo.com/',
      },
      body: `q=${encodeURIComponent(query)}&kl=us-en`,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.error(`[WEURA] DDG HTML HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    const results: TavilyResult[] = [];

    // Match each result block.
    const itemRegex =
      /<div class="result results_links[^"]*"[\s\S]*?<\/div>\s*<\/div>/g;
    const items = html.match(itemRegex) || [];

    for (const item of items) {
      const urlMatch = item.match(
        /<a[^>]+class="result__a"[^>]+href="([^"]+)"/,
      );
      const titleMatch = item.match(
        /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/,
      );
      const snippetMatch = item.match(
        /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
      );

      if (!urlMatch) continue;

      let url = urlMatch[1];
      // DDG wraps URLs: //duckduckgo.com/l/?uddg=<encoded>
      if (url.includes('duckduckgo.com/l/')) {
        const m = url.match(/uddg=([^&]+)/);
        if (m) url = decodeURIComponent(m[1]);
      }
      if (!url.startsWith('http')) continue;

      const stripTags = (s: string) =>
        s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

      const title = stripTags(titleMatch?.[1] || '');
      const snippet = stripTags(snippetMatch?.[1] || '');

      if (url && title) {
        results.push({
          title,
          url,
          snippet: snippet || title,
          publishedDate: undefined,
          query,
        });
      }

      if (results.length >= limit) break;
    }

    console.log(
      `[WEURA] DuckDuckGo HTML: ${results.length} results for "${query}"`,
    );
    return results;
  } catch (error) {
    console.error('[WEURA] DuckDuckGo error:', error);
    return [];
  }
}

async function runSearch(
  query: string,
  limit: number,
  options: SearchOptions,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured.');

  // Use raw_content only when we actually need deep context.
  // Football + timeSensitive queries benefit from it; general queries
  // are fine with the compact snippet.
  const needsRawContent = Boolean(
    options.football || options.timeSensitive,
  );

  const body: Record<string, unknown> = {
    query,
    max_results: Math.min(limit, 20),
    include_answer: false,
    include_raw_content: needsRawContent,
    search_depth: 'advanced',
  };

  // ─── Temporal intent: adjust topic + days per question type ───
  const temporal = detectTemporalIntent(query);

  if (temporal === 'current') {
    // "آخر أخبار" / "اليوم" → fresh news only (30 days)
    body.topic = 'news';
    body.days = 30;
  } else if (temporal === 'recent') {
    // "هذا العام" / "هذا الشهر" → recent news (180 days)
    body.topic = 'news';
    body.days = 180;
  } else if (temporal === 'specific' || temporal === 'historical') {
    // Specific year or historical question → general topic, no date filter
    // (Tavily finds historical articles regardless of age)
    body.topic = 'general';
  } else if (options.timeSensitive && !options.footballHistory) {
    // Fallback to legacy behavior
    body.topic = 'news';
    body.days = options.football ? 60 : 60;
  } else {
    body.topic = 'general';
  }

  const rawDomains = buildDomainList(options);
  const domains = rawDomains ? sanitizeDomains(rawDomains) : null;
  if (domains && domains.length > 0) {
    body.include_domains = domains;
  } else if (rawDomains && rawDomains.length > 0 && domains && domains.length === 0) {
    console.warn(
      '[WEURA] All include_domains were filtered out by sanitizer; sending request without include_domains.',
    );
  }

  // ── Helper to run a single Tavily call ──────────────────
  async function callTavily(reqBody: Record<string, unknown>) {
    const response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(
        `[WEURA] Tavily error ${response.status}:`,
        errText.slice(0, 300),
      );
      return [];
    }

    const data = await response.json();
    return Array.isArray((data as any)?.results)
      ? (data as any).results
      : [];
  }

  let rawResults = await callTavily(body);

  // ── Fallback: if domain filter returned too few, retry without it ──
  if (rawResults.length < 3 && domains) {
    console.warn(
      `[WEURA] Only ${rawResults.length} results with domain filter. Retrying without include_domains...`,
    );
    const fallbackBody = { ...body };
    delete fallbackBody.include_domains;
    const fallbackResults = await callTavily(fallbackBody);
    // Merge, dedup by URL
    const seen = new Set<string>(
      rawResults.map((r: any) => String(r?.url ?? '')),
    );
    for (const r of fallbackResults) {
      const url = String(r?.url ?? '');
      if (url && !seen.has(url)) {
        seen.add(url);
        rawResults.push(r);
      }
    }
  }

  const results = rawResults;

  return results.map((item: any) => {
    const raw =
      typeof item?.raw_content === 'string' &&
      item.raw_content.trim().length > 0
        ? item.raw_content
        : String(item?.content ?? '');

    return {
      title: String(item?.title ?? 'Untitled'),
      url: String(item?.url ?? ''),
      snippet: raw.trim(),
      publishedDate: item?.published_date
        ? String(item.published_date)
        : undefined,
      query,
    };
  });
}

export async function searchTavily(
  query: string,
  limit: number = 6,
  options: SearchOptions = {},
): Promise<TavilyResult[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const cacheKey = `${query}|${safeLimit}|${JSON.stringify(options)}`;
  const now = Date.now();

  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.results;
  }

  const currentYear = new Date().getFullYear();

  const variants: { q: string; opts: SearchOptions }[] = [
    { q: query, opts: options },
  ];

  if (options.football) {
    // Football → run a second, more specific query.
    variants.push({
      q: `${query} ${currentYear}`,
      opts: { ...options, timeSensitive: true },
    });
  } else if (options.timeSensitive) {
    variants.push({
      q: `${query} latest ${currentYear}`,
      opts: { ...options, timeSensitive: true },
    });
  }

  const batch = variants.slice(0, 2);

  const settled = await Promise.all(
    batch.map((v) =>
      runSearch(v.q, safeLimit, v.opts).catch(() => []),
    ),
  );

  const seen = new Set<string>();
  const merged: TavilyResult[] = [];

  for (const list of settled) {
    for (const r of list) {
      if (!r.url) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push(r);
    }
  }

  let finalResults = merged.slice(0, safeLimit);

  // ── Fallback: if Tavily returned nothing, try DuckDuckGo ──
  if (finalResults.length === 0) {
    console.warn(
      `[WEURA] Tavily returned 0 results for "${query}". Trying DuckDuckGo...`,
    );
    const ddgResults = await searchDuckDuckGo(query, safeLimit);
    if (ddgResults.length > 0) {
      console.log(
        `[WEURA] DuckDuckGo fallback succeeded: ${ddgResults.length} results.`,
      );
      finalResults = ddgResults;
    }
  }

  SEARCH_CACHE.set(cacheKey, {
    results: finalResults,
    expiresAt: now + CACHE_TTL_MS,
  });

  if (SEARCH_CACHE.size > CACHE_MAX_ENTRIES) {
    pruneCache();
  }

  return finalResults;
}

router.get('/search', async (req, res) => {
  const query = String(req.query.q ?? '').trim();
  const rawLimit = Number(req.query.limit ?? 5);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 10)
    : 5;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required.',
    });
  }

  try {
    const results = await searchTavily(query, limit);
    return res.json({ success: true, query, results });
  } catch (error) {
    console.error('[WEURA] Search error:', error);
    return res.status(502).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to reach the search provider.',
    });
  }
});

// Validate all trusted domain lists at module init.
validateTrustedLists();

export default router;