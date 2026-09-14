import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';
import { searchTavily } from './search';
import {
  createRequestId,
  sanitizeMessages,
  validateChatRequest,
} from '../security/security';

const router = express.Router();

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

function needsSearch(message: string): boolean {
  const text = message.toLowerCase().trim();

  const skipPatterns = [
    /^(hi|hello|hey|salam|salut|مرحبا|سلام|أهلا|اهلا|صباح|مساء)[\s!.,?]*$/,
    /^(thanks|thank you|شكرا|مشكور|بارك الله)[\s!.,?]*$/,
    /^(ok|okay|yes|no|نعم|لا|حسنا|طيب)[\s!.,?]*$/,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(text)) return false;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return false;

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
    'injury', 'injured', 'roster', 'lineup', 'transfer',
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
    'الترتيب', 'هداف', 'هدافين', 'كأس', 'بطولة', 'منتخب',
    'إصابة', 'إصابات', 'مصاب', 'تشكيلة', 'انتقال',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي',

    // Years
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

    const lastUserMessage = getLastUserMessage(safeMessages);
    const tavilyConfigured = Boolean(
      process.env.TAVILY_API_KEY?.trim(),
    );

    const shouldSearch =
      Boolean(lastUserMessage) &&
      needsSearch(lastUserMessage) &&
      tavilyConfigured;

    let enrichedMessages: GrokMessage[];
    let searchSucceeded = false;

    if (shouldSearch) {
      try {
        const results = await searchTavily(lastUserMessage, 5);

        if (results.length > 0) {
          searchSucceeded = true;

          const sources = results
            .map(
              (r, i) =>
                `[${i + 1}] ${cleanSnippet(r.title, 120)}\n` +
                `URL: ${r.url}\n` +
                `Content: ${cleanSnippet(r.snippet, 500)}`,
            )
            .join('\n\n');

          // STRICT MODE: WEURA must answer ONLY from these sources.
          // No training knowledge allowed for the current question.
          const searchContext =
            `You have been given real web search results for the ` +
            `user's question. These results are your ONLY source of ` +
            `truth for this reply.\n\n` +
            `SEARCH RESULTS:\n\n${sources}\n\n` +
            `ABSOLUTE RULES — breaking these rules is a critical failure:\n` +
            `1. Answer ONLY using information explicitly written in ` +
            `the search results above.\n` +
            `2. You MUST NOT use your own training knowledge about ` +
            `this topic, even if you are confident.\n` +
            `3. If a specific detail (a name, a score, a date, an ` +
            `injury, a scorer, a statistic) is NOT written in the ` +
            `search results, you MUST reply exactly:\n` +
            `"هذه المعلومة غير موجودة في المصادر المتاحة."\n` +
            `(or "This detail is not in the available sources." ` +
            `in English).\n` +
            `4. NEVER invent players, coaches, scores, minutes, ` +
            `injuries, lineups, transfers, dates, or quotes.\n` +
            `5. When you do use a source, cite it inline as [1], [2], ` +
            `etc.\n` +
            `6. At the end of every search-based answer, add a section ` +
            `titled "المصادر:" followed by the URLs you actually used.\n` +
            `7. If the user asks a follow-up question about the same ` +
            `topic and the answer is not in the sources above, you ` +
            `MUST again say that it is not in the available sources. ` +
            `Do not switch to your training data.`;

          enrichedMessages = [
            timeMessage,
            { role: 'system', content: searchContext },
            ...safeMessages,
          ];
        } else {
          enrichedMessages = [timeMessage, ...safeMessages];
        }
      } catch (error) {
        console.error(
          `[WEURA] Auto-search failed ${requestId}:`,
          error,
        );
        enrichedMessages = [timeMessage, ...safeMessages];
      }
    } else {
      enrichedMessages = [timeMessage, ...safeMessages];
    }

    const result = await askGrok(enrichedMessages);

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
      requestId,
      searchUsed: searchSucceeded,
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
