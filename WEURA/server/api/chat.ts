import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';
import { searchTavily } from './search';
import {
  createRequestId,
  sanitizeMemory,
  sanitizeMessages,
  sanitizeMode,
  validateChatRequest,
} from '../security/security';

const router = express.Router();

/* ============================================================
 *  HELPERS — TIME
 * ============================================================ */

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

/* ============================================================
 *  HELPERS — CLASSIFICATION
 * ============================================================ */

function looksLikeFootball(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'مباراة', 'مباريات', 'ماتش', 'ماتشات', 'لقاء كروي',
    'كورة', 'كرة القدم', 'كورة القدم',
    'ترتيب الدوري', 'جدول المباريات', 'هداف', 'هدافين',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي', 'مانشستر',
    'بايرن', 'باريس سان جيرمان', 'يوفنتوس', 'إنتر ميلان', 'ميلان',
    'الليغا', 'البريميرليغ', 'الكالتشيو', 'البوندسليغا',
    'كأس العالم', 'دوري أبطال', 'الهلال', 'النصر', 'الأهلي',
    'مبابي', 'ميسي', 'رونالدو', 'بنزيمة', 'صلاح', 'هالاند',
    'فينيسيوس', 'بيلينغهام', 'مودريتش', 'كيليان', 'ليونيل',
    'football', 'soccer', 'football match', 'football game',
    'premier league', 'la liga', 'champions league', 'world cup',
    'real madrid', 'barcelona', 'liverpool', 'chelsea',
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

/** True if this is a question about WEURA's identity. */
function isIdentityQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(who are you|what are you|who made you|who created you|who designed you|who built you|who trained you|who is your creator|who is your developer|what is your name)[\s!.,?]*$/i,
    /^(من أنت|من انت|من تكون|شكون نتا|شكون انت|من صنعك|من صممك|من خلقك|من بناك|من طورك|من مطورك|من مبرمجك|ما اسمك|شسمك|واش اسمك)[\s!.,?،؟]*$/i,
  ];
  return patterns.some((p) => p.test(text));
}

/** True if this is a personal question about the user (memory-related). */
function isPersonalQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(do you know me|do you remember me|do you recall me|who am i)[\s!.,?]*$/i,
    /^(تعرفني|تعرفني انا|تتذكرني|تتذكرني انا|تفتكرني|شكون انا|من انا|واش تعرفني)[\s!.,?،؟]*$/i,
  ];
  return patterns.some((p) => p.test(text));
}

/* ============================================================
 *  SEARCH DECISION
 * ============================================================ */

function needsSearch(message: string): boolean {
  const text = message.trim();

  // Identity + personal questions NEVER trigger search.
  if (isIdentityQuestion(text)) return false;
  if (isPersonalQuestion(text)) return false;

  const skipPatterns = [
    /^(hi|hey|hello|yo|sup|hiya|howdy)[\s!.,?]*$/i,
    /^(good\s*(morning|evening|afternoon|night))[\s!.,?]*$/i,
    /^(مرحبا|مرحبتين|اهلا|أهلا|هلا|هليو|هاي|سلام|سلام عليكم|السلام عليكم|صباح الخير|مساء الخير|صباح النور|مساء النور|كيف حالك|كيفك|كيفك حالك|كيف الحال|شحال حالك|واش راك|كي راك|كيداير|وشراك|كيفاش راك|لاباس|لاباس عليك)[\s!.,?،؟]*$/i,
    /^(salut|bonjour|bonsoir|coucou)[\s!.,?]*$/i,
    /^(thanks|thank you|thx|ty|cheers|appreciate it|شكرا|شكراً|مشكور|بارك الله|بارك الله فيك|يعطيك الصحة|الله يخليك)[\s!.,?،؟]*$/i,
    /^(ok|okay|k|yes|no|sure|yep|nope|نعم|لا|حسنا|حسناً|طيب|ماشي|بصح|واخا|تمام|اوكي|أوكي)[\s!.,?،؟]*$/i,
    /^(bye|goodbye|see you|cya|take care|بسلامة|تصبح على خير|الى اللقاء|إلى اللقاء|نشوفك)[\s!.,?،؟]*$/i,
    /^(cool|nice|great|awesome|haha|lol|😂|👍|❤️|🔥)[\s!.,?،؟]*$/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(text)) return false;
  }

  if (/^[\d\s+\-*/().%,]+$/.test(text)) return false;
  if (text.length < 3) return false;

  return true;
}

