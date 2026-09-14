import 'dotenv/config';

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export type GrokMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function askGrok(
  messages: GrokMessage[],
) {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not configured on the server.',
    );
  }

  if (messages.length === 0) {
    throw new Error('No messages were provided.');
  }

  const model =
    process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 120000);

  try {
    const response = await fetch(
      GROQ_API_URL,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          stream: false,
          tool_choice: 'none',
        }),
      },
    );

    const raw = await response.text();

    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Invalid response from Groq `
        + `(HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ??
        data?.error ??
        `Groq request failed with HTTP ${response.status}.`;

      throw new Error(String(providerError));
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new Error(
        'Groq returned an empty response.',
      );
    }

    return {
      content: content.trim(),
      model: data?.model ?? model,
      usage: data?.usage ?? null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'Groq request timed out after 120 seconds.',
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
