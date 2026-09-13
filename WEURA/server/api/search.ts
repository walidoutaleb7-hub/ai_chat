import express from 'express';

const router = express.Router();

router.get('/search', async (req, res) => {
  const query = String(req.query.q ?? '').trim();

  const rawLimit = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 20)
    : 10;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required.',
    });
  }

  /*
   * WEURA deliberately does NOT generate fake search results.
   *
   * Connect a real search provider here later.
   * Expected provider output:
   *
   * {
   *   title: string,
   *   url: string,
   *   snippet?: string
   * }
   */

  const searchProvider = process.env.SEARCH_API_URL?.trim();

  if (!searchProvider) {
    return res.status(503).json({
      success: false,
      error:
        'Search provider is not configured. No fake results will be returned.',
      query,
      limit,
    });
  }

  try {
    const providerUrl = new URL(searchProvider);

    providerUrl.searchParams.set('q', query);
    providerUrl.searchParams.set('limit', String(limit));

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const searchApiKey =
      process.env.SEARCH_API_KEY?.trim();

    if (searchApiKey) {
      headers.Authorization = `Bearer ${searchApiKey}`;
    }

    const response = await fetch(providerUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `[WEURA] Search provider error ${response.status}:`,
        errorText,
      );

      return res.status(502).json({
        success: false,
        error: 'Search provider returned an error.',
      });
    }

    const data = await response.json();

    /*
     * Provider adapter:
     * Accept either:
     *   { results: [...] }
     * or
     *   [...] directly.
     */
    const rawResults = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
          ? data.results
          : [];

    const results = rawResults
        .map((item: any) => {
          const url = String(
            item?.url ??
                item?.link ??
                '',
          );

          return {
            title: String(
              item?.title ??
                  item?.name ??
                  'Untitled',
            ),
            url,
            snippet: String(
              item?.snippet ??
                  item?.description ??
                  '',
            ),
          };
        })
        .filter(
          (item: {
            title: string;
            url: string;
            snippet: string;
          }) => item.url.length > 0,
        )
        .slice(0, limit);

    return res.json({
      success: true,
      query,
      results,
    });
  } catch (error) {
    console.error(
      '[WEURA] Search error:',
      error,
    );

    return res.status(502).json({
      success: false,
      error: 'Unable to reach the search provider.',
    });
  }
});

export default router;