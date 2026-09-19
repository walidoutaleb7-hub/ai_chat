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
 *
 * History / stats:
 *   rsssf.org            → archive from 1886
 *   fbref.com            → 100+ leagues, detailed stats
 *   11v11.com            → English football since 1920s
 *   footballdatabase.eu  → results from 1930s
 *   worldfootball.net    → from 1930s, friendlies
 *   zerozero.pt          → worldwide coverage
 *
 * Transfers / modern:
 *   transfermarkt.com    → biggest DB, values
 *
 * News / analysis:
 *   kicker.de            → German official
 *   marca.com            → Spanish reliable
 *   bbc.com              → global news
 *   espn.com             → news + analysis
 *   theathletic.com      → deep journalism
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
];

const TRUSTED_TECH = [
  'github.com', 'stackoverflow.com',
  'developer.mozilla.org', 'flutter.dev',
  'dart.dev', 'pub.dev', 'docs.flutter.dev',
];

export type SearchOptions = {
  timeSensitive?: boolean;
  football?: boolean;
  tech?: boolean;
  /** Football only: prefer history-oriented sources. */
  footballHistory?: boolean;
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

  if (lists.length === 0) return null;

  const merged = new Set<string>();
  for (const list of lists) {
    for (const d of list) merged.add(d);
  }
  return Array.from(merged);
}

async function runSearch(
  query: string,
  limit: number,
  options: SearchOptions,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured.');

  const body: Record<string, unknown> = {
    query,
    max_results: Math.min(limit, 10),
    include_answer: false,
    include_raw_content: true,
    search_depth: 'advanced',
  };

  if (options.timeSensitive && !options.footballHistory) {
    body.topic = 'news';
    body.days = options.football ? 365 : 180;
  } else {
    body.topic = 'general';
  }

  const domains = buildDomainList(options);
  if (domains) body.include_domains = domains;

  const response = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
  const results = Array.isArray((data as any)?.results)
    ? (data as any).results
    : [];

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

  const finalResults = merged.slice(0, safeLimit);

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