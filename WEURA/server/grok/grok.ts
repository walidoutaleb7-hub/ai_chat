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

function pickProvider(): Provider {
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();

  if (cerebrasKey) {
    return {
      name: 'cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model:
        process.env.CEREBRAS_MODEL?.trim() || 'llama-3.3-70b',
    };
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (groqKey) {
    return {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: groqKey,
      model:
        process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    };
  }

  throw new Error(
    'No AI provider is configured. Set CEREBRAS_API_KEY or GROQ_API_KEY.',
  );
}

// ---------------------------------------------------------------------------
// Non-streaming (used by /api/chat)
// ---------------------------------------------------------------------------

export async function askGrok(messages: GrokMessage[]) {
  if (messages.length === 0) {
    throw new Error('No messages were provided.');
  }

  const provider = pickProvider();

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
        `Invalid response from ${provider.name} (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ??
        data?.error ??
        `${provider.name} request failed with HTTP ${response.status}.`;
      throw new Error(String(providerError));
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(`${provider.name} returned an empty response.`);
    }

    return {
      content: content.trim(),
      model: data?.model ?? provider.model,
      usage: data?.usage ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `${provider.name} request timed out after 120 seconds.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Streaming (used by /api/chat/stream)
// ---------------------------------------------------------------------------

/// Streams the answer token-by-token. Yields raw text chunks.
export async function* streamGrok(
  messages: GrokMessage[],
): AsyncGenerator<string, void, unknown> {
  if (messages.length === 0) {
    throw new Error('No messages were provided.');
  }

  const provider = pickProvider();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const raw = await response.text().catch(() => '');
      throw new Error(
        `${provider.name} streaming failed (HTTP ${response.status}): ${raw.slice(0, 200)}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by newlines.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') return;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
        } catch {
          // Ignore malformed chunks.
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `${provider.name} streaming timed out after 180 seconds.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
