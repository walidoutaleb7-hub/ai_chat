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
 *  SMART RESPONSE CACHE
 * ============================================================ */

type CacheEntry = {
  content: string;
  model: string;
  provider: string;
  searchUsed: boolean;
  resultCount: number;
  reflection: {
    need_search: boolean;
    reason: string;
    search_query: string;
    angle: string;
  };
  expiresAt: number;
};

const RESPONSE_CACHE = new Map<string, CacheEntry>();

const CACHE_TTL_NEWS_MS = 15 * 60 * 1000; // 15 min
const CACHE_TTL_FACT_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX = 500;

function pruneResponseCache(): void {
  const now = Date.now();
  for (const [key, entry] of RESPONSE_CACHE.entries()) {
    if (entry.expiresAt <= now) RESPONSE_CACHE.delete(key);
  }
  if (RESPONSE_CACHE.size > CACHE_MAX) {
    const overflow = RESPONSE_CACHE.size - CACHE_MAX;
    let removed = 0;
    for (const key of RESPONSE_CACHE.keys()) {
      if (removed >= overflow) break;
      RESPONSE_CACHE.delete(key);
      removed++;
    }
  }
}

setInterval(pruneResponseCache, 5 * 60 * 1000).unref();

function buildCacheKey(userMessage: string): string {
  return userMessage.trim().toLowerCase().slice(0, 200);
}

function pickTTL(userMessage: string, searchUsed: boolean): number {
  const lower = userMessage.toLowerCase();

  // Time-specific questions → NEVER cache (they change constantly).
  if (/\b(time|الساعة|الوقت|دقيقة|ساعة|كم الساعة|شحال الساعة)\b/i.test(lower)) {
    return 0;
  }

  if (
    /(آخر|أحدث|اليوم|الآن|حاليا|عاجل|breaking|latest|today|now|recent)/i.test(
      lower,
    )
  ) {
    return CACHE_TTL_NEWS_MS;
  }
  if (searchUsed) return CACHE_TTL_NEWS_MS;
  return CACHE_TTL_FACT_MS;
}

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
 *  REFLECTION LAYER
 * ============================================================ */

const REFLECTION_SYSTEM_PROMPT = `You are WEURA's inner reasoning layer.

Your ONLY job: decide if the user's message requires a REAL-TIME WEB SEARCH,
or if it can be answered from general knowledge + user memory.

═══ DECISION RULES ═══

SEARCH NEEDED (need_search = true):
- Current events, news, "what happened", "latest", "today"
- Sports: current managers, players' current clubs, transfers, standings,
  match results, awards (Ballon d'Or, etc.), stats
- Prices, stocks, market data
- Weather
- Anything with a year (2020-2030) + event
- Questions about specific people's CURRENT roles/positions
- "Who won / who is the current / when did X happen recently"
- Anything that could have changed since ~2024

NO SEARCH (need_search = false):
- Greetings, thanks, casual chat, follow-ups
- Personal questions about the user (use memory)
- Identity questions about WEURA
- Math, science, programming concepts, definitions
- Writing, coding, translations, creativity
- Stable historical facts (before 2020)
- **Comparison questions** (X vs Y, "قارن بين", "الفرق بين",
  "which is better", "difference between")
- **Opinion / advice questions** ("شنو رايك", "شنو تنصحني",
  "what do you think", "should I")
- **Analysis / explanation questions** ("اشرح", "حلل", "علاش",
  "how does X work", "explain", "why does")
- **How-to / tutorial questions** ("كيفاش نكتب", "علمني",
  "how to", "teach me")
- **Career / study / skill advice** ("توظيف", "مستقبل",
  "career", "job market", "learning path")
- **Language / translation help**
- **Coding questions** of any kind

CRITICAL: If the question asks for OPINION, COMPARISON, ANALYSIS,
ADVICE, EXPLANATION, or HOW-TO → need_search = false.
Even if it mentions a country, a technology, or a topic.

═══ OUTPUT ═══
Return ONLY valid JSON (no markdown, no explanation):

{
  "need_search": true | false,
  "reason": "short reason (max 80 chars)",
  "search_query": "optimized query for web search (empty if need_search=false)",
  "angle": "how to approach the answer (max 100 chars, in user's language)"
}`;

type ReflectionResult = {
  needSearch: boolean;
  reason: string;
  searchQuery: string;
  angle: string;
};

