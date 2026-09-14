import express from 'express';

const router = express.Router();

const TAVILY_URL = 'https://api.tavily.com/search';

export type TavilyResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchTavily(
  query: string,
  limit: number = 5,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured.');
  }

  const response = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      search_depth: 'advanced',
      include_answer: false,
      include_raw_content: true,
    }),
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
      // Prefer raw_content when available (fuller text), fall back
      // to the short snippet.
      const raw =
        typeof item?.raw_content === 'string' &&
        item.raw_content.trim().length > 0
          ? item.raw_content
          : String(item?.content ?? '');

      return {
        title: String(item?.title ?? 'Untitled'),
        url: String(item?.url ?? ''),
        snippet: raw.trim(),
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
