import crypto from 'node:crypto';

export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_LENGTH = 30_000;
export const MAX_MEMORY_LENGTH = 4_000;

export type SafeRole = 'system' | 'user' | 'assistant';

export type SafeMessage = {
  role: SafeRole;
  content: string;
};

/** Roles that are allowed to come FROM THE CLIENT. */
const CLIENT_ALLOWED_ROLES = new Set(['user', 'assistant']);

/** AI mode names accepted from the client. */
const ALLOWED_MODES = new Set([
  'auto',
  'smart',
  'fast',
  'research',
  'code',
  'creative',
  'vision',
  'files',
  'translation',
]);

export function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
}

/** Cleans a memory string from the client. */
export function sanitizeMemory(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_MEMORY_LENGTH);
}

/** Returns a sanitized mode string, or null if invalid. */
export function sanitizeMode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  return ALLOWED_MODES.has(clean) ? clean : null;
}

export function validateChatRequest(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body.' };
  }

  const data = body as Record<string, unknown>;
  const messages = data.messages;

  if (!Array.isArray(messages)) {
    return { valid: false, error: 'messages must be an array.' };
  }

  if (messages.length === 0) {
    return { valid: false, error: 'At least one message is required.' };
  }

  if (messages.length > MAX_MESSAGES) {
    return {
      valid: false,
      error: `Too many messages. Maximum: ${MAX_MESSAGES}.`,
    };
  }

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message.' };
    }

    const item = message as Record<string, unknown>;
    const role = String(item.role ?? '');

    // Client can ONLY send user / assistant.
    // System messages must be built server-side.
    if (!CLIENT_ALLOWED_ROLES.has(role)) {
      return {
        valid: false,
        error: 'Only user and assistant messages are allowed from the client.',
      };
    }

    if (typeof item.content !== 'string' || item.content.trim().length === 0) {
      return { valid: false, error: 'Invalid message content.' };
    }

    if (item.content.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: 'Message is too long.' };
    }
  }

  // memory: optional, must be a string if present.
  if (data.memory !== undefined && typeof data.memory !== 'string') {
    return { valid: false, error: 'memory must be a string.' };
  }

  // mode: optional, must be a known mode if present.
  if (data.mode !== undefined && typeof data.mode !== 'string') {
    return { valid: false, error: 'mode must be a string.' };
  }

  return { valid: true };
}

/**
 * Sanitizes client messages.
 * Strips any system role sent from the client (defense in depth).
 * Server-built system messages are added later in chat.ts.
 */
export function sanitizeMessages(
  messages: Array<{ role: SafeRole; content: string }>,
): SafeMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: sanitizeText(message.content),
    }))
    .filter((message) => message.content.length > 0);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}