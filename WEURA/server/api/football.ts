import express from 'express';

const router = express.Router();

const RAPIDAPI_HOST =
  process.env.SPORTAPI_HOST?.trim() || 'sportapi7.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.SPORTAPI_KEY?.trim();

/* ============================================================
 *  CACHE
 * ============================================================ */

type CacheEntry = { data: any; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 200;

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of CACHE.entries()) {
    if (entry.expiresAt <= now) CACHE.delete(key);
  }
  if (CACHE.size > CACHE_MAX) {
    const overflow = CACHE.size - CACHE_MAX;
    let removed = 0;
    for (const key of CACHE.keys()) {
      if (removed >= overflow) break;
      CACHE.delete(key);
      removed++;
    }
  }
}

setInterval(pruneCache, 5 * 60 * 1000).unref();

/* ============================================================
 *  RAW HTTP
 * ============================================================ */

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
 *  DEBUG — tries many search paths and reports which works
 * ============================================================ */

router.get('/football/debug', async (req, res) => {
  const q = String(req.query.q ?? 'messi').trim();

  const candidates = [
    `/api/v1/search/players`,
    `/api/v1/search/player`,
    `/api/v1/search`,
    `/api/v1/players/search`,
    `/api/v1/players`,
    `/api/v1/player/search`,
    `/api/v1/search/players?q=${encodeURIComponent(q)}`,
  ];

  const results: Array<{
    path: string;
    status: number;
    ok: boolean;
    preview?: any;
    error?: string;
  }> = [];

  for (const path of candidates) {
    const basePath = path.split('?')[0];

    const r = await rapidGet(basePath, {
      q,
      search: q,
      term: q,
      name: q,
      query: q,
    });

    results.push({
      path: basePath,
      status: r.status,
      ok: r.ok,
      preview: r.ok
        ? summarize(r.data)
        : undefined,
      error: r.ok ? undefined : r.error,
    });
  }

  return res.json({
    query: q,
    host: RAPIDAPI_HOST,
    keyConfigured: Boolean(RAPIDAPI_KEY),
    results,
  });
});

function summarize(data: any): any {
  if (!data) return null;

  const list =
    data?.results ??
    data?.data ??
    data?.players ??
    data?.suggestions ??
    data?.items ??
    null;

  if (Array.isArray(list)) {
    return {
      listLength: list.length,
      firstItemPreview: list[0]
        ? Object.keys(list[0]).slice(0, 10)
        : null,
      firstItem: list[0] ?? null,
    };
  }

  return {
    topKeys: Object.keys(data).slice(0, 10),
  };
}

/* ============================================================
 *  HEALTH
 * ============================================================ */

router.get('/football/health', async (_req, res) => {
  if (!RAPIDAPI_KEY) {
    return res.json({ success: false, error: 'SPORTAPI_KEY missing' });
  }

  const r = await rapidGet('/api/v1/player/750');

  return res.json({
    success: r.ok,
    host: RAPIDAPI_HOST,
    status: r.status,
    error: r.ok ? undefined : r.error,
    note: 'Player/750 = Messi-like test ID',
  });
});

/* ============================================================
 *  PLAYER DETAILS
 * ============================================================ */

router.get('/football/player-details', async (req, res) => {
  const id = String(req.query.id ?? '').trim();
  if (!id) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }

  const cacheKey = `player-details:${id}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) return res.json(cached.data);

  const r = await rapidGet(`/api/v1/player/${encodeURIComponent(id)}`);

  const response = {
    success: r.ok,
    id,
    data: r.data,
    error: r.ok ? undefined : r.error,
  };

  if (r.ok) {
    CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
  }

  return res.json(response);
});

export default router;