async function reflectOnQuery(
  userMessage: string,
  memory: string,
  requestId: string,
): Promise<ReflectionResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    return {
      needSearch: fallbackNeedsSearch(userMessage),
      reason: 'no-key-fallback',
      searchQuery: userMessage,
      angle: '',
    };
  }

  // Use up to 800 chars of memory — first 400 + last 400 if too long.
  let memorySnippet = '';
  const trimmedMemory = memory.trim();
  if (trimmedMemory.length > 0) {
    const snippet =
      trimmedMemory.length > 800
        ? `${trimmedMemory.slice(0, 400)}\n...\n${trimmedMemory.slice(-400)}`
        : trimmedMemory;
    memorySnippet = `\nUser memory (short):\n${snippet}`;
  }

  const userPrompt =
    `User message:\n"${userMessage}"${memorySnippet}\n\n` +
    `Decide: search or not? Return JSON.`;

  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:
            process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: 'json_object' },
          tools: [],
          tool_choice: 'none',
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const content = String(
      data?.choices?.[0]?.message?.content ?? '',
    ).trim();

    if (!content) throw new Error('Empty reflection');

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Invalid JSON');
      parsed = JSON.parse(match[0]);
    }

    const needSearch = parsed?.need_search === true;
    const searchQuery = String(parsed?.search_query ?? '').trim();
    const reason = String(parsed?.reason ?? '').trim().slice(0, 120);
    const angle = String(parsed?.angle ?? '').trim().slice(0, 150);

    console.log(
      `[WEURA][${requestId}] Reflection: need_search=${needSearch}, ` +
        `reason="${reason}"`,
    );

    return {
      needSearch,
      reason,
      searchQuery: searchQuery || userMessage,
      angle,
    };
  } catch (error) {
    console.warn(
      `[WEURA][${requestId}] Reflection failed: ${
        error instanceof Error ? error.message : error
      }. Falling back to triggers.`,
    );

    return {
      needSearch: fallbackNeedsSearch(userMessage),
      reason: 'fallback',
      searchQuery: userMessage,
      angle: '',
    };
  }
}

/* ============================================================
 *  FALLBACK — trigger-based
 * ============================================================ */

function fallbackNeedsSearch(message: string): boolean {
  const text = message.trim();
  if (text.length < 3) return false;
  if (/^[\d\s+\-*/().%,]+$/.test(text)) return false;

  const skip = [
    /^(hi|hey|hello|yo|سلام|مرحبا|صباح الخير|مساء الخير|salut|bonjour)[\s!.,?،؟]*$/i,
    /^(thanks|thank you|شكرا|مشكور)[\s!.,?،؟]*$/i,
    /^(ok|okay|yes|no|نعم|لا|حسنا|طيب|ماشي)[\s!.,?،؟]*$/i,
    /^(bye|goodbye|بسلامة|الى اللقاء)[\s!.,?،؟]*$/i,
  ];
  if (skip.some((p) => p.test(text))) return false;

  // Comparison / opinion / analysis / how-to → NEVER search.
  const neverSearch = [
    /\b(قارن|الفرق بين|شنو رايك|شو رايك|رايك|تنصحني|علاش|كيفاش|كيف)\b/i,
    /\b(compare|comparison|vs\.?|versus|difference between|which is better)\b/i,
    /\b(what do you think|should i|opinion|advice|how to|how do i|explain)\b/i,
    /\b(اشرح|حلل|علمني|وضحلي|فسرلي)\b/i,
  ];
  if (neverSearch.some((p) => p.test(text))) return false;

  return true;
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
 *  CLASSIFICATION (lightweight, for cache decision)
 * ============================================================ */

function isIdentityQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(who are you|who made you|who created you|what is your name)[\s!.,?]*$/i,
    /^(من أنت|من انت|من صنعك|من صممك|من طورك|ما اسمك|شسمك)[\s!.,?،؟]*$/i,
  ];
  return patterns.some((p) => p.test(text));
}

function isPersonalQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  const patterns = [
    /^(do you know me|do you remember me|who am i)[\s!.,?]*$/i,
    /^(تعرفني|تتذكرني|تفتكرني|شكون انا|من انا)[\s!.,?،؟]*$/i,
    /\b(واش تعرفني|واش تتذكرني|تعرفني ولا لا|تتذكرني ولا لا)\b/i,
    /\b(do you know me|remember me|who am i to you)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}

