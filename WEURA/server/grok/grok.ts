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

type CooldownEntry = { until: number; reason: string };
const COOLDOWN_MS = 10 * 60 * 1000;
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

function setCooldown(
  name: string,
  reason: string,
  durationMs: number = COOLDOWN_MS,
): void {
  const until = Date.now() + durationMs;
  COOLDOWNS.set(name, { until, reason });
  const minutes = Math.round(durationMs / 60000);
  console.log(
    `[WEURA] Provider ${name} on cooldown for ${minutes} min. Reason: ${reason}`,
  );
}

function getProviders(): Provider[] {
  const providers: Provider[] = [];

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: groqKey,
      model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    });
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    providers.push({
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: openrouterKey,
      model: process.env.OPENROUTER_MODEL?.trim() || 'google/gemma-4-26b-a4b-it:free',
    });
  }

  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  if (cerebrasKey) {
    providers.push({
      name: 'cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model: process.env.CEREBRAS_MODEL?.trim() || 'gpt-oss-120b',
    });
  }

  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  if (mistralKey) {
    providers.push({
      name: 'mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      apiKey: mistralKey,
      model: process.env.MISTRAL_MODEL?.trim() || 'mistral-small-latest',
    });
  }

  if (providers.length === 0) {
    throw new Error(
      'No AI provider is configured. Set at least one of: ' +
        'GROQ_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY.',
    );
  }

  return providers;
}

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

  // Safe defaults. Caller (chat.ts) usually passes explicit values.
  const temperature = options.temperature ?? 0.65;
  const maxTokens = options.maxTokens ?? 3072;

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        // OpenRouter requires these attribution headers (optional but recommended)
        ...(provider.name === 'openrouter'
          ? {
              'HTTP-Referer': 'https://ai-chat-tlol.onrender.com',
              'X-Title': 'WEURA AI',
            }
          : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        tools: [],
        tool_choice: 'none',
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
 *  ERROR CLASSIFICATION
 * ============================================================ */

/**
 * Detects HTTP status codes with word boundaries.
 * Prevents false positives like "0.400 seconds" or "error 4005".
 */
function hasStatusCode(msg: string, code: number): boolean {
  const re = new RegExp(`(?:http\\s?|status\\s?|error\\s?|code\\s?)?\\b${code}\\b`, 'i');
  return re.test(msg);
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();

  // Explicit status codes
  if (
    hasStatusCode(msg, 400) ||
    hasStatusCode(msg, 401) ||
    hasStatusCode(msg, 402) ||
    hasStatusCode(msg, 403) ||
    hasStatusCode(msg, 408) ||
    hasStatusCode(msg, 429) ||
    hasStatusCode(msg, 500) ||
    hasStatusCode(msg, 502) ||
    hasStatusCode(msg, 503) ||
    hasStatusCode(msg, 504) ||
    hasStatusCode(msg, 520)
  ) {
    return true;
  }

  // Keyword-based
  return (
    msg.includes('payment') ||
    msg.includes('credit') ||
    msg.includes('billing') ||
    msg.includes('insufficient') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('forbidden') ||
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('tool choice') ||
    msg.includes('called a tool') ||
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
    hasStatusCode(msg, 402) ||
    hasStatusCode(msg, 401) ||
    hasStatusCode(msg, 403) ||
    msg.includes('payment required') ||
    msg.includes('insufficient') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('forbidden')
  );
}

/**
 * Detects rate-limit / quota-exhausted errors.
 * These should NOT be retried immediately — the provider is "tired"
 * and needs a cooldown so the next request uses a different provider.
 */
function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    hasStatusCode(msg, 429) ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('too many requests')
  );
}

/**
 * Retry a single provider call with exponential backoff.
 * Only retries on retryable errors.
 */
async function callProviderWithRetry(
  provider: Provider,
  messages: GrokMessage[],
  options: AskOptions,
  maxAttempts = 2,
): Promise<{
  content: string;
  model: string;
  usage: unknown;
  provider: string;
}> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callProvider(provider, messages, options);
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) throw error;

      // Don't retry provider-dead errors
      if (isProviderDeadError(error)) throw error;

      if (attempt < maxAttempts) {
        const delay = 500 * attempt; // 500ms, 1000ms
        console.log(
          `[WEURA][${options.requestId ?? '-'}] ${provider.name} attempt ${attempt} failed, retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

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
      const result = await callProviderWithRetry(provider, messages, options);

      if (i > 0) {
        console.log(
          `[WEURA][${rid}] Fallback succeeded on ${provider.name} ` +
            `after ${candidates[i - 1].name} failed.`,
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);

      console.error(
        `[WEURA][${rid}] Provider ${provider.name} failed: ${message}`,
      );

      // Dead errors (401/402/403): 10 min cooldown.
      // Rate limits (429/quota): 30 min cooldown — daily token budgets
      // need time to recover, and we want to skip this provider next time.
      if (isProviderDeadError(error)) {
        setCooldown(provider.name, message, 10 * 60 * 1000);
      } else if (isRateLimitError(error)) {
        setCooldown(provider.name, message, 30 * 60 * 1000);
      }

      if (!isRetryableError(error)) {
        throw error;
      }

      if (isLast) {
        throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
      }

      console.log(
        `[WEURA][${rid}] Falling back from ${provider.name} to ${candidates[i + 1].name}...`,
      );
    }
  }

  throw new Error('No provider could answer the request.');
}