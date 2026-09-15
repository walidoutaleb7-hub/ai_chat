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

/// In-memory cache: same query within TTL → reuse.
type CacheEntry = {
  results: TavilyResult[];
  expiresAt: number;
};

const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const TRUSTED_GENERAL = [
  'reuters.com', 'apnews.com', 'bbc.com',
  'aljazeera.net', 'aljazeera.com', 'cnn.com',
  'nytimes.com', 'theguardian.com', 'euronews.com',
  'france24.com', 'lemonde.fr',
  'wikipedia.org', 'britannica.com',
  'espn.com', 'skysports.com', 'marca.com', 'as.com',
  'goal.com', 'transfermarkt.com', 'fotmob.com',
  'sofascore.com', 'fifa.com', 'uefa.com',
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
};

function buildDomainList(options: SearchOptions): string[] | null {
  const lists: string[][] = [];

  if (options.football) lists.push(TRUSTED_GENERAL);
  if (options.tech) lists.push(TRUSTED_TECH);
  if (options.timeSensitive) lists.push(TRUSTED_GENERAL);

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
    api_key: apiKey,
    query,
    max_results: limit,
    include_answer: false,
    include_raw_content: true,
    search_depth: 'advanced',
  };

  if (options.timeSensitive) {
    body.topic = 'news';
    body.days = 30;
  } else {
    body.topic = 'general';
  }

  const domains = buildDomainList(options);
  if (domains) body.include_domains = domains;

  const response = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      `[WEURA] Tavily error ${response.status}:`,
      errText.slice(0, 300),
    );
    return [];
  }

  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];

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

/// Runs the main query + (optionally) a time-sensitive variant.
/// Caches the merged results for 30 minutes.
export async function searchTavily(
  query: string,
  limit: number = 6,
  options: SearchOptions = {},
): Promise<TavilyResult[]> {
  const cacheKey = `${query}|${limit}|${JSON.stringify(options)}`;
  const now = Date.now();

  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    console.log(`[WEURA] Search cache HIT: "${query}"`);
    return cached.results;
  }

  // Variants to search in parallel.
  const variants: { q: string; opts: SearchOptions }[] = [
    { q: query, opts: options },
  ];

  // Add a time-sensitive variant for fresh news when the query is
  // about a person/event/current topic.
  if (options.timeSensitive) {
    variants.push({
      q: `${query} آخر التطورات 2026`,
      opts: { ...options, timeSensitive: true },
    });
  }

  // Cap at 2 variants to stay within rate limits.
  const batch = variants.slice(0, 2);

  const settled = await Promise.all(
    batch.map((v) =>
      runSearch(v.q, Math.max(limit, 3), v.opts).catch(() => []),
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

  const finalResults = merged.slice(0, Math.max(limit, 6));

  SEARCH_CACHE.set(cacheKey, {
    results: finalResults,
    expiresAt: now + CACHE_TTL_MS,
  });

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
