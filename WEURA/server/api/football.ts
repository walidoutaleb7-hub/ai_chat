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
 *  HTTP HELPER — with automatic URL pattern fallback
 * ============================================================ */

/**
 * Tries multiple path patterns for the same logical endpoint.
 * e.g. "api_v1_player_details" → tries:
 *   /api/v1/player/details
 *   /api/v1/player_details
 *   /api/v1/playerdetails
 *   /player/details
 */
async function rapidTry(
  endpointId: string,
  query: Record<string, string | number> = {},
): Promise<{ ok: boolean; status: number; data: any; path?: string; error?: string }> {
  if (!RAPIDAPI_KEY) {
    return { ok: false, status: 503, data: null, error: 'SportAPI key is not configured.' };
  }

  // Strip leading "api_v1_" if present.
  let base = endpointId.toLowerCase().trim();
  if (base.startsWith('api_v1_')) base = base.slice('api_v1_'.length);
  if (base.startsWith('api_')) base = base.slice('api_'.length);

  // Generate candidate paths.
  const candidates = new Set<string>();

  // 1. Convert underscores → slashes: "player_details" → "player/details"
  const withSlashes = base.replace(/_/g, '/');
  candidates.add(`/api/v1/${withSlashes}`);
  candidates.add(`/${withSlashes}`);

  // 2. Keep underscores: "player_details" → "player_details"
  candidates.add(`/api/v1/${base}`);
  candidates.add(`/${base}`);

  // 3. Remove underscores entirely: "playerdetails"
  const noUnderscores = base.replace(/_/g, '');
  candidates.add(`/api/v1/${noUnderscores}`);
  candidates.add(`/${noUnderscores}`);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    qs.set(k, String(v));
  }
  const qsStr = qs.toString();

  let lastError = '';

  for (const path of candidates) {
    const url = `https://${RAPIDAPI_HOST}${path}${qsStr ? '?' + qsStr : ''}`;

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
        data = { raw: raw.slice(0, 500) };
      }

      if (res.ok) {
        console.log(`[WEURA] SportAPI OK: ${path}`);
        return { ok: true, status: res.status, data, path };
      }

      lastError = data?.message ?? `HTTP ${res.status} at ${path}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown';
    }
  }

  return { ok: false, status: 0, data: null, error: lastError || 'All paths failed' };
}

/* ============================================================
 *  ENDPOINT — /api/football/player-stats?name=X
 * ============================================================ */

router.get('/football/player-stats', async (req, res) => {
  const name = String(req.query.name ?? '').trim();
  if (!name) {
    return res.status(400).json({ success: false, error: 'name is required.' });
  }

  const cacheKey = `player-stats:${name.toLowerCase()}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  // Step 1: search player by name.
  const searchResult = await rapidTry('search_players', {
    search: name,
    term: name,
    q: name,
  });

  let playerId: string | number | null = null;
  let playerName = name;

  if (searchResult.ok && searchResult.data) {
    const list =
      searchResult.data?.results ??
      searchResult.data?.data ??
      searchResult.data?.players ??
      searchResult.data?.suggestions ??
      searchResult.data?.items ??
      [];

    if (Array.isArray(list) && list.length > 0) {
      const first = list[0];
      playerId =
        first?.id ??
        first?.player_id ??
        first?.playerId ??
        first?.key ??
        first?.entity?.id ??
        null;
      playerName =
        first?.name ??
        first?.player_name ??
        first?.displayName ??
        first?.entity?.name ??
        name;
    }
  }

  if (!playerId) {
    const response = {
      success: false,
      error: searchResult.error || 'Player not found in SportAPI.',
      searchedFor: name,
      tried: 'search_players',
    };
    CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
    return res.status(404).json(response);
  }

  // Step 2: player details + career stats.
  const [detailsRes, careerRes, seasonRes] = await Promise.all([
    rapidTry('player_details', { id: String(playerId) }),
    rapidTry('player_careerstatistics', { id: String(playerId) }),
    rapidTry('player_seasonstatistics', { id: String(playerId) }),
  ]);

  const response = {
    success: true,
    playerId,
    playerName,
    details: detailsRes.ok ? detailsRes.data : null,
    careerStats: careerRes.ok ? careerRes.data : null,
    seasonStats: seasonRes.ok ? seasonRes.data : null,
    _endpoints: {
      details: detailsRes.path ?? 'failed',
      careerStats: careerRes.path ?? 'failed',
      seasonStats: seasonRes.path ?? 'failed',
    },
  };

  CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
  return res.json(response);
});

/* ============================================================
 *  ENDPOINT — /api/football/health
 * ============================================================ */

router.get('/football/health', async (_req, res) => {
  if (!RAPIDAPI_KEY) {
    return res.json({ success: false, error: 'SPORTAPI_KEY is not configured.' });
  }

  const r = await rapidTry('search_players', { search: 'Messi', term: 'Messi' });

  return res.json({
    success: r.ok,
    host: RAPIDAPI_HOST,
    status: r.status,
    pathUsed: r.path ?? null,
    error: r.ok ? undefined : r.error,
  });
});

export default router;