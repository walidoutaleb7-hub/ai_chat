import type { NextFunction, Request, Response } from 'express';
import {
  createRequestId,
  sanitizeMessages,
  validateChatRequest,
} from '../security/security';

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const id = createRequestId();

  res.setHeader('X-WEURA-Request-ID', id);

  next();
}

export function validateChatBody(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const result = validateChatRequest(req.body);

  if (!result.valid) {
    return res.status(400).json({
      success: false,
      error: result.error ?? 'Invalid request.',
    });
  }

  const body = req.body as {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  };

  req.body = {
    ...req.body,
    messages: sanitizeMessages(body.messages),
  };

  next();
}