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
      return { ok: false, status: res.status, data, error: data?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : 'Unknown' };
  }
}

/* ============================================================
 *  DEBUG — try player-prefix search patterns
 * ============================================================ */

router.get('/football/debug', async (req, res) => {
  const q = String(req.query.q ?? 'messi').trim();

  // All candidate search paths — the /api/v1/player/ prefix is confirmed.
  const candidates: Array<{ path: string; query: Record<string, string> }> = [
    { path: `/api/v1/player/search`, query: { q } },
    { path: `/api/v1/player/search`, query: { name: q } },
    { path: `/api/v1/player/search`, query: { search: q } },
    { path: `/api/v1/player/find`, query: { q } },
    { path: `/api/v1/player/by-name`, query: { name: q } },
    { path: `/api/v1/player/lookup`, query: { name: q } },
    // Maybe player endpoint accepts a name as query (no /search)
    { path: `/api/v1/player`, query: { search: q } },
    { path: `/api/v1/player`, query: { name: q } },
    { path: `/api/v1/player`, query: { q } },
    // Maybe with trailing slash
    { path: `/api/v1/player/`, query: { search: q } },
    // Maybe under another prefix
    { path: `/api/v1/players/search`, query: { q } },
    { path: `/api/v1/player/all`, query: { search: q } },
  ];

  const results: Array<{
    path: string;
    query: Record<string, string>;
    status: number;
    ok: boolean;
    preview?: any;
    error?: string;
  }> = [];

  for (const c of candidates) {
    const r = await rapidGet(c.path, c.query);
    results.push({
      path: c.path,
      query: c.query,
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
 *  PLAYER BY ID — confirmed working
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

/* ============================================================
 *  PLAYER NEAR EVENTS — confirmed working
 * ============================================================ */

router.get('/football/player-near-events', async (req, res) => {
  const id = String(req.query.id ?? '').trim();
  if (!id) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }
  const r = await rapidGet(`/api/v1/player/${encodeURIComponent(id)}/near-events`);
  return res.json({
    success: r.ok,
    id,
    data: r.data,
    error: r.ok ? undefined : r.error,
  });
});

export default router;