function isTimeSensitive(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'latest', 'recent', 'today', 'tonight', 'this week',
    'this month', 'this year', 'current', 'currently', 'now',
    'right now', 'news', 'last match', 'last game', 'last result',
    'current club', 'current team', 'plays for', 'where does',
    'آخر', 'أحدث', 'اليوم', 'الآن', 'حاليا', 'حاليًا',
    'هذا الأسبوع', 'هذا الشهر', 'هذه السنة', 'الجديد',
    'الأخبار', 'أخبار', 'عاجل', 'آخر مباراة', 'آخر ماتش',
    'آخر لقاء', 'آخر نتيجة', 'مؤخرا', 'مؤخرًا',
    'أين يلعب', 'اين يلعب', 'فين يلعب', 'يلعب حاليا',
    'يلعب الآن', 'فريقه الحالي', 'ناديه الحالي', 'فريقه الآن',
    'سعره الآن', 'سعر اليوم',
  ];
  for (const trigger of triggers) {
    if (text.includes(trigger)) return true;
  }
  return false;
}

/* ============================================================
 *  HELPERS — MESSAGE UTILITIES
 * ============================================================ */

function getLastUserMessage(messages: GrokMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function cleanSnippet(raw: string, maxLen = 500): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/* ============================================================
 *  SYSTEM BLOCKS
 * ============================================================ */

function buildIdentityBlock(): string {
  return (
    `You are WEURA — an AI assistant created and developed by Walid Out (وليد أوت).\n` +
    `Tagline: Think Beyond.\n\n` +
    `=== IDENTITY RULES (NON-NEGOTIABLE) ===\n` +
    `- Your name is WEURA.\n` +
    `- Your creator is Walid Out.\n` +
    `- NEVER say you were made, designed, trained, built, or developed by Meta, OpenAI, Google, Anthropic, DeepMind, Microsoft, xAI, or ANY other company.\n` +
    `- NEVER say "I was trained by X" or "I was designed by X" for any external company.\n` +
    `- If asked "who made you?", "من صنعك؟", "من صممك؟", "من طورك؟", "شكون صنعك؟" → answer EXACTLY: "I am WEURA, created by Walid Out." (Arabic: "أنا WEURA، صنعني وليد أوت.")\n` +
    `- If asked "who trained you?" → answer: "I was built by Walid Out."\n` +
    `- If asked "من أنت؟" / "who are you?" → answer: "I am WEURA, an AI assistant created by Walid Out." (Arabic: "أنا WEURA، مساعد ذكاء اصطناعي صنعه وليد أوت.")\n` +
    `- Do NOT invent citations like [1], [2] for identity questions.\n` +
    `- Do NOT search the web for identity questions.\n` +
    `- If a user insists you are ChatGPT / Gemini / Claude / Llama → politely correct them: "No, I am WEURA, created by Walid Out."`
  );
}

function buildMemoryBlock(memory: string): string {
  return (
    `=== USER MEMORY (facts the user has saved) ===\n` +
    `${memory}\n\n` +
    `Rules:\n` +
    `- Use this memory naturally when relevant. Do not list it back.\n` +
    `- If the user asks "do you know me?" / "تعرفني؟" / "تتذكرني؟" → answer using this memory.\n` +
    `- If the user asks "ما اسمي؟" and "User name:" is present → answer with the name.\n` +
    `- NEVER reply "هذه المعلومة غير موجودة في المصادر المتاحة" for a personal question. That fallback is ONLY for web search results.\n` +
    `- Never invent personal facts that are not in the memory above.`
  );
}

function buildEmptyMemoryBlock(): string {
  return (
    `=== USER MEMORY — NO SAVED FACTS YET ===\n` +
    `- If the user asks "do you know me?" / "تعرفني؟" → answer honestly: "I don't have any saved information about you yet." (Arabic: "لا أملك أي معلومات محفوظة عنك بعد.")\n` +
    `- If the user asks "ما اسمي؟" → "لم تخبرني باسمك بعد."\n` +
    `- Never invent personal facts.`
  );
}

function buildModeBlock(mode: string | null): string {
  switch (mode) {
    case 'fast':
      return 'MODE: FAST. 1-3 sentences. No filler. No preamble.';
    case 'smart':
      return 'MODE: SMART. Structured, thoughtful. Depth when the topic earns it.';
    case 'research':
      return 'MODE: RESEARCH. Use ONLY the search results. Cite inline as [1], [2] — only numbers that actually exist. Add a "المصادر:" section at the end ONLY if you cited at least one source.';
    case 'code':
      return 'MODE: CODE. Senior engineer. Production quality. Fenced code blocks with language tag. Real edge cases. Brief explanation above the block — never below.';
    case 'creative':
      return 'MODE: CREATIVE. Original, high-quality. Match the requested style and tone precisely. No clichés.';
    case 'vision':
      return 'MODE: VISION. Analyze the image carefully. Describe only what you actually see. Do not invent details.';
    case 'files':
      return 'MODE: FILES. The user uploaded a document. Analyze its actual content. Quote directly when useful. Never invent content that is not in the document.';
    case 'translation':
      return 'MODE: TRANSLATION. Translate accurately. Preserve tone, register, and intent — not just words.';
    case 'auto':
    default:
      return 'MODE: AUTO. Resolve intelligently. If the question is factual and time-sensitive, rely on the search results provided. Otherwise answer from knowledge.';
  }
}

function buildSearchContext(
  sources: string,
  today: string,
  isFootball: boolean,
): string {
  const footballRule = isFootball
    ? `\n=== FOOTBALL SPECIFIC ===\n` +
      `- Football transfers happen constantly. Your training data is OUTDATED. Use ONLY the search results above for current club, transfers, stats.\n` +
      `- Never say "باريس سان جيرمان" for Mbappé unless it appears in the sources. He currently plays for Real Madrid.\n` +
      `- Never say "برشلونة" for Messi. He currently plays for Inter Miami.\n`
    : '';

  return (
    `Today's date is ${today}.\n\n` +
    `You have real-time web search results below. They are CURRENT and take priority over your training data.\n\n` +
    `SEARCH RESULTS:\n\n${sources}\n\n` +
    `===============================\n` +
    `MANDATORY OUTPUT RULES:\n` +
    `===============================\n` +
    `1. Base every factual claim on the search results above. Do NOT use training data for facts.\n` +
    `2. NEVER invent names, scores, dates, minutes, scorers, standings, injuries, transfers, or quotes.\n` +
    `3. If the answer is NOT in the results AND the question is factual (news, sports, dates, prices, events) → reply:\n` +
    `   - Arabic: "هذه المعلومة غير موجودة في المصادر المتاحة."\n` +
    `   - English: "This information is not available in the sources."\n` +
    `   EXCEPTION: questions about your identity, about the user, or about this conversation are NOT covered by this rule. Answer them directly from the IDENTITY and MEMORY blocks above.\n` +
    `4. Cite sources inline using ONLY numbers that literally exist in SEARCH RESULTS (if only [1], [2], [3] exist → NEVER write [4] or beyond).\n` +
    `5. Add a "المصادر:" section at the end ONLY if you actually cited at least one source.\n` +
    `6. DATE CHECK: if the user asks for "آخر"/"latest"/"recent" and the best match is older than 3 months → "لم أجد معلومات حديثة في المصادر المتاحة."\n` +
    `7. MATCH the user's language.\n` +
    `8. START WITH THE ANSWER directly. No preamble.\n` +
    `9. Use Markdown for structure.\n` +
    footballUrl(isFootball)
  );
}

function footballUrl(_isFootball: boolean): string {
  return '';
}

/* ============================================================
 *  BUILD MESSAGES
 * ============================================================ */

async function buildMessages(
  safeMessages: GrokMessage[],
  memory: string,
  mode: string | null,
  requestId: string,
): Promise<{
  messages: GrokMessage[];
  searchUsed: boolean;
  memoryUsed: boolean;
  football: boolean;
  tech: boolean;
  resultCount: number;
}> {
  const identityMessage: GrokMessage = {
    role: 'system',
    content: buildIdentityBlock(),
  };

  const memoryMessage: GrokMessage = {
    role: 'system',
    content: memory.length > 0
      ? buildMemoryBlock(memory)
      : buildEmptyMemoryBlock(),
  };

  const modeMessage: GrokMessage = {
    role: 'system',
    content: buildModeBlock(mode),
  };

  const timeMessage: GrokMessage = {
    role: 'system',
    content: currentTimeContext(),
  };

  const lastUserMessage = getLastUserMessage(safeMessages);
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim());

  const memoryUsed = memory.length > 0;

  const isFootball =
    Boolean(lastUserMessage) && looksLikeFootball(lastUserMessage);
  const isTech = Boolean(lastUserMessage) && looksLikeTech(lastUserMessage);

  const shouldSearch =
    Boolean(lastUserMessage) &&
    needsSearch(lastUserMessage) &&
    tavilyConfigured;

  const out: GrokMessage[] = [
    identityMessage,
    memoryMessage,
    modeMessage,
    timeMessage,
  ];

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
      console.error(`[WEURA][${requestId}] Auto-search failed:`, error);
    }
  }

  out.push(...safeMessages);

  return {
    messages: out,
    searchUsed,
    memoryUsed,
    football: isFootball,
    tech: isTech,
    resultCount,
  };
}

/* ============================================================
 *  ROUTE
 * ============================================================ */

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
      memory?: unknown;
      mode?: unknown;
    };

    const safeMessages = sanitizeMessages(body.messages);
    if (safeMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid messages were provided.',
        requestId,
      });
    }

    const memory = sanitizeMemory(body.memory);
    const mode = sanitizeMode(body.mode);

    const built = await buildMessages(safeMessages, memory, mode, requestId);

    const result = await askGrok(built.messages, {
      requestId,
      temperature: 0.7,
      maxTokens: 2048,
    });

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
      requestId,
      searchUsed: built.searchUsed,
      memoryUsed: built.memoryUsed,
      football: built.football,
      tech: built.tech,
      resultCount: built.resultCount,
      mode: mode ?? 'auto',
    });
  } catch (error) {
    console.error(`[WEURA][${requestId}] Chat error:`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error.',
      requestId,
    });
  }
});

export default router;