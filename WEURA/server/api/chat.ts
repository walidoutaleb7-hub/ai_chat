import express from 'express';
import { askGrok, streamGrok, GrokMessage } from '../grok/grok';
import { searchTavily } from './search';
import {
  createRequestId,
  sanitizeMessages,
  validateChatRequest,
} from '../security/security';

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentTimeContext(): string {
  const now = new Date();
  return (
    `Current date and time (server):\n` +
    `- ISO: ${now.toISOString()}\n` +
    `- UTC: ${now.toUTCString()}\n\n` +
    `If the user asks for the current time, date or day, use this value.`
  );
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function looksLikeFootball(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'مباراة', 'مباريات', 'ماتش', 'لقاء', 'كورة', 'كرة القدم',
    'الدوري', 'دوري', 'ترتيب', 'جدول', 'هداف', 'هدافين',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي', 'مانشستر',
    'بايرن', 'باريس', 'يوفنتوس', 'إنتر', 'ميلان',
    'الليغا', 'البريميرليغ', 'الكالتشيو', 'البوندسليغا',
    'كأس العالم', 'دوري أبطال', 'الهلال', 'النصر', 'الأهلي',
    'الزمالك', 'الترجي', 'منتخب',
    'football', 'soccer', 'match', 'game', 'league',
    'standings', 'scorers', 'premier league', 'la liga',
    'real madrid', 'barcelona', 'liverpool', 'chelsea',
    'champions league', 'world cup',
  ];
  return triggers.some((t) => text.includes(t));
}

function looksLikeTech(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'flutter', 'dart', 'python', 'javascript', 'typescript',
    'react', 'node', 'api', 'github', 'npm', 'pub.dev',
    'code', 'coding', 'debug', 'error', 'exception',
    'كود', 'برمجة', 'خطأ', 'دالة',
  ];
  return triggers.some((t) => text.includes(t));
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

  const triggers = [
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
  for (const trigger of triggers) {
    if (text.includes(trigger)) return true;
  }
  return false;
}

