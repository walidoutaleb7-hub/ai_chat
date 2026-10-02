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
  if (/(official|government|ministry|رسمي|حكومة|وزارة|مؤسسة)/.test(q)) {
    return 'institutional';
  }
  if (/(match|player|club|league|مباراة|لاعب|نادي|دوري|بطولة)/.test(q)) {
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
        ...TIER_1_PRIMARY.filter((d) =>
          d.includes('pubmed') || d.includes('ncbi') ||
          d === 'doi.org' || d === 'arxiv.org' ||
          d.includes('europepmc') || d.includes('semantic'),
        ),
        ...TIER_2_INSTITUTIONAL.filter((d) =>
          d.includes('nature') || d.includes('science.org') ||
          d.includes('lancet') || d.includes('nejm') ||
          d.includes('bmj') || d.includes('plos') ||
          d.includes('cochrane') || d.includes('jstor'),
        ),
      ];
    case 'legal':
      return TIER_1_PRIMARY.filter((d) =>
        d.includes('joradp') || d.includes('legifrance') ||
        d.includes('eur-lex') || d.includes('congress') ||
        d.includes('supreme'),
      );
    case 'historical':
      return [
        ...TIER_2_INSTITUTIONAL.filter((d) =>
          d.includes('britishmuseum') || d.includes('louvre') ||
          d.includes('metmuseum') || d.includes('jstor'),
        ),
        ...TIER_1_PRIMARY.filter((d) =>
          d.includes('unesco') || d.includes('un.org'),
        ),
      ];
    case 'statistical':
      return TIER_1_PRIMARY.filter((d) =>
        d.includes('census') || d.includes('ons') ||
        d.includes('insee') || d.includes('worldbank') ||
        d.includes('imf') || d.includes('oecd'),
      );
    case 'institutional':
      return [...TIER_1_PRIMARY, ...TIER_2_INSTITUTIONAL];
    case 'sports':
      return TIER_1_PRIMARY.filter((d) =>
        d.includes('fifa') || d.includes('uefa') ||
        d.includes('caf') || d.includes('faf'),
      );
    case 'news':
      return TIER_3_QUALITY_SECONDARY;
    case 'quote':
      return [
        ...TIER_1_PRIMARY,
        ...TIER_2_INSTITUTIONAL,
        ...TIER_3_QUALITY_SECONDARY,
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
    max_results: Math.min(limit, 10),
    include_answer: false,
    include_raw_content: needsRawContent,
    search_depth: 'advanced',
  };

  if (options.timeSensitive && !options.footballHistory) {
    body.topic = 'news';
    body.days = options.football ? 90 : 180;
  } else {
    body.topic = 'general';
  }

  const domains = buildDomainList(options);
  if (domains) body.include_domains = domains;

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
  const safeLimit = Math.min(Math.max(limit, 1), 10);
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

export default router;