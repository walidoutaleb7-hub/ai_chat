import 'dotenv/config';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export type GrokMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function askGrok(messages: GrokMessage[]) {
  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    throw new Error('GROK_API_KEY is not configured.');
  }

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-4',
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Grok returned an empty response.');
  }

  return {
    content,
    model: data.model ?? 'grok-4',
    usage: data.usage ?? null,
  };
}