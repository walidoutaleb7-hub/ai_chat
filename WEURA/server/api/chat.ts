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
    'بايرن', 'باريس', 'يوفنتوس', 'إنتر', 'ميلان', 'نيمار',
    'الليغا', 'البريميرليغ', 'الكالتشيو', 'البوندسليغا',
    'كأس العالم', 'دوري أبطال', 'الهلال', 'النصر', 'الأهلي',
    'مبابي', 'ميسي', 'رونالدو', 'بنزيمة', 'صلاح', 'هالاند',
    'فينيسيوس', 'بيلينغهام', 'مودريتش', 'كيليان', 'ليونيل',
    'football', 'soccer', 'match', 'game', 'league',
    'standings', 'scorers', 'premier league', 'la liga',
    'real madrid', 'barcelona', 'liverpool', 'chelsea',
    'champions league', 'world cup',
    'mbappe', 'messi', 'ronaldo', 'benzema', 'salah', 'neymar',
    'haaland', 'vinicius', 'bellingham',
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

/// Returns true if the message needs a web search.
///
/// Search is the DEFAULT for real questions. We only skip:
///   - greetings in any language (EN, AR, Darija, FR)
///   - thanks / acknowledgments
///   - yes / no / ok
///   - goodbyes
///   - pure math expressions (2+2)
///   - very short casual acknowledgments (haha, lol, 👍)
function needsSearch(message: string): boolean {
  const text = message.trim();

  // Pure greetings / thanks / confirmations / goodbyes.
  const skipPatterns = [
    // English greetings
    /^(hi|hey|hello|yo|sup|hiya|howdy)[\s!.,?]*$/i,
    /^(good\s*(morning|evening|afternoon|night))[\s!.,?]*$/i,

    // Arabic greetings (MSA + Darija + Gulf + Egyptian)
    /^(مرحبا|مرحبتين|اهلا|أهلا|هلا|هليو|هاي|سلام|سلام عليكم|السلام عليكم|صباح الخير|مساء الخير|صباح النور|مساء النور|كيف حالك|كيفك|كيفك حالك|شحال حالك|واش راك|كي راك|لاباس|لاباس عليك)[\s!.,?،؟]*$/i,

    // French greetings
    /^(salut|bonjour|bonsoir|coucou)[\s!.,?]*$/i,

    // Thanks / acknowledgment
    /^(thanks|thank you|thx|ty|cheers|appreciate it|شكرا|مشكور|بارك الله|بارك الله فيك|يعطيك الصحة|الله يخليك)[\s!.,?،؟]*$/i,

    // Yes / No / OK
    /^(ok|okay|k|yes|no|sure|yep|nope|نعم|لا|حسنا|حسناً|طيب|ماشي|بصح|واخا|تمام|اوكي|أوكي)[\s!.,?،؟]*$/i,

    // Goodbyes
    /^(bye|goodbye|see you|cya|take care|بسلامة|تصبح على خير|الى اللقاء|إلى اللقاء|نشوفك)[\s!.,?،؟]*$/i,

    // Very short casual acknowledgments
    /^(cool|nice|great|awesome|haha|lol|😂|👍|❤️|🔥)[\s!.,?،؟]*$/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(text)) return false;
  }

  // Pure math expression (e.g. "2+2", "5 * 3").
  if (/^[\d\s+\-*/().%,]+$/.test(text)) return false;

  // Very short (< 3 characters).
  if (text.length < 3) return false;

  // Everything else → search.
  return true;
}

function isTimeSensitive(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'latest', 'recent', 'today', 'tonight', 'this week',
    'this month', 'this year', 'current', 'currently', 'now',
    'right now', 'news', 'last match', 'last game', 'last result',
    'breaking', 'آخر', 'أحدث', 'اليوم', 'الآن', 'حاليا', 'حاليًا',
    'هذا الأسبوع', 'هذا الشهر', 'هذه السنة', 'الجديد',
    'الأخبار', 'أخبار', 'عاجل', 'آخر مباراة', 'آخر ماتش',
    'آخر لقاء', 'آخر نتيجة', 'مؤخرا', 'مؤخرًا',
    'أين يلعب', 'اين يلعب', 'فين يلعب', 'يلعب حاليا',
    'يلعب الآن', 'فريقه الحالي', 'ناديه الحالي',
    'current club', 'current team', 'plays for', 'where does',
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
      `- Football transfers happen constantly. Your training data is ` +
      `OUTDATED. You MUST answer using ONLY the search results above.\n` +
      `- For ANY question about a player's current club, transfer, ` +
      `contract, goals, or stats — use ONLY the search results.\n` +
      `- Never say "باريس سان جيرمان" for Mbappé unless it appears ` +
      `in the sources. He currently plays for Real Madrid.\n` +
      `- Never say "برشلونة" for Messi. He currently plays for ` +
      `Inter Miami.\n`
    : '';

  return (
    `Today's date is ${today}.\n\n` +
    `You have been given real-time web search results. They are ` +
    `CURRENT and take priority over anything you may have learned ` +
    `during training.\n\n` +
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
    `6. DATE CHECK: if the user asks for "آخر"/"latest"/"recent" ` +
    `and the best match is older than 3 months, reply: ` +
    `"لم أجد معلومات حديثة في المصادر المتاحة."\n` +
    `7. MATCH the user's language.\n` +
    `8. START WITH THE ANSWER directly. No preamble.\n` +
    `9. Use Markdown for structure.\n` +
    footballRule
  );
}

async function buildMessages(safeMessages: GrokMessage[]): Promise<{
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

  const isFootball =
    Boolean(lastUserMessage) && looksLikeFootball(lastUserMessage);
  const isTech = Boolean(lastUserMessage) && looksLikeTech(lastUserMessage);

  const shouldSearch =
    Boolean(lastUserMessage) &&
    needsSearch(lastUserMessage) &&
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

export default router;
