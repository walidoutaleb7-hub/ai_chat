import crypto from 'node:crypto';

export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_LENGTH = 30_000;

export type SafeRole = 'system' | 'user' | 'assistant';

export type SafeMessage = {
  role: SafeRole;
  content: string;
};

export function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function validateChatRequest(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: 'Invalid request body.',
    };
  }

  const data = body as Record<string, unknown>;
  const messages = data.messages;

  if (!Array.isArray(messages)) {
    return {
      valid: false,
      error: 'messages must be an array.',
    };
  }

  if (messages.length === 0) {
    return {
      valid: false,
      error: 'At least one message is required.',
    };
  }

  if (messages.length > MAX_MESSAGES) {
    return {
      valid: false,
      error: `Too many messages. Maximum: ${MAX_MESSAGES}.`,
    };
  }

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      return {
        valid: false,
        error: 'Invalid message.',
      };
    }

    const item = message as Record<string, unknown>;

    if (
      !['system', 'user', 'assistant'].includes(
        String(item.role),
      )
    ) {
      return {
        valid: false,
        error: 'Invalid message role.',
      };
    }

    if (
      typeof item.content !== 'string' ||
      item.content.trim().length === 0
    ) {
      return {
        valid: false,
        error: 'Invalid message content.',
      };
    }

    if (item.content.length > MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: 'Message is too long.',
      };
    }
  }

  return { valid: true };
}

export function sanitizeMessages(
  messages: Array<{
    role: SafeRole;
    content: string;
  }>,
): SafeMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: sanitizeText(message.content),
    }))
    .filter((message) => message.content.length > 0);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}