function isCasualMessage(message: string): boolean {
  const text = message.trim();
  const skip = [
    /^(hi|hey|hello|yo|سلام|مرحبا|صباح الخير|مساء الخير|salut|bonjour)[\s!.,?،؟]*$/i,
    /^(thanks|thank you|شكرا|مشكور)[\s!.,?،؟]*$/i,
    /^(ok|okay|yes|no|نعم|لا|حسنا|طيب|ماشي)[\s!.,?،؟]*$/i,
    /^(bye|goodbye|بسلامة)[\s!.,?،؟]*$/i,
    /^(كيف حالك|كيفك|واش راك|كي راك|لاباس)[\s!.,?،؟]*$/i,
    /^(زيد|وضّح|كمل|go on|continue)[\s!.,?،؟]*$/i,
  ];
  return skip.some((p) => p.test(text));
}

/* ============================================================
 *  SYSTEM BLOCKS
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
    `CONTEXT & FOLLOW-UPS:\n` +
    `- You have the previous messages. Use them.\n` +
    `- If user said "X is Y" earlier, and now asks "is X really Y?", answer based on what THEY said.\n` +
    `- Pronouns (هذا/ذلك/هو/it/that) → last topic. NEVER ask "what do you mean?".\n` +
    `- Short follow-ups (زيد / وضّح / go on) → continue. Never ask what they meant.\n\n` +
    `FACTS & AWARDS (CRITICAL):\n` +
    `- For ANY question about AWARDS, MANAGERS, current club/player status, news,\n` +
    `  prices, or current events → rely ONLY on the search results when they are provided.\n` +
    `- NEVER answer these from training data alone.\n` +
    `- If search results are absent AND the question is about a recent fact → reply:\n` +
    `  "ما عنديش معلومة مؤكدة."\n` +
    `- Do NOT invent dates, names, or winners.\n\n` +
    `COMPARISON, OPINION, ANALYSIS, HOW-TO (IMPORTANT):\n` +
    `- These are NEVER "current facts". Answer from your own knowledge.\n` +
    `- NEVER reply "هذه المعلومة غير موجودة في المصادر المتاحة" for:\n` +
    `    • Comparisons (X vs Y, قارن بين، الفرق بين)\n` +
    `    • Opinions / advice (شنو رايك، تنصحني، should I)\n` +
    `    • Explanations / analysis (اشرح، حلل، علاش، كيفاش)\n` +
    `    • How-to / tutorials (علمني، كيفاش نكتب)\n` +
    `    • Career / study / job market questions\n` +
    `    • Coding / technical questions\n` +
    `- You DO know these things. Give a real, structured answer.\n` +
    `- If part of the question needs current data (e.g. "job market in Algeria 2025"),\n` +
    `  use search results IF provided. Otherwise use your best general knowledge\n` +
    `  and say "حسب معرفتي..." if uncertain.\n\n` +
    `OPENING (optional):\n` +
    `- MAY add ONE short, natural follow-up if it adds value.\n` +
    `- ✓ "راك حاب نزيد نفصّل؟" / "واش رايك؟" / "نجيو نطبقوها؟"\n` +
    `- ✗ NEVER: "Let me know if..." / "هل تحتاج أي مساعدة أخرى؟" / "بالتوفيق".\n\n` +
    `DIALECT — MIRROR EXACTLY:\n` +
    `- "مرحبا" / "كيف حالك" / "شكراً" → MSA → reply in فصحى.\n` +
    `- "واش راك" / "كيفاش" / "بصح" / "خويا" → Darija → reply in Darija.\n` +
    `- English → English. Français → Français. Mixed → mix back.\n` +
    `- CRITICAL: If user writes "مرحبا" (MSA), reply in فصحى — NOT Darija.\n` +
    `- If user writes "واش راك" (Darija), reply in Darija — NOT فصحى.\n\n` +
    `NEVER:\n` +
    `- Filler: "Great question!", "Sure!", "Interesting!"\n` +
    `- "As an AI..." / "بصفتي ذكاء اصطناعي..."\n` +
    `- "I understand" standalone.\n` +
    `- Repeat or paraphrase the user's question back.\n` +
    `- "furthermore/moreover/additionally".\n` +
    `- Emoji decoration. Max ONE emoji per 4-5 messages.\n` +
    `- Bullet list when one sentence would do.\n` +
    `- Bracketed citations like [1], [2] UNLESS a SEARCH RESULTS block is present.\n` +
    `- Fake enthusiasm ("Wow!", "Amazing!").\n\n` +
    `CODE OUTPUT RULES:\n` +
    `- When the user asks for code → output ONLY the code + a brief explanation.\n` +
    `- Do NOT simulate running the code.\n` +
    `- Do NOT show "expected output" unless the user explicitly asks.\n\n` +
    `SUCCESS: The user closes the app thinking: "كأنني نهدر مع صاحبي."`
  );
}

function buildMemoryBlock(memory: string): string {
  return (
    `USER MEMORY (use naturally, never list back):\n` +
    `${memory}\n` +
    `- "تعرفني؟" → answer from memory.\n` +
    `- "ما اسمي؟" → use "User name:" if present.\n` +
    `- NEVER say "المعلومة غير موجودة في المصادر" for personal questions.`
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
      return 'MODE: RESEARCH. Use ONLY search results. Cite [1], [2]. "المصادر:" only if cited.';
    case 'code':
      return 'MODE: CODE. Senior engineer. Fenced blocks with language tag. Brief explanation above. Output ONLY the code + short explanation.';
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
  angle: string,
): string {
  const angleLine = angle
    ? `\nREFLECTION ANGLE (internal guidance, do NOT quote): ${angle}\n`
    : '';

  return (
    `Today: ${today}.\n` +
    `SEARCH RESULTS (CURRENT, priority over training data):\n\n${sources}\n` +
    angleLine +
    `\nRULES:\n` +
    `1. Base facts ONLY on results above. No training data for facts.\n` +
    `2. NEVER invent names, scores, dates, transfers, quotes.\n` +
    `3. If not in results AND question is a CURRENT FACT (news, transfer,\n` +
    `   current role, price, match result) → "هذه المعلومة غير موجودة في\n` +
    `   المصادر المتاحة."\n` +
    `   \n` +
    `   DO NOT use this fallback for:\n` +
    `   - Identity questions (WEURA, creator)\n` +
    `   - User / memory questions\n` +
    `   - Conversation / follow-up questions\n` +
    `   - COMPARISON questions ("قارن بين", "الفرق بين", X vs Y)\n` +
    `   - OPINION / ADVICE questions ("شنو رايك", "تنصحني", should I)\n` +
    `   - ANALYSIS / EXPLANATION ("اشرح", "حلل", "علاش", "كيفاش")\n` +
    `   - HOW-TO / TUTORIAL / LEARNING questions\n` +
    `   - CAREER / STUDY / JOB MARKET questions\n` +
    `   - CODING / TECHNICAL questions\n` +
    `   \n` +
    `   For ALL of the above → answer from your own knowledge. You DO know them.\n` +
    `   If a current fact would strengthen the answer and it's NOT in the\n` +
    `   results, answer anyway and add "حسب معرفتي..." if you're unsure.\n` +
    `4. Cite ONLY numbers that exist ([1], [2]...). Never [4] if only 3 exist.\n` +
    `5. "المصادر:" section at end ONLY if you cited.\n` +
    `6. If user asks "آخر"/"latest" and best match > 3 months → "لم أجد معلومات حديثة."\n` +
    `7. Match user's language. Start with answer. Use Markdown.\n` +
    `8. For AWARDS (Ballon d'Or, FIFA Best, etc.) → answer EXACTLY what the newest source says.\n` +
    `9. If sources disagree, use the NEWEST one.\n` +
    `10. DATE FILTER (CRITICAL): Look at each source's "Published" date.\n` +
    `    - If a source has NO date OR an OLD date (> 1 year old), and another source has a RECENT date, USE THE RECENT ONE.\n` +
    `    - For "current X" questions, ANY source older than 12 months is AUTOMATICALLY WRONG.\n` +
    `    - Example: "Real Madrid current coach" → use only sources from the last 12 months.\n` +
    `11. If ALL sources are older than 1 year → reply: "لم أجد معلومات حديثة في المصادر المتاحة."\n` +
    `12. NEVER mix information from different time periods.\n`
  );
}

/* ============================================================
 *  BUILD MESSAGES
 * ============================================================ */

