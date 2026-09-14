import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';
import { searchTavily } from './search';
import {
  createRequestId,
  sanitizeMessages,
  validateChatRequest,
} from '../security/security';

const router = express.Router();

/// Simple heuristic: does this query need current information?
function needsSearch(message: string): boolean {
  const text = message.toLowerCase();

  const triggers = [
    'latest',
    'today',
    'news',
    'current',
    'recent',
    'this year',
    'right now',
    'in 2026',
    'in 2025',
    'اخبار',
    'أخبار',
    'اليوم',
    'الآن',
    'حاليا',
    'آخر',
    'الأخبار',
    'الجديد',
    '2026',
    '2025',
  ];

  return triggers.some((t) => text.includes(t));
}

function getLastUserMessage(messages: GrokMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

router.post('/chat', async (req, res) => {
  const requestId = createRequestId();

  res.setHeader('X-WEURA-Request-ID', requestId);

  try {
    const validation = validateChatRequest(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        requestId,
      });
    }

    const body = req.body as {
      messages: GrokMessage[];
    };

    const safeMessages = sanitizeMessages(body.messages);

    if (safeMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid messages were provided.',
        requestId,
      });
    }

    let enrichedMessages: GrokMessage[] = safeMessages;

    const lastUserMessage = getLastUserMessage(safeMessages);
    const tavilyConfigured = Boolean(
      process.env.TAVILY_API_KEY?.trim(),
    );

    if (
      lastUserMessage &&
      needsSearch(lastUserMessage) &&
      tavilyConfigured
    ) {
      try {
        const results = await searchTavily(lastUserMessage, 5);

        if (results.length > 0) {
          const sources = results
            .map(
              (r, i) =>
                `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`,
            )
            .join('\n\n');

          const searchContext =
            `Current web search results for the user's query:\n\n` +
            `${sources}\n\n` +
            `IMPORTANT: Use only these real sources in your answer. ` +
            `Cite them as [1], [2] etc. when you use their information. ` +
            `Do NOT invent any other source, URL, or news outlet. ` +
            `If these sources do not contain enough information, ` +
            `say so honestly.`;

          enrichedMessages =
            safeMessages.length >= 1
              ? [
                  safeMessages[0],
                  { role: 'system', content: searchContext },
                  ...safeMessages.slice(1),
                ]
              : [
                  { role: 'system', content: searchContext },
                  ...safeMessages,
                ];
        }
      } catch (error) {
        console.error(
          `[WEURA] Auto-search failed ${requestId}:`,
          error,
        );
      }
    }

    const result = await askGrok(enrichedMessages);

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
      requestId,
    });
  } catch (error) {
    console.error(`[WEURA] Chat error ${requestId}:`, error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected server error occurred.',
      requestId,
    });
  }
});

export default router;
