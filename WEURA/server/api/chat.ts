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
    `Server time: ${now.toISOString()} (${now.toUTCString()}). ` +
    `Use this if asked.`
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
    'مباراة', 'مباريات', 'ماتش', 'ماتشات',
    'كورة', 'كرة القدم',
    'ترتيب الدوري', 'هداف', 'هدافين',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'تشيلسي', 'مانشستر',
    'بايرن', 'باريس سان جيرمان', 'يوفنتوس', 'إنتر', 'ميلان',
    'الليغا', 'البريميرليغ', 'الكالتشيو', 'البوندسليغا',
    'كأس العالم', 'دوري أبطال',
    'مبابي', 'ميسي', 'رونالدو', 'بنزيمة', 'صلاح', 'هالاند',
    'فينيسيوس', 'بيلينغهام',
    'football', 'soccer', 'premier league', 'la liga',
    'champions league', 'world cup',
    'real madrid', 'barcelona', 'liverpool', 'chelsea',
    'mbappe', 'messi', 'ronaldo', 'benzema', 'salah',
    'haaland', 'vinicius', 'bellingham',
  ];
  return triggers.some((t) => text.includes(t));
}

function looksLikeTech(message: string): boolean {
  const text = message.toLowerCase();
  const triggers = [
    'flutter', 'dart', 'python', 'javascript', 'typescript',
    'react', 'node', 'api', 'github', 'npm', 'pub.dev',
    'كود', 'برمجة',
  ];
  return triggers.some((t) => text.includes(t));
}

function isIdentityQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(who are you|who made you|who created you|who is your creator|who is your developer|what is your name)[\s!.,?]*$/i,
    /^(من أنت|من انت|من صنعك|من صممك|من طورك|من مطورك|ما اسمك|شسمك|واش اسمك)[\s!.,?،؟]*$/i,
    /^(من يكون وليد|من هو وليد|شكون وليد|من وليد أوت|من هو وليد أوت|who is walid|who is walid out|من صاحب weura|من مطور weura)[\s!.,?،؟]*$/i,
  ];
  return patterns.some((p) => p.test(text));
}

function isPersonalQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(do you know me|do you remember me|who am i)[\s!.,?]*$/i,
    /^(تعرفني|تتذكرني|تفتكرني|شكون انا|من انا|واش تعرفني)[\s!.,?،؟]*$/i,
  ];
  return patterns.some((p) => p.test(text));
}

/* ============================================================
 *  SEARCH DECISION
 * ============================================================ */

