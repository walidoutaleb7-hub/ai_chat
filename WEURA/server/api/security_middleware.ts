import type { NextFunction, Request, Response } from 'express';
import {
  createRequestId,
  sanitizeMemory,
  sanitizeMessages,
  sanitizeMode,
  validateChatRequest,
} from '../security/security';

/* ============================================================
 *  REQUEST ID
 * ============================================================ */

/// Attaches a unique request ID to each incoming request.
/// Exposes it on `res.locals.requestId` and in the response header.
export function requestId(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = createRequestId();

  res.locals.requestId = id;
  res.setHeader('X-WEURA-Request-ID', id);

  next();
}

/* ============================================================
 *  CHAT VALIDATION
 * ============================================================ */

/// Validates and sanitizes the body of a `/api/chat` request.
///
/// - Strips any `system` role sent by the client.
/// - Sanitizes `memory` (optional string).
/// - Sanitizes `mode` (optional, whitelisted).
export function validateChatBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const result = validateChatRequest(req.body);

  if (!result.valid) {
    res.status(400).json({
      success: false,
      error: result.error ?? 'Invalid request.',
      requestId: res.locals.requestId,
    });
    return;
  }

  const body = req.body as {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    memory?: unknown;
    mode?: unknown;
  };

  req.body = {
    ...req.body,
    messages: sanitizeMessages(body.messages),
    memory: sanitizeMemory(body.memory),
    mode: sanitizeMode(body.mode),
  };

  next();
}

/* ============================================================
 *  BASIC RATE LIMIT (in-memory)
 * ============================================================ */

type RateEntry = {
  count: number;
  resetAt: number;
};

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_REQUESTS = 30; // 30 requests per minute per IP
const RATE_STORE = new Map<string, RateEntry>();
const RATE_MAX_IPS = 1000;

function pruneRateStore(): void {
  const now = Date.now();

  for (const [key, entry] of RATE_STORE.entries()) {
    if (entry.resetAt <= now) RATE_STORE.delete(key);
  }

  if (RATE_STORE.size > RATE_MAX_IPS) {
    const overflow = RATE_STORE.size - RATE_MAX_IPS;
    let removed = 0;
    for (const key of RATE_STORE.keys()) {
      if (removed >= overflow) break;
      RATE_STORE.delete(key);
      removed++;
    }
  }
}

setInterval(pruneRateStore, 2 * 60 * 1000).unref();

/// Simple in-memory rate limiter (per IP).
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // `trust proxy` must be enabled in index.ts for this to work on Render.
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const now = Date.now();
  const entry = RATE_STORE.get(ip);

  if (!entry || entry.resetAt <= now) {
    RATE_STORE.set(ip, {
      count: 1,
      resetAt: now + RATE_WINDOW_MS,
    });
    next();
    return;
  }

  entry.count += 1;

  if (entry.count > RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again shortly.',
      requestId: res.locals.requestId,
    });
    return;
  }

  next();
}