import 'dotenv/config';

export type GrokMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type Provider = {
  name: string;
  url: string;
  apiKey: string;
  model: string;
};

export type AskOptions = {
  requestId?: string;
  temperature?: number;
  maxTokens?: number;
};

/* ============================================================
 *  PROVIDER COOLDOWN (skip dead providers for 10 min)
 * ============================================================ */

type CooldownEntry = {
  until: number;
  reason: string;
};

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWNS = new Map<string, CooldownEntry>();

function isOnCooldown(name: string): boolean {
  const entry = COOLDOWNS.get(name);
  if (!entry) return false;
  if (entry.until <= Date.now()) {
    COOLDOWNS.delete(name);
    return false;
  }
  return true;
}

function setCooldown(name: string, reason: string): void {
  COOLDOWNS.set(name, {
    until: Date.now() + COOLDOWN_MS,
    reason,
  });
}

/* ============================================================
 *  PROVIDER REGISTRY
 * ============================================================ */

/// Groq is PRIMARY (fast + reliable).
/// Cerebras is FALLBACK (kicks in when Groq hits its daily limit).
function getProviders(): Provider[] {
  const providers: Provider[] = [];

  // 1. Groq — primary
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: groqKey,
      model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    });
  }

  // 2. Cerebras — fallback
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  if (cerebrasKey) {
    providers.push({
      name: 'cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model: process.env.CEREBRAS_MODEL?.trim() || 'gpt-oss-120b',
    });
  }

  if (providers.length === 0) {
    throw new Error(
      'No AI provider is configured. Set GROQ_API_KEY (primary) or CEREBRAS_API_KEY (fallback).',
    );
  }

  return providers;
}

/* ============================================================
 *  CONTENT EXTRACTION
 * ============================================================ */

function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

/* ============================================================
 *  SINGLE PROVIDER CALL
 * ============================================================ */

async function callProvider(
  provider: Provider,
  messages: GrokMessage[],
  options: AskOptions,
): Promise<{
  content: string;
  model: string;
  usage: unknown;
  provider: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  const temperature = options.temperature ?? 0.85;
  const maxTokens = options.maxTokens ?? 2048;

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    const raw = await response.text();
    let data: unknown;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `${provider.name}: invalid response (HTTP ${response.status}).`,
      );
    }

    const obj = data as {
      error?: { message?: string } | string;
      choices?: Array<{ message?: { content?: unknown } }>;
      model?: string;
      usage?: unknown;
    };

    if (!response.ok) {
      const providerError =
        (typeof obj.error === 'object' && obj.error?.message) ||
        obj.error ||
        `request failed with HTTP ${response.status}.`;
      throw new Error(
        `${provider.name}: HTTP ${response.status} - ${String(providerError)}`,
      );
    }

    const rawContent = obj?.choices?.[0]?.message?.content;
    const content = extractContent(rawContent).trim();

    if (!content) {
      throw new Error(`${provider.name}: returned an empty response.`);
    }

    return {
      content,
      model: obj?.model ?? provider.model,
      usage: obj?.usage ?? null,
      provider: provider.name,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${provider.name}: request timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
 *  RETRYABLE / FATAL CLASSIFICATION
 * ============================================================ */

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const msg = error.message.toLowerCase();

  return (
    msg.includes('402') ||
    msg.includes('payment') ||
    msg.includes('credit') ||
    msg.includes('billing') ||
    msg.includes('insufficient') ||
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('520') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('empty response') ||
    msg.includes('model_not_found') ||
    msg.includes('model not found') ||
    msg.includes('does not exist') ||
    msg.includes('not available')
  );
}

function isProviderDeadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();

  return (
    msg.includes('402') ||
    msg.includes('payment required') ||
    msg.includes('insufficient') ||
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('403') ||
    msg.includes('forbidden')
  );
}

/* ============================================================
 *  MAIN ENTRY
 * ============================================================ */

export async function askGrok(
  messages: GrokMessage[],
  options: AskOptions = {},
) {
  if (messages.length === 0) {
    throw new Error('No messages were provided.');
  }

  const providers = getProviders();
  const errors: string[] = [];
  const rid = options.requestId ?? '-';

  const available = providers.filter((p) => !isOnCooldown(p.name));
  const candidates = available.length > 0 ? available : providers;

  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i];
    const isLast = i === candidates.length - 1;

    try {
      const result = await callProvider(provider, messages, options);

      if (i > 0) {
        console.log(
          `[WEURA][${rid}] Fallback succeeded on ${provider.name} ` +
            `after ${candidates[i - 1].name} failed.`,
        );
      }

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(message);

      console.error(
        `[WEURA][${rid}] Provider ${provider.name} failed: ${message}`,
      );

      if (isProviderDeadError(error)) {
        setCooldown(provider.name, message);
        console.warn(
          `[WEURA][${rid}] Provider ${provider.name} on cooldown for 10 min.`,
        );
      }

      if (!isRetryableError(error)) {
        throw error;
      }

      if (isLast) {
        throw new Error(
          `All AI providers failed:\n${errors.join('\n')}`,
        );
      }

      console.log(
        `[WEURA][${rid}] Falling back from ${provider.name} to ${candidates[i + 1].name}...`,
      );
    }
  }

  throw new Error('No provider could answer the request.');
}