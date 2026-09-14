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

/// Returns the list of available providers in priority order.
/// Cerebras is tried first (1M tokens/day), Groq as fallback (200K).
function getProviders(): Provider[] {
  const providers: Provider[] = [];

  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  if (cerebrasKey) {
    providers.push({
      name: 'cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model: process.env.CEREBRAS_MODEL?.trim() || 'gpt-oss-120b',
    });
  }

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
      'No AI provider is configured. Set CEREBRAS_API_KEY or GROQ_API_KEY.',
    );
  }

  return providers;
}

/// Calls a single provider once.
/// Returns the assistant text or throws an error.
async function callProvider(
  provider: Provider,
  messages: GrokMessage[],
): Promise<{ content: string; model: string; usage: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

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
        temperature: 0.7,
        stream: false,
      }),
    });

    const raw = await response.text();
    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `${provider.name}: invalid response (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ??
        data?.error ??
        `request failed with HTTP ${response.status}.`;
      throw new Error(`${provider.name}: ${String(providerError)}`);
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(`${provider.name}: returned an empty response.`);
    }

    return {
      content: content.trim(),
      model: data?.model ?? provider.model,
      usage: data?.usage ?? null,
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

/// Detects whether an error should trigger a fallback to the next
/// provider. Rate-limit, quota, 5xx and timeout errors are all
/// considered retryable.
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
export async function askGrok(messages: GrokMessage[]) {
  if (messages.length === 0) {
    throw new Error('No messages were provided.');
  }

  const providers = getProviders();
  const errors: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const isLast = i === providers.length - 1;

    try {
      const result = await callProvider(provider, messages);

      if (i > 0) {
        console.log(
          `[WEURA] Fallback succeeded on ${provider.name} ` +
          `after ${providers[i - 1].name} failed.`,
        );
      }

      return {
        ...result,
        provider: provider.name,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(message);

      console.error(
        `[WEURA] Provider ${provider.name} failed: ${message}`,
      );

      // If it's not a retryable error, stop immediately.
      if (!isRetryableError(error)) {
        throw error;
      }

      // If this was the last provider, throw a combined error.
      if (isLast) {
        throw new Error(
          `All AI providers failed:\n${errors.join('\n')}`,
        );
      }

      // Otherwise continue to the next provider.
      console.log(
        `[WEURA] Falling back from ${provider.name} to ${providers[i + 1].name}...`,
      );
    }
  }

  throw new Error('No provider could answer the request.');
}
