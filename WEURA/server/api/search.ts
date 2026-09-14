import express from 'express';

const router = express.Router();

const TAVILY_URL = 'https://api.tavily.com/search';

export type TavilyResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
};

/// Trusted football sites used to filter sports queries.
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

export async function searchTavily(
  query: string,
  limit: number = 5,
  options: {
    timeSensitive?: boolean;
    football?: boolean;
  } = {},
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured.');
  }

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

  // For football queries, restrict to trusted sports sites.
  if (options.football) {
    body.include_domains = FOOTBALL_DOMAINS;
  }

  const response = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[WEURA] Tavily error ${response.status}:`,
      errorText,
    );
    throw new Error('Search provider returned an error.');
  }

  const data = await response.json();

  const results = Array.isArray(data?.results)
    ? data.results
    : [];

  return results
    .map((item: any) => {
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
      };
    })
    .filter((item: TavilyResult) => item.url.length > 0)
    .slice(0, limit);
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

    return res.json({
      success: true,
      query,
      results,
    });
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
