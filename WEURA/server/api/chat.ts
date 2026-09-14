import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';
import { searchTavily } from './search';
import {
  createRequestId,
  sanitizeMessages,
  validateChatRequest,
} from '../security/security';

const router = express.Router();

/// Returns the current date/time in a stable format.
function currentTimeContext(): string {
  const now = new Date();
  const utc = now.toUTCString();
  const iso = now.toISOString();

  return (
    `Current date and time (server):\n` +
    `- ISO: ${iso}\n` +
    `- UTC: ${utc}\n\n` +
    `If the user asks for the current time, date or day, use this value.`
  );
}

/// Returns true when the message is likely to need up-to-date
/// information from the web.
function needsSearch(message: string): boolean {
  const text = message.toLowerCase().trim();

  // Don't search on greetings, thanks, or very short messages.
  const skipPatterns = [
    /^(hi|hello|hey|salam|salut|مرحبا|سلام|أهلا|اهلا|صباح|مساء)[\s!.,?]*$/,
    /^(thanks|thank you|شكرا|مشكور|بارك الله)[\s!.,?]*$/,
    /^(ok|okay|yes|no|نعم|لا|حسنا|طيب)[\s!.,?]*$/,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(text)) return false;
  }

  // Very short messages (< 3 words) rarely need search.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return false;

  // Keywords that strongly suggest the user wants fresh information.
  const searchTriggers = [
    // English — general
    'latest', 'today', 'tonight', 'news', 'current', 'currently',
    'recent', 'recently', 'now', 'right now', 'this year',
    'this week', 'this month', 'new', 'update', 'updates',
    'price', 'prices', 'cost', 'weather', 'temperature',
    'score', 'scores', 'match', 'game', 'winner', 'election',
    'release', 'released', 'launch', 'launched', 'announced',
    'who is', 'what is', 'where is', 'when did', 'how much',
    'how many', 'is there', 'are there', 'was there',

    // English — sports & events
    'match summary', 'game summary', 'league', 'standings',
    'scorers', 'championship', 'tournament', 'fixture', 'fixtures',
    'real madrid', 'barcelona', 'psg', 'liverpool', 'chelsea',

    // Arabic — general
    'اخبار', 'أخبار', 'خبر', 'اليوم', 'الآن', 'حاليا', 'حاليًا',
    'آخر', 'الأخبار', 'الجديد', 'الجديدة', 'حديث', 'حديثة',
    'سعر', 'أسعار', 'تكلفة', 'طقس', 'حرارة',
    'إصدار', 'أعلن', 'أطلقت', 'نتيجة', 'نتائج',
    'من هو', 'من هي', 'ما هو', 'ما هي', 'وين', 'أين', 'متى',
    'كم', 'بشحال', 'واش صرا', 'واش صار',

    // Arabic — sports & events
    'ملخص', 'مباراة', 'مباريات', 'ماتش', 'الدوري',
    'الترتيب', 'هداف', 'كأس', 'بطولة', 'منتخب',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي',

    // Recent years
    '2026', '2025', '2024',
  ];

  for (const trigger of searchTriggers) {
    if (text.includes(trigger)) return true;
  }

  return false;
}

function getLastUserMessage(messages: GrokMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

/// Strips HTML tags and limits length so search context stays clean.
function cleanSnippet(raw: string, maxLen = 400): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
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

    const timeMessage: GrokMessage = {
      role: 'system',
      content: currentTimeContext(),
    };

    let enrichedMessages: GrokMessage[] = [
      timeMessage,
      ...safeMessages,
    ];

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
                `[${i + 1}] ${cleanSnippet(r.title, 120)}\n` +
                `${r.url}\n` +
                `${cleanSnippet(r.snippet, 400)}`,
            )
            .join('\n\n');

          const searchContext =
            `Current web search results for the user's query:\n\n` +
            `${sources}\n\n` +
            `STRICT RULES:\n` +
            `- Use ONLY these real sources.\n` +
            `- Cite them as [1], [2], [3] when you use their info.\n` +
            `- Do NOT invent any URL, source, or news outlet.\n` +
            `- If the sources do not contain enough information, ` +
            `say so honestly instead of guessing.`;

          enrichedMessages = [
            timeMessage,
            safeMessages[0],
            { role: 'system', content: searchContext },
            ...safeMessages.slice(1),
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