function isTimeSensitive(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'latest', 'recent', 'today', 'tonight', 'this week',
    'this month', 'this year', 'current', 'now', 'right now',
    'news', 'last match', 'last game', 'last result', 'breaking',
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
    if (messages[i].role === 'user') return messages[i].content;
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

function buildSearchContext(
  sources: string,
  today: string,
  isFootball: boolean,
): string {
  const footballRule = isFootball
    ? `\n=== FOOTBALL SPECIFIC ===\n` +
      `- Only report a score, a match date, a scorer, a standing, ` +
      `or a player injury if it is EXPLICITLY written in the ` +
      `search results above.\n` +
      `- If the results only mention a team name without a score, ` +
      `do NOT guess. Say the specific detail is not available.\n`
    : '';

  return (
    `Today's date is ${today}.\n\n` +
    `You have been given a set of real web search results.\n\n` +
    `SEARCH RESULTS:\n\n${sources}\n\n` +
    `===============================\n` +
    `INTERNAL THINKING (do NOT show this to the user):\n` +
    `===============================\n` +
    `Before writing your reply, silently reason step by step:\n` +
    `1. What exactly is the user asking for?\n` +
    `2. Which of the search results above actually answer it?\n` +
    `3. Do the sources agree with each other?\n` +
    `4. What is confirmed by the sources? What is missing?\n` +
    `Then write your final answer using ONLY confirmed facts.\n\n` +
    `===============================\n` +
    `MANDATORY OUTPUT RULES:\n` +
    `===============================\n` +
    `1. Base every fact on the search results above. Do NOT use ` +
    `your own training data for factual claims.\n` +
    `2. NEVER invent names, scores, dates, minutes, scorers, ` +
    `standings, injuries, transfers, or quotes.\n` +
    `3. If the answer is not in the results, reply with one of:\n` +
    `   - Arabic: "هذه المعلومة غير موجودة في المصادر المتاحة."\n` +
    `   - English: "This information is not available in the sources."\n` +
    `4. Cite sources inline as [1], [2], etc.\n` +
    `5. Add a "المصادر:" section at the end ONLY if you actually ` +
    `cited at least one source.\n` +
    `6. DATE CHECK: if user asks for "آخر"/"latest"/"recent" and ` +
    `best match is older than 3 months, reply: ` +
    `"لم أجد معلومات حديثة في المصادر المتاحة."\n` +
    `7. MATCH the user's language.\n` +
    `8. START WITH THE ANSWER directly. No preamble.\n` +
    `9. Use Markdown for structure.\n` +
    `10. BE COMPREHENSIVE but not verbose.\n` +
    footballRule
  );
}

/// Builds the full message list to send to the AI (system + search + history).
async function buildMessages(
  safeMessages: GrokMessage[],
): Promise<{
  messages: GrokMessage[];
  searchUsed: boolean;
  football: boolean;
  tech: boolean;
  resultCount: number;
}> {
  const timeMessage: GrokMessage = {
    role: 'system',
    content: currentTimeContext(),
  };

  const lastUserMessage = getLastUserMessage(safeMessages);
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim());

  const isFootball = Boolean(lastUserMessage) && looksLikeFootball(lastUserMessage);
  const isTech = Boolean(lastUserMessage) && looksLikeTech(lastUserMessage);

  const shouldSearch =
    Boolean(lastUserMessage) &&
    (needsSearch(lastUserMessage) || isFootball) &&
    tavilyConfigured;

  const out: GrokMessage[] = [timeMessage];
  let searchUsed = false;
  let resultCount = 0;

  if (shouldSearch) {
    try {
      const timeSensitive = isTimeSensitive(lastUserMessage);
      const results = await searchTavily(lastUserMessage, 6, {
        timeSensitive,
        football: isFootball,
        tech: isTech,
      });

      if (results.length > 0) {
        searchUsed = true;
        resultCount = results.length;
        const today = todayISO();

        const sources = results
          .map(
            (r, i) =>
              `[${i + 1}] ${cleanSnippet(r.title, 140)}\n` +
              `URL: ${r.url}\n` +
              (r.publishedDate ? `Published: ${r.publishedDate}\n` : '') +
              `Content: ${cleanSnippet(r.snippet, 500)}`,
          )
          .join('\n\n');

        out.push({
          role: 'system',
          content: buildSearchContext(sources, today, isFootball),
        });
      }
    } catch (error) {
      console.error('[WEURA] Auto-search failed:', error);
    }
  }

  out.push(...safeMessages);

  return {
    messages: out,
    searchUsed,
    football: isFootball,
    tech: isTech,
    resultCount,
  };
}

// ---------------------------------------------------------------------------
// POST /api/chat  — Non-streaming
// ---------------------------------------------------------------------------

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

    const body = req.body as { messages: GrokMessage[] };
    const safeMessages = sanitizeMessages(body.messages);
    if (safeMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid messages were provided.',
        requestId,
      });
    }

    const built = await buildMessages(safeMessages);
    const result = await askGrok(built.messages);

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
      requestId,
      searchUsed: built.searchUsed,
      football: built.football,
      tech: built.tech,
    });
  } catch (error) {
    console.error(`[WEURA] Chat error ${requestId}:`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error.',
      requestId,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/stream  — Server-Sent Events
// ---------------------------------------------------------------------------

router.post('/chat/stream', async (req, res) => {
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

    const body = req.body as { messages: GrokMessage[] };
    const safeMessages = sanitizeMessages(body.messages);
    if (safeMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid messages were provided.',
        requestId,
      });
    }

    const built = await buildMessages(safeMessages);

    // Prepare SSE headers.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send a "meta" event so the client knows if search/football was used.
    res.write(
      `event: meta\ndata: ${JSON.stringify({
        requestId,
        searchUsed: built.searchUsed,
        football: built.football,
        tech: built.tech,
      })}\n\n`,
    );

    // Abort if the client disconnects.
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    try {
      for await (const chunk of streamGrok(built.messages)) {
        if (clientClosed || res.writableEnded) break;
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }

      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (error) {
      console.error(`[WEURA] Stream error ${requestId}:`, error);
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: error instanceof Error ? error.message : 'Stream failed',
          })}\n\n`,
        );
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  } catch (error) {
    console.error(`[WEURA] Stream setup error ${requestId}:`, error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error.',
        requestId,
      });
    }
    try {
      res.write('data: [DONE]\n\n');
      res.end();
    } catch {
      // ignore
    }
  }
});

export default router;
