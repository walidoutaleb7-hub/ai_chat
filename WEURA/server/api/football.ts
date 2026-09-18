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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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
 *  HTTP HELPER
 * ============================================================ */

async function rapidGet(
  path: string,
  query: Record<string, string | number> = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  if (!RAPIDAPI_KEY) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: 'SportAPI key is not configured.',
    };
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    qs.set(k, String(v));
  }

  const url = `https://${RAPIDAPI_HOST}${path}${qs.toString() ? '?' + qs.toString() : ''}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw: raw.slice(0, 500) };
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
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/* ============================================================
 *  ENDPOINT — /api/football/player-stats?name=X
 *
 *  Fetches statistics for a player.
 *  Tries multiple endpoint patterns because different
 *  RapidAPI providers use slightly different paths.
 * ============================================================ */

router.get('/football/player-stats', async (req, res) => {
  const name = String(req.query.name ?? '').trim();
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'name is required.',
    });
  }

  const cacheKey = `player-stats:${name.toLowerCase()}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  // Step 1: search for the player to get his ID.
  const attempts = [
    `/api/v1/search/players`,
    `/search/players`,
    `/players/search`,
  ];

  let playerId: string | number | null = null;
  let playerName = name;
  let lastError = '';

  for (const path of attempts) {
    const r = await rapidGet(path, { search: name, term: name, q: name });
    if (r.ok && r.data) {
      // Try to find the player id in different response shapes.
      const list =
        r.data?.results ??
        r.data?.data ??
        r.data?.players ??
        r.data?.suggestions ??
        [];

      if (Array.isArray(list) && list.length > 0) {
        const first = list[0];
        playerId =
          first?.id ??
          first?.player_id ??
          first?.playerId ??
          first?.key ??
          null;
        playerName =
          first?.name ??
          first?.player_name ??
          first?.displayName ??
          name;
        break;
      }
    } else {
      lastError = r.error ?? `HTTP ${r.status}`;
    }
  }

  if (!playerId) {
    const response = {
      success: false,
      error: lastError || 'Player not found in SportAPI.',
      searchedFor: name,
    };
    CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
    return res.status(404).json(response);
  }

  // Step 2: fetch stats for that player.
  const statsAttempts = [
    `/api/v1/players/${playerId}/statistics`,
    `/players/${playerId}/statistics`,
    `/player/${playerId}/stats`,
    `/player/${playerId}`,
  ];

  let stats: any = null;
  let statsError = '';

  for (const path of statsAttempts) {
    const r = await rapidGet(path);
    if (r.ok && r.data) {
      stats = r.data;
      break;
    }
    statsError = r.error ?? `HTTP ${r.status}`;
  }

  if (!stats) {
    const response = {
      success: false,
      error: statsError || 'Stats not available from SportAPI.',
      playerId,
      playerName,
    };
    CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
    return res.status(502).json(response);
  }

  // Step 3: normalize the stats response.
  // Try to extract goals / assists / appearances from common shapes.
  const normalized = extractStats(stats);

  const response = {
    success: true,
    playerId,
    playerName,
    stats: normalized,
    raw: stats,
  };

  CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
  return res.json(response);
});

/* ============================================================
 *  ENDPOINT — /api/football/standings?league=X
 * ============================================================ */

