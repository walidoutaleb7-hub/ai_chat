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

/// Returns the list of available providers in priority order.
/// Groq is PRIMARY (per WEURA rules).
/// Cerebras is FALLBACK only.
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

/// Extracts text from a provider response.
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

/// Calls a single provider once.
async function callProvider(
  provider: Provider,
  messages: GrokMessage[],
  options: AskOptions,
): Promise<{ content: string; model: string; usage: unknown; provider: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  const temperature = options.temperature ?? 0.7;
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
      throw new Error(`${provider.name}: ${String(providerError)}`);
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

/// Detects whether an error should trigger a fallback to the next provider.
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const msg = error.message.toLowerCase();

  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('timed out') ||
    msg.includes('empty response') ||
    msg.includes('network')
  );
}

/// Tries each provider in order. On failure, falls back to the next.
/// Groq is tried FIRST. Cerebras is fallback.
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

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const isLast = i === providers.length - 1;

    try {
      const result = await callProvider(provider, messages, options);

      if (i > 0) {
        console.log(
          `[WEURA][${rid}] Fallback succeeded on ${provider.name} ` +
            `after ${providers[i - 1].name} failed.`,
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);

      console.error(
        `[WEURA][${rid}] Provider ${provider.name} failed: ${message}`,
      );

      if (!isRetryableError(error)) {
        throw error;
      }

      if (isLast) {
        throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
      }

      console.log(
        `[WEURA][${rid}] Falling back from ${provider.name} to ${providers[i + 1].name}...`,
      );
    }
  }

  throw new Error('No provider could answer the request.');
}