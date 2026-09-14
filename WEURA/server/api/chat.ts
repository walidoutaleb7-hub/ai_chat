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

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
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
    'latest', 'today', 'tonight', 'news', 'current', 'currently',
    'recent', 'recently', 'now', 'right now', 'this year',
    'this week', 'this month', 'new', 'update', 'updates',
    'last match', 'last game', 'last result', 'last time',
    'price', 'prices', 'cost', 'weather', 'temperature',
    'score', 'scores', 'match', 'game', 'winner', 'election',
    'release', 'released', 'launch', 'launched', 'announced',
    'who is', 'what is', 'where is', 'when did', 'how much',
    'how many', 'is there', 'are there', 'was there',
    'match summary', 'game summary', 'league', 'standings',
    'scorers', 'championship', 'tournament', 'fixture', 'fixtures',
    'injury', 'injured', 'roster', 'lineup', 'transfer',
    'real madrid', 'barcelona', 'psg', 'liverpool', 'chelsea',

    'اخبار', 'أخبار', 'خبر', 'اليوم', 'الآن', 'حاليا', 'حاليًا',
    'آخر', 'أحدث', 'الأخبار', 'الجديد', 'الجديدة', 'حديث', 'حديثة',
    'سعر', 'أسعار', 'تكلفة', 'طقس', 'حرارة',
    'إصدار', 'أعلن', 'أطلقت', 'نتيجة', 'نتائج',
    'من هو', 'من هي', 'ما هو', 'ما هي', 'وين', 'أين', 'متى',
    'كم', 'بشحال', 'واش صرا', 'واش صار',
    'ملخص', 'مباراة', 'مباريات', 'ماتش', 'الدوري',
    'الترتيب', 'هداف', 'هدافين', 'كأس', 'بطولة', 'منتخب',
    'إصابة', 'إصابات', 'مصاب', 'تشكيلة', 'انتقال',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي',
    'آخر مباراة', 'آخر ماتش', 'آخر لقاء', 'آخر نتيجة',

    '2026', '2025', '2024',
  ];

  for (const trigger of searchTriggers) {
    if (text.includes(trigger)) return true;
  }

  return false;
}

function isTimeSensitive(message: string): boolean {
  const text = message.toLowerCase();

  const triggers = [
    'latest', 'recent', 'today', 'tonight', 'this week',
    'this month', 'this year', 'current', 'now', 'right now',
    'news', 'last match', 'last game', 'last result',
    'breaking',

    'آخر', 'أحدث', 'اليوم', 'الآن', 'حاليا', 'حاليًا',
    'هذا الأسبوع', 'هذا الشهر', 'هذه السنة', 'الجديد',
    'الأخبار', 'أخبار', 'عاجل', 'حالياً',
    'آخر مباراة', 'آخر ماتش', 'آخر لقاء', 'آخر نتيجة',
    'مؤخرا', 'مؤخرًا',
  ];

  for (const trigger of triggers) {
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

function cleanSnippet(raw: string, maxLen = 500): string {
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

    const timeSensitive = isTimeSensitive(lastUserMessage);

    let enrichedMessages: GrokMessage[];
    let searchSucceeded = false;
    let searchResultCount = 0;

    if (shouldSearch) {
      try {
        const results = await searchTavily(
          lastUserMessage,
          5,
          timeSensitive,
        );

        if (results.length > 0) {
          searchSucceeded = true;
          searchResultCount = results.length;

          const today = todayISO();

          const sources = results
            .map(
              (r, i) =>
                `[${i + 1}] ${cleanSnippet(r.title, 120)}\n` +
                `URL: ${r.url}\n` +
                (r.publishedDate
                  ? `Published: ${r.publishedDate}\n`
                  : '') +
                `Content: ${cleanSnippet(r.snippet, 500)}`,
            )
            .join('\n\n');

          const searchContext =
            `Today's date is ${today}.\n\n` +
            `You have been given real web search results for the ` +
            `user's question. These results are your ONLY source of ` +
            `truth for this reply.\n\n` +
            `SEARCH RESULTS:\n\n${sources}\n\n` +
            `ABSOLUTE RULES — breaking these rules is a critical failure:\n` +
            `1. Answer ONLY using information explicitly written in ` +
            `the search results above.\n` +
            `2. You MUST NOT use your own training knowledge about ` +
            `this topic, even if you are confident.\n` +
            `3. If a specific detail is NOT written in the search ` +
            `results, reply with exactly this sentence and nothing else ` +
            `(no "المصادر:" section, no extra text):\n` +
            `"هذه المعلومة غير موجودة في المصادر المتاحة."\n` +
            `4. NEVER invent players, coaches, scores, minutes, ` +
            `injuries, lineups, transfers, dates, or quotes.\n` +
            `5. When you use a source, cite it inline as [1], [2], etc.\n` +
            `6. IF AND ONLY IF you actually cite at least one source ` +
            `with [N], add at the very end of your answer a section ` +
            `titled "المصادر:" followed by the list of URLs you cited. ` +
            `If you did not cite any source (for example because the ` +
            `answer was "هذه المعلومة غير موجودة في المصادر المتاحة"), ` +
            `DO NOT add a "المصادر:" section at all.\n` +
            `7. If the user asks a follow-up question about the same ` +
            `topic and the answer is not in the sources above, again ` +
            `reply with the exact sentence from rule 3. Do not switch ` +
            `to your training data.\n` +
            `8. CRITICAL — DATE CHECK:\n` +
            `   Today is ${today}.\n` +
            `   If the user asks for "latest", "last", "recent", ` +
            `"آخر", "أحدث", or "اليوم", and the most relevant result ` +
            `is OLDER than 3 months, reply ONLY with:\n` +
            `"لم أجد معلومات حديثة في المصادر المتاحة."\n` +
            `   Do NOT present old information as if it were current, ` +
            `and do NOT add a "المصادر:" section in that case.\n` +
            `9. If a result explicitly shows a "Published:" date, ` +
            `compare it to today's date (${today}) and prefer the ` +
            `most recent result.`;

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
      searchResultCount,
      timeSensitive,
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
