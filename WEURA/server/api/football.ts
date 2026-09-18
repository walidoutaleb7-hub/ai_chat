import express from 'express';

const router = express.Router();

const RAPIDAPI_HOST =
  process.env.SPORTAPI_HOST?.trim() || 'sportapi7.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.SPORTAPI_KEY?.trim();

async function rapidGet(
  path: string,
  query: Record<string, string | number> = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  if (!RAPIDAPI_KEY) {
    return { ok: false, status: 503, data: null, error: 'SportAPI key missing' };
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, String(v));

  const url = `https://${RAPIDAPI_HOST}${path}${qs.toString() ? '?' + qs.toString() : ''}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw: raw.slice(0, 300) };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.message ?? `HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown',
    };
  }
}

/* ============================================================
 *  DEBUG v2 — literal sidebar names
 * ============================================================ */

router.get('/football/debug', async (req, res) => {
  const q = String(req.query.q ?? 'messi').trim();

  // Literal names as they appear in the sidebar.
  const candidates: string[] = [
    `/api_v1_search_players`,
    `/api_v1_player_details`,
    `/api_v1_player_careerstatistics`,
    `/api_v1_player_seasonstatistics`,
    // Maybe without leading "api_" or with different case
    `/v1_search_players`,
    `/search_players`,
    `/player_details`,
    // Maybe with a dot?
    `/api.v1.search.players`,
    // Maybe as query?
    `/?api_v1_search_players=${encodeURIComponent(q)}`,
    // Maybe the URL uses "football" prefix
    `/football/search/players`,
    `/football/players/search`,
    `/api/v1/football/players`,
    // Maybe underscores only in action part
    `/api/v1/player_search`,
    `/api/v1/players_search`,
    // Maybe "soccer" instead of "football"
    `/api/v1/soccer/players`,
    `/soccer/search/players`,
  ];

  const results: Array<{
    path: string;
    status: number;
    ok: boolean;
    preview?: any;
    error?: string;
  }> = [];

  for (const path of candidates) {
    const r = await rapidGet(path, {
      q,
      search: q,
      term: q,
      name: q,
      query: q,
    });

    results.push({
      path,
      status: r.status,
      ok: r.ok,
      preview: r.ok ? summarize(r.data) : undefined,
      error: r.ok ? undefined : (r.error ?? '').slice(0, 100),
    });
  }

  return res.json({
    query: q,
    host: RAPIDAPI_HOST,
    successCount: results.filter((r) => r.ok).length,
    results,
  });
});

function summarize(data: any): any {
  if (!data) return null;
  const list =
    data?.results ?? data?.data ?? data?.players ??
    data?.suggestions ?? data?.items ?? null;
  if (Array.isArray(list)) {
    return { listLength: list.length, firstItem: list[0] ?? null };
  }
  return { topKeys: Object.keys(data).slice(0, 10) };
}

/* ============================================================
 *  PLAYER BY ID — this pattern is CONFIRMED to work
 * ============================================================ */

router.get('/football/player', async (req, res) => {
  const id = String(req.query.id ?? '').trim();
  if (!id) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }
  const r = await rapidGet(`/api/v1/player/${encodeURIComponent(id)}`);
  return res.json({
    success: r.ok,
    id,
    data: r.data,
    error: r.ok ? undefined : r.error,
  });
});

export default router;