router.get('/football/standings', async (req, res) => {
  const league = String(req.query.league ?? '').trim();
  if (!league) {
    return res.status(400).json({
      success: false,
      error: 'league is required.',
    });
  }

  const cacheKey = `standings:${league.toLowerCase()}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  const attempts = [
    `/api/v1/standings`,
    `/standings`,
    `/api/v1/league/${league}/standings`,
    `/league/${league}/standings`,
  ];

  let lastError = '';

  for (const path of attempts) {
    const r = await rapidGet(path, { league, leagueId: league });
    if (r.ok && r.data) {
      const response = {
        success: true,
        league,
        standings: r.data,
      };
      CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
      return res.json(response);
    }
    lastError = r.error ?? `HTTP ${r.status}`;
  }

  return res.status(502).json({
    success: false,
    error: lastError || 'Standings not available.',
    league,
  });
});

/* ============================================================
 *  ENDPOINT — /api/football/fixtures?team=X
 * ============================================================ */

router.get('/football/fixtures', async (req, res) => {
  const team = String(req.query.team ?? '').trim();
  const date = String(req.query.date ?? '').trim();

  if (!team && !date) {
    return res.status(400).json({
      success: false,
      error: 'team or date is required.',
    });
  }

  const cacheKey = `fixtures:${team.toLowerCase()}:${date}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  const query: Record<string, string> = {};
  if (team) {
    query.team = team;
    query.teamName = team;
  }
  if (date) {
    query.date = date;
  }

  const attempts = [
    `/api/v1/fixtures`,
    `/fixtures`,
    `/api/v1/matches`,
    `/matches`,
  ];

  let lastError = '';

  for (const path of attempts) {
    const r = await rapidGet(path, query);
    if (r.ok && r.data) {
      const response = {
        success: true,
        team: team || null,
        date: date || null,
        fixtures: r.data,
      };
      CACHE.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL });
      return res.json(response);
    }
    lastError = r.error ?? `HTTP ${r.status}`;
  }

  return res.status(502).json({
    success: false,
    error: lastError || 'Fixtures not available.',
    team,
    date,
  });
});

/* ============================================================
 *  ENDPOINT — /api/football/health
 * ============================================================ */

router.get('/football/health', async (_req, res) => {
  if (!RAPIDAPI_KEY) {
    return res.json({
      success: false,
      error: 'SPORTAPI_KEY is not configured.',
    });
  }

  // Try a very light call to verify connectivity.
  const r = await rapidGet('/api/v1/search/players', { search: 'Messi' });

  return res.json({
    success: r.ok,
    host: RAPIDAPI_HOST,
    status: r.status,
    error: r.ok ? undefined : r.error,
  });
});

/* ============================================================
 *  NORMALIZER — extract common stats fields
 * ============================================================ */

function extractStats(raw: any): {
  appearances: string;
  goals: string;
  assists: string;
  season: string;
  yellowCards: string;
  redCards: string;
  minutesPlayed: string;
} {
  const out = {
    appearances: '',
    goals: '',
    assists: '',
    season: '',
    yellowCards: '',
    redCards: '',
    minutesPlayed: '',
  };

  if (!raw) return out;

  // Recursively search for the first object that looks like stats.
  const found = findStatsObject(raw);
  if (!found) return out;

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = found[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
    return '';
  };

  out.appearances = pick(
    'appearances',
    'appearances_count',
    'games',
    'matches',
    'played',
  );
  out.goals = pick('goals', 'goals_scored', 'goalsScored');
  out.assists = pick('assists', 'assists_count', 'goalsAssist');
  out.season = pick('season', 'season_name', 'seasonName');
  out.yellowCards = pick('yellowCards', 'yellow_cards', 'yellow');
  out.redCards = pick('redCards', 'red_cards', 'red');
  out.minutesPlayed = pick('minutesPlayed', 'minutes_played', 'minutes');

  return out;
}

function findStatsObject(obj: any, depth = 0): any {
  if (depth > 5 || !obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findStatsObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Does this object contain at least 2 known stat keys?
  const statKeys = [
    'goals',
    'assists',
    'appearances',
    'matches',
    'minutesPlayed',
    'yellowCards',
  ];
  let matches = 0;
  for (const k of statKeys) {
    if (k in obj) matches++;
  }
  if (matches >= 2) return obj;

  // Recurse into children.
  for (const value of Object.values(obj)) {
    const found = findStatsObject(value, depth + 1);
    if (found) return found;
  }

  return null;
}

export default router;