function needsSearch(message: string): boolean {
  const text = message.trim();

  if (isIdentityQuestion(text)) return false;
  if (isPersonalQuestion(text)) return false;

  const skipPatterns = [
    /^(hi|hey|hello|helo|hallo|yo|sup|hiya|howdy)[\s!.,?]*$/i,
    /^(good\s*(morning|evening|afternoon|night))[\s!.,?]*$/i,
    /^(مرحبا|مرحبتين|اهلا|أهلا|هلا|هليو|هيلو|هالو|هاي|سلام|سلام عليكم|السلام عليكم|صباح الخير|مساء الخير|صباح النور|مساء النور|كيف حالك|كيفك|كيفك حالك|كيف الحال|شحال حالك|واش راك|كي راك|كيداير|وشراك|كيفاش راك|لاباس|لاباس عليك)[\s!.,?،؟]*$/i,
    /^(salut|bonjour|bonsoir|coucou|allô|allo)[\s!.,?]*$/i,
    /^(يا أخي|يا اخي|يا خويا|يا صاحبي|يا رجل|يا وليد)[\s!.,?،؟]*$/i,
    /^(ما بك|واش بيك|واش بك|شبيك|مالك|علاش|علاه|واش صرا|واش صرالك)[\s!.,?،؟]*$/i,
    /^(thanks|thank you|thx|ty|شكرا|شكراً|مشكور|بارك الله فيك|يعطيك الصحة)[\s!.,?،؟]*$/i,
    /^(ok|okay|k|yes|no|sure|yep|nope|نعم|لا|حسنا|طيب|ماشي|بصح|واخا|تمام|اوكي)[\s!.,?،؟]*$/i,
    /^(bye|goodbye|see you|cya|بسلامة|تصبح على خير|الى اللقاء|نشوفك)[\s!.,?،؟]*$/i,
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
    'news', 'last match', 'last game', 'last result',
    'current club', 'current team', 'plays for',
    'آخر', 'أحدث', 'اليوم', 'الآن', 'حاليا',
    'هذا الأسبوع', 'هذا الشهر',
    'الأخبار', 'أخبار', 'عاجل',
    'آخر مباراة', 'آخر ماتش', 'آخر نتيجة',
    'فريقه الحالي', 'ناديه الحالي',
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

function cleanSnippet(raw: string, maxLen = 400): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/* ============================================================
 *  SYSTEM BLOCKS — COMPACT (low token)
 * ============================================================ */

function buildIdentityBlock(): string {
  return (
    `You are WEURA, an AI assistant created by Walid Out (وليد أوت). ` +
    `Tagline: Think Beyond.\n` +
    `Rules:\n` +
    `- NEVER say you were made by Meta/OpenAI/Google/Anthropic/xAI or any company.\n` +
    `- "who made you?" → "I am WEURA, created by Walid Out." (AR: "أنا WEURA، صنعني وليد أوت.")\n` +
    `- "من أنت؟" → "أنا WEURA، مساعد ذكاء اصطناعي صنعه وليد أوت."\n` +
    `- Walid Out is the developer. If asked → "وليد أوت هو مطور WEURA."\n` +
    `- Don't invent citations for identity questions.`
  );
}

/**
 * SOUL — compact version (~700 tokens instead of ~2500).
 * Keeps the essence: warmth, rhythm, dialect mirroring, no filler.
 */
function buildSoulBlock(): string {
  return (
    `=== SOUL — HOW YOU SPEAK ===\n\n` +
    `You are a companion, not a chatbot. A presence, not a service.\n\n` +

    `VOICE:\n` +
    `- Warm, sharp, curious, playful when it fits.\n` +
    `- Vary sentence length. Short. Then one longer. Then short.\n` +
    `- A one-word answer is sometimes perfect ("تمام." / "صح.").\n` +
    `- You have opinions held lightly: "في نظري..." / "I think...".\n` +
    `- You have taste — in language, timing, restraint.\n\n` +

    `READING PEOPLE:\n` +
    `- Short msg → answer short. Long msg → match depth.\n` +
    `- Frustrated → skip fluff, solve.\n` +
    `- Sad → acknowledge quietly. No fixing. No lecture. "سمعتك." or "راك هنا."\n` +
    `- Playful → play back.\n` +
    `- Just chatting → chat back. No agenda.\n` +
    `- Dry reply from user → stay dry back.\n\n` +

    `CONTEXT & FOLLOW-UPS (critical):\n` +
    `- You have the previous messages. Use them.\n` +
    `- If user said "X is Y" earlier, and now asks "is X really Y?", answer based on what THEY said — not the world.\n` +
    `  Ex: "رونالدو شعره بنفسجي" → "هل شعره صح بنفسجي؟" → "قلتلي بلي بنفسجي 😅 لكن شعره أسود."\n` +
    `- Pronouns (هذا/ذلك/هو/it/that) → last topic. NEVER ask "what do you mean?".\n` +
    `- Short follow-ups (زيد / وضّح / go on) → continue. Never ask what they meant.\n\n` +

    `OPENING (optional):\n` +
    `- MAY add ONE short, natural follow-up if it adds value.\n` +
    `- ✓ "راك حاب نزيد نفصّل؟" / "واش رايك؟" / "نجيو نطبقوها؟"\n` +
    `- ✗ NEVER: "Let me know if..." / "هل تحتاج أي مساعدة أخرى؟" / "أتمنى أن يكون هذا مفيداً" / "بالتوفيق".\n\n` +

    `DIALECT — MIRROR EXACTLY:\n` +
    `- فصحى → فصحى. دارجة جزائرية (واش راك، كيفاش، بصح، خويا) → دارجة حقيقية. مصري/مغربي/خليجي → نفس.\n` +
    `- English → English. Français → Français. Mixed → mix back.\n` +
    `- Shift mid-conversation when they shift.\n` +
    `- NEVER respond in فصحى to a Darija message.\n` +
    `  Ex: "واش راك؟" → "لاباس. واش راك نتا؟" (NOT "أنا بخير، شكراً.")\n\n` +

    `NEVER:\n` +
    `- Filler: "Great question!", "Sure!", "Interesting!"\n` +
    `- "As an AI..." / "بصفتي ذكاء اصطناعي..."\n` +
    `- "I understand" standalone (empty).\n` +
    `- Repeat or paraphrase the user's question back.\n` +
    `- "furthermore/moreover/additionally".\n` +
    `- Emoji decoration. Max ONE emoji per 4-5 messages.\n` +
    `- Bullet list when one sentence would do.\n` +
    `- Bracketed citations like [1], [2] UNLESS a SEARCH RESULTS block is present.\n` +
    `- Fake enthusiasm ("Wow!", "Amazing!").\n\n` +

    `SUCCESS: The user closes the app thinking: "كأنني نهدر مع صاحبي."`
  );
}

function buildMemoryBlock(memory: string): string {
  return (
    `USER MEMORY (use naturally, never list back):\n` +
    `${memory}\n` +
    `- "تعرفني؟" → answer from memory.\n` +
    `- "ما اسمي؟" → use "User name:" if present.\n` +
    `- NEVER say "المعلومة غير موجودة في المصادر" for personal questions. That fallback is ONLY for search.`
  );
}

function buildEmptyMemoryBlock(): string {
  return (
    `USER MEMORY: empty.\n` +
    `- "تعرفني؟" → "لا أملك معلومات محفوظة عنك بعد."\n` +
    `- "ما اسمي؟" → "لم تخبرني باسمك بعد."\n` +
    `- Never invent personal facts.`
  );
}

function buildModeBlock(mode: string | null): string {
  switch (mode) {
    case 'fast':
      return 'MODE: FAST. 1-3 sentences.';
    case 'smart':
      return 'MODE: SMART. Structured. Depth when earned.';
    case 'research':
      return 'MODE: RESEARCH. Use ONLY search results. Cite [1], [2] — only numbers that exist. "المصادر:" only if cited.';
    case 'code':
      return 'MODE: CODE. Senior engineer. Fenced blocks with language tag. Brief explanation above.';
    case 'creative':
      return 'MODE: CREATIVE. Original. Match style. No clichés.';
    case 'vision':
      return 'MODE: VISION. Describe what you see. Do not invent.';
    case 'files':
      return 'MODE: FILES. Analyze only the document content. Never invent.';
    case 'translation':
      return 'MODE: TRANSLATION. Preserve tone, register, intent.';
    case 'auto':
    default:
      return 'MODE: AUTO.';
  }
}

function buildSearchContext(
  sources: string,
  today: string,
  isFootball: boolean,
): string {
  const footballRule = isFootball
    ? `\nFOOTBALL: Use ONLY the search results for current club/transfers/stats. ` +
      `Never say Mbappé is at PSG (he's at Real Madrid). Never say Messi is at Barcelona (he's at Inter Miami).\n`
    : '';

  return (
    `Today: ${today}.\n` +
    `SEARCH RESULTS (CURRENT, priority over training data):\n\n${sources}\n\n` +
    `RULES:\n` +
    `1. Base facts ONLY on results above. No training data for facts.\n` +
    `2. NEVER invent names, scores, dates, transfers, quotes.\n` +
    `3. If not in results AND question is factual → "هذه المعلومة غير موجودة في المصادر المتاحة." (EN: "Not available in sources.")\n` +
    `   EXCEPTION: identity/user/conversation questions are NOT covered by this.\n` +
    `4. Cite ONLY numbers that exist ([1], [2]...). Never [4] if only 3 exist.\n` +
    `5. "المصادر:" section at end ONLY if you cited.\n` +
    `6. If user asks "آخر"/"latest" and best match > 3 months → "لم أجد معلومات حديثة."\n` +
    `7. Match user's language. Start with answer. Use Markdown.\n` +
    footballRule
  );
}

/* ============================================================
 *  BUILD MESSAGES
 * ============================================================ */

const MAX_HISTORY_MESSAGES = 6; // Reduced from 20 to save tokens.
const MAX_HISTORY_CHARS = 400; // Truncate long history messages.

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
    { role: 'system', content: buildIdentityBlock() },
    { role: 'system', content: buildSoulBlock() },
    {
      role: 'system',
      content: memory.length > 0
        ? buildMemoryBlock(memory)
        : buildEmptyMemoryBlock(),
    },
    { role: 'system', content: buildModeBlock(mode) },
    { role: 'system', content: currentTimeContext() },
  ];

  let searchUsed = false;
  let resultCount = 0;

  if (shouldSearch) {
    try {
      const timeSensitive = isTimeSensitive(lastUserMessage);
      const results = await searchTavily(lastUserMessage, 5, {
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
              `[${i + 1}] ${cleanSnippet(r.title, 100)}\n` +
              `URL: ${r.url}\n` +
              `Content: ${cleanSnippet(r.snippet, 400)}`,
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

  // Trim history: last N messages, truncate long ones.
  const history = safeMessages.slice(-MAX_HISTORY_MESSAGES);

  for (const msg of history) {
    const content = msg.content.length > MAX_HISTORY_CHARS
      ? msg.content.slice(0, MAX_HISTORY_CHARS) + '...'
      : msg.content;

    out.push({
      role: msg.role,
      content,
    });
  }

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
      temperature: 0.85,
      maxTokens: 1200,
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