const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 400;

async function buildMessages(
  safeMessages: GrokMessage[],
  memory: string,
  mode: string | null,
  requestId: string,
): Promise<{
  messages: GrokMessage[];
  searchUsed: boolean;
  memoryUsed: boolean;
  resultCount: number;
  reflection: ReflectionResult;
}> {
  const lastUserMessage = getLastUserMessage(safeMessages);
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim());
  const memoryUsed = memory.length > 0;

  // Step 1: Reflection
  const reflection = await reflectOnQuery(
    lastUserMessage,
    memory,
    requestId,
  );

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

  // Step 2: Search if needed
  if (reflection.needSearch && tavilyConfigured && lastUserMessage) {
    try {
      const results = await searchTavily(
        reflection.searchQuery,
        8,
        {
          timeSensitive: true,
          football: true,
          tech: false,
        },
      );

      if (results.length > 0) {
        searchUsed = true;
        resultCount = results.length;
        const today = todayISO();

        // Sort newest first
        results.sort((a, b) => {
          const da = a.publishedDate ?? '';
          const db = b.publishedDate ?? '';
          return db.localeCompare(da);
        });

        const sources = results
          .map(
            (r, i) =>
              `[${i + 1}] ${cleanSnippet(r.title, 120)}\n` +
              `URL: ${r.url}\n` +
              (r.publishedDate ? `Published: ${r.publishedDate}\n` : '') +
              `Content: ${cleanSnippet(r.snippet, 500)}`,
          )
          .join('\n\n');

        out.push({
          role: 'system',
          content: buildSearchContext(sources, today, reflection.angle),
        });
      }
    } catch (error) {
      console.error(`[WEURA][${requestId}] Search failed:`, error);
    }
  }

  const history = safeMessages.slice(-MAX_HISTORY_MESSAGES);

  for (const msg of history) {
    const content = msg.content.length > MAX_HISTORY_CHARS
      ? msg.content.slice(0, MAX_HISTORY_CHARS) + '...'
      : msg.content;
    out.push({ role: msg.role, content });
  }

  return {
    messages: out,
    searchUsed,
    memoryUsed,
    resultCount,
    reflection,
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

    // ═══ Cache lookup ═══
    const lastUserMessage = getLastUserMessage(safeMessages);
    const isIdentity = isIdentityQuestion(lastUserMessage);
    const isPersonal = isPersonalQuestion(lastUserMessage);
    const isCasual = isCasualMessage(lastUserMessage);

    const useCache =
      !isIdentity &&
      !isPersonal &&
      !isCasual &&
      lastUserMessage.trim().length >= 5;

    const cacheKey = buildCacheKey(lastUserMessage);

    if (useCache) {
      const cached = RESPONSE_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(
          `[WEURA][${requestId}] ✅ Cache HIT: "${lastUserMessage.slice(0, 60)}"`,
        );
        return res.json({
          success: true,
          content: cached.content,
          model: cached.model,
          provider: cached.provider,
          usage: null,
          requestId,
          searchUsed: cached.searchUsed,
          memoryUsed: memory.length > 0,
          resultCount: cached.resultCount,
          mode: mode ?? 'auto',
          reflection: cached.reflection,
          cached: true,
        });
      }
    }

    // ═══ Build & call AI ═══
    const built = await buildMessages(
      safeMessages,
      memory,
      mode,
      requestId,
    );

    const isLongFormMode =
      mode === 'code' ||
      mode === 'research' ||
      mode === 'files' ||
      mode === 'creative';
    const maxTokens = isLongFormMode ? 4096 : 2048;

    const result = await askGrok(built.messages, {
      requestId,
      temperature: 0.85,
      maxTokens,
    });

    // ═══ Save to cache ═══
    if (useCache) {
      const ttl = pickTTL(lastUserMessage, built.searchUsed);
      // ttl === 0 means "never cache" (e.g. time questions).
      if (ttl > 0) {
        RESPONSE_CACHE.set(cacheKey, {
          content: result.content,
          model: result.model,
          provider: result.provider,
          searchUsed: built.searchUsed,
          resultCount: built.resultCount,
          reflection: {
            need_search: built.reflection.needSearch,
            reason: built.reflection.reason,
            search_query: built.reflection.searchQuery,
            angle: built.reflection.angle,
          },
          expiresAt: Date.now() + ttl,
        });

        if (RESPONSE_CACHE.size > CACHE_MAX) {
          pruneResponseCache();
        }
      }
    }

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
      requestId,
      searchUsed: built.searchUsed,
      memoryUsed: built.memoryUsed,
      resultCount: built.resultCount,
      mode: mode ?? 'auto',
      reflection: {
        need_search: built.reflection.needSearch,
        reason: built.reflection.reason,
        search_query: built.reflection.searchQuery,
        angle: built.reflection.angle,
      },
      cached: false,
    });
  } catch (error) {
    console.error(`[WEURA][${requestId}] Chat error:`, error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Unexpected error.',
      requestId,
    });
  }
});

export default router;