import 'dotenv/config';

const GROK_API_URL =
  'https://api.x.ai/v1/chat/completions';

const GROK_MODEL = 'grok-4.6';

export type GrokMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function askGrok(
  messages: GrokMessage[],
) {
  const apiKey = process.env.GROK_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'GROK_API_KEY is not configured on the server.',
    );
  }

  if (messages.length === 0) {
    throw new Error(
      'No messages were provided.',
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 120000);

  try {
    const response = await fetch(
      GROK_API_URL,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages,
          temperature: 0.7,
          stream: false,
        }),
      },
    );

    const raw = await response.text();

    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Invalid response from xAI `
        + `(HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ??
        data?.error ??
        `xAI request failed with HTTP ${response.status}.`;

      throw new Error(
        String(providerError),
      );
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new Error(
        'Grok returned an empty response.',
      );
    }

    return {
      content: content.trim(),
      model: data?.model ?? GROK_MODEL,
      usage: data?.usage ?? null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'Grok request timed out after 120 seconds.',
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}