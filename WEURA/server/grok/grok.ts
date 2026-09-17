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
 *  PROVIDER COOLDOWN (skip dead providers for 5 min)
 * ============================================================ */

type CooldownEntry = {
  until: number;
  reason: string;
};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
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

/// Cerebras is PRIMARY (1M tokens/day, ultra-fast inference).
/// Groq is FALLBACK (200K tokens/day).
function getProviders(): Provider[] {
  const providers: Provider[] = [];

  // 1. Cerebras — primary
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  if (cerebrasKey) {
    providers.push({
      name: 'cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model: process.env.CEREBRAS_MODEL?.trim() || 'gpt-oss-120b',
    });
  }

  // 2. Groq — fallback
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: groqKey,
      model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    });
  }

  if (providers.length === 0) {
    throw new Error(
      'No AI provider is configured. Set CEREBRAS_API_KEY (primary) or GROQ_API_KEY (fallback).',
    );
  }

  return providers;
}

/* ============================================================
 *  CONTENT EXTRACTION
 * ============================================================ */

/// Some models return content as a string, others as an array of parts.
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

/// Returns TRUE if the error should trigger a fallback to the next provider.
///
/// Key cases:
///   402 → payment required (no credits)
///   401/403 → auth/forbidden
///   429 → rate limit
///   5xx → server errors
///   timeouts / network errors
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const msg = error.message.toLowerCase();

  return (
    // Auth / billing / access
    msg.includes('402') ||
    msg.includes('payment required') ||
    msg.includes('payment') ||
    msg.includes('credit') ||
    msg.includes('billing') ||
    msg.includes('insufficient') ||
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    // Rate limits / quotas
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    // Server errors
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    // Network / timing
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    // Response issues
    msg.includes('empty response') ||
    // Model issues
    msg.includes('model_not_found') ||
    msg.includes('model not found') ||
    msg.includes('does not exist') ||
    msg.includes('not available')
  );
}

/// Returns TRUE if the error means "this provider is dead for a while".
/// (e.g. no credits, invalid key). We should not keep trying it.
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

/// Tries each provider in order.
///   - Cerebras is tried FIRST.
///   - Groq is fallback.
///   - Dead providers (payment/auth errors) are put on a 5-min cooldown
///     so we don't waste time on them on every request.
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

  // Filter out providers on cooldown — unless ALL are on cooldown.
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

      // If it's a "dead" error → cooldown this provider for 5 min.
      if (isProviderDeadError(error)) {
        setCooldown(provider.name, message);
        console.warn(
          `[WEURA][${rid}] Provider ${provider.name} on cooldown for 5 min.`,
        );
      }

      // If it's not retryable → give up immediately.
      if (!isRetryableError(error)) {
        throw error;
      }

      // If this was the last → throw combined error.
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