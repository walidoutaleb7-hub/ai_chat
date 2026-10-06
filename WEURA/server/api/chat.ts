import express from 'express';
import crypto from 'crypto';
import { askGrok, GrokMessage } from '../grok/grok';
import { searchTavily, detectClaimType, ClaimType } from './search';
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
  football: boolean;
  reflection: {
    need_search: boolean;
    reason: string;
    search_query: string;
    angle: string;
  };
  expiresAt: number;
};

const RESPONSE_CACHE = new Map<string, CacheEntry>();

const CACHE_TTL_NEWS_MS = 15 * 60 * 1000;
const CACHE_TTL_FACT_MS = 6 * 60 * 60 * 1000;
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

/**
 * Cache key includes: message + mode + memory hash.
 * Prevents cross-user cache leaks (memory differs → different key).
 * SHA-256 hash avoids collisions from truncated memory prefixes.
 */
function buildCacheKey(
  userMessage: string,
  mode: string | null,
  memory: string,
): string {
  const msgPart = userMessage.trim().toLowerCase().slice(0, 150);
  const modePart = (mode ?? 'auto').toLowerCase();
  const memoryPart = memory.trim().length > 0
    ? crypto.createHash('sha256').update(memory).digest('hex').slice(0, 16)
    : 'nomem';
  return `${modePart}:${memoryPart}:${msgPart}`;
}

function pickTTL(userMessage: string, searchUsed: boolean): number {
  const lower = userMessage.toLowerCase();

  // Time-specific questions → NEVER cache.
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
 *  FOOTBALL DETECTION
 * ============================================================ */

const FOOTBALL_KEYWORDS = [
  'كرة القدم', 'كرة قدم', 'مباراة', 'ماتش', 'لاعب', 'فريق',
  'هدف', 'أهداف', 'دوري', 'كأس', 'ملعب', 'بطولة', 'انتقال',
  'مدرب', 'تشكيلة', 'نتيجة', 'ترتيب', 'تصفيات', 'منتخب',
  'الدوري', 'الكأس', 'الهداف', 'صانع ألعاب', 'حراس',
  'وسط الميدان', 'دفاع', 'هجوم', 'تحكيم', 'حكم', 'ركلة',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'تشيلسي',
  'أرسنال', 'بايرن', 'يوفنتوس', 'ميلان', 'إنتر', 'سان جيرمان',
  'ميسي', 'رونالدو', 'مبابي', 'هالاند', 'بنزيمة', 'صلاح',
  'نيمار', 'حكيمي', 'محرز', 'زياش', 'بونو', 'أوناحي',
  'فينيسيوس', 'بيلينغهام', 'رودري', 'رافينيا', 'موسيالا',
  // ── الدوريات والبطولات ──
  'الدوري الإسباني', 'الدوري الإنجليزي', 'الدوري الإيطالي',
  'الدوري الألماني', 'الدوري الفرنسي', 'دوري أبطال أوروبا',
  'كأس العالم', 'يورو', 'كوبا أمريكا', 'أفريقيا',
  'الدوري السعودي', 'دوري روشن', 'الدوري المصري', 'الدوري الجزائري',
  'الدوري المغربي', 'الدوري التونسي', 'دوري أبطال أفريقيا',
  'كأس أمم أفريقيا', 'كان', 'الأمم الأفريقية', 'كأس آسيا',
  'كأس أوروبا', 'دوري الأمم', 'دوري المؤتمر', 'الدوري الأوروبي',
  'كأس السوبر', 'السوبر الإسباني', 'السوبر الإيطالي',
  'كأس الملك', 'كأس إسبانيا', 'كأس فرنسا', 'كأس إنجلترا',
  'البريميرليغ', 'الليغا', 'الكالتشيو', 'البوندسليغا',
  'الليغ 1', 'الدوري الهولندي', 'الدوري البرتغالي',
  'الدوري التركي', 'الدوري البلجيكي', 'الدوري الروسي',
  'دوري أبطال آسيا', 'الدوري الأمريكي', 'الليغا المكسيكية',
  'الدوري البرازيلي', 'الدوري الأرجنتيني', 'كوبا ليبرتادوريس',
  'كوبا سود أمريكانا', 'كأس القارات', 'مونديال الأندية',
  'كأس العالم للأندية', 'كأس العرب', 'دورة الألعاب',

  // ── الجوائز ──
  'الكرة الذهبية', 'بالون دور', 'جائزة الأفضل',
  'أفضل لاعب', 'الفيفا', 'فيفا', 'جوائز الفيفا',
  'الكرة الذهبية لأفضل لاعب', 'أفضل مدرب',
  'أفضل حارس', 'أفضل هدف', 'بوشكاش', 'ياشين',
  'الحذاء الذهبي', 'القفاز الذهبي', 'الكرة البرونزية',
  'الكرة الفضية', 'أفضل لاعب شاب', 'غولden boy',
  'أفضل لاعب في العالم', 'أفضل لاعب في أفريقيا',
  'أفضل لاعب عربي', 'أفضل لاعب آسيوي',

  // ── كلمات أساسية ──
  'كرة القدم', 'كرة قدم', 'مباراة', 'ماتش', 'لاعب',
  'فريق', 'هدف', 'أهداف', 'دوري', 'كأس', 'ملعب',
  'بطولة', 'انتقال', 'مدرب', 'تشكيلة', 'نتيجة',
  'ترتيب', 'تصفيات', 'منتخب', 'الدوري', 'الكأس',
  'الهداف', 'صانع ألعاب', 'حراس', 'وسط الميدان',
  'دفاع', 'هجوم', 'تحكيم', 'حكم', 'ركلة',
  'ضربة جزاء', 'بنلتي', 'تسلل', 'أوفسايد',
  'كرة حرة', 'ركلة ركنية', 'كورنر', 'بطاقة صفراء',
  'بطاقة حمراء', 'طرد', 'إنذار', 'هدف ذهبي',
  'هدف فضي', 'وقت إضافي', 'ركلات ترجيح', 'بينالتيات',
  'شوط', 'شوط أول', 'شوط ثاني', 'الوقت بدل الضائع',
  'تصدي', 'تسديدة', 'تمريرة', 'هجمة', 'مرتدة',
  'استحواذ', 'إحصائية', 'إحصائيات', 'تقييم',
  'ميركاتو', 'انتقالات', 'انتقال حر', 'إعارة',
  'بيع', 'شراء', 'عقد', 'تجديد عقد', 'راتب',
  'قيمة سوقية', 'وكيل أعمال', 'شرط جزائي',
  'تشكيلة أساسية', 'احتياط', 'دكة بدلاء', 'إصابة',
  'عودة', 'غياب', 'إيقاف', 'ترقب', 'تصويت',
  'هداف', 'هدافين', 'صناعة أهداف', 'أسيست',
  'كلين شيت', 'شباك نظيفة', 'هاتريك', 'دوبل',
  'خماسية', 'سوبر هاتريك', 'ريمونتادا', 'ديربي',
  'كلاسيكو', 'ديربي مدريد', 'ديربي ميلانو',
  'ديربي لندن', 'ديربي مانشستر', 'ديربي إيطاليا',

  // ── الأندية الأوروبية ──
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر',
  'تشيلسي', 'أرسنال', 'بايرن', 'يوفنتوس',
  'ميلان', 'إنتر', 'سان جيرمان', 'باريس سان جيرمان',
  'مانشستر يونايتد', 'مانشستر سيتي', 'توتنهام',
  'نيوكاسل', 'أستون فيلا', 'إيفرتون', 'وست هام',
  'أتلتيكو مدريد', 'إشبيلية', 'فالنسيا', 'فياريال',
  'ريال سوسيداد', 'أتلتيك بلباو', 'بيتيس',
  'نابولي', 'روما', 'لاتسيو', 'أتالانتا', 'فيورنتينا',
  'بوروسيا دورتموند', 'لايبزيغ', 'باير ليفركوزن',
  'أياكس', 'آيندهوفن', 'فينورد', 'بورتو', 'بنفيكا',
  'سبورتينغ لشبونة', 'سيلتيك', 'رينجرز', 'غلطة سراي',
  'فنربخشة', 'بشكتاش', 'زينيت', 'سبارتاك',

  // ── الأندية العربية ──
  'الهلال', 'النصر', 'الاتحاد', 'الأهلي السعودي',
  'الشباب', 'الاتفاق', 'الفتح', 'الطائي',
  'الزمالك', 'الأهلي المصري', 'بيراميدز', 'الإسماعيلي',
  'الترجي', 'النجم الساحلي', 'الصفاقسي', 'الافريقي',
  'الوداد', 'الرجاء', 'الجيش', 'المغرب التطواني',
  'شباب بلوزداد', 'مولودية الجزائر', 'اتحاد الجزائر',
  'وفاق سطيف', 'شبيبة القبائل', 'مولودية وهران',

  // ── اللاعبون ──
  'ميسي', 'رونالدو', 'مبابي', 'هالاند', 'بنزيمة',
  'صلاح', 'نيمار', 'حكيمي', 'محرز', 'زياش',
  'بونو', 'أوناحي', 'فينيسيوس', 'بيلينغهام',
  'رودري', 'رافينيا', 'موسيالا', 'يامال', 'لامين',
  'كيليان', 'كريستيانو', 'ليونيل', 'إبراهيموفيتش',
  'مودريتش', 'كروس', 'بوسكيتس', 'إنييستا',
  'شافي', 'راؤول', 'كاسياس', 'بويول', 'بيكيه',
  'ديفيد بيكهام', 'ديل بييرو', 'توتي', 'مالديني',
  'بوفون', 'كاسياس', 'نوير', 'كورتوا', 'إيدرسون',
  'دي بروين', 'ساكا', 'فودن', 'راشفورد',
  'كاين', 'سون', 'لوکاکو', 'أوباميانغ',
  'ماني', 'أوباميانغ', 'أوبي ميكل', 'دروغبا',
  'إيتو', 'أبوبكر', 'ياسين بونو', 'رونالدينيو',
  'كاكا', 'ريفالدو', 'رونالدو البرازيلي', 'روماريو',
  'زيدان', 'هنري', 'ديفيد تريزيغيه', 'بيريز',
  'مارادونا', 'بيليه', 'كرويف', 'بيكنباور',

  // ── المدربون ──
  'مورينيو', 'غوارديولا', 'كلوب', 'أنشيلوتي',
  'زيدان', 'سيميوني', 'كونتي', 'مورينيو',
  'أليغري', 'بيولي', 'سباليتي', 'مورينيو',
  'توخيل', 'ناغلسمان', 'فليك', 'رافينيا',
  'لويس إنريكي', 'تشافي', 'فالفيردي', 'إيمري',
  'أرتيتا', 'تين هاغ', 'بوستيكوغلو', 'سولسكاير',
  'دومينيك', 'ديكو', 'ديشان', 'ساوثغيت',
  'سكالوني', 'تيته', 'كاسكادا', 'ريغراغي',
  'ريغيكامب', 'بيتكو', 'رونار', 'خليلوزيتش',
  'بلماضي', 'قريش', 'وحيد خليلوزيتش',

  // ── إنجليزي ──
  'football', 'soccer', 'match', 'player', 'team',
  'goal', 'league', 'cup', 'stadium', 'championship',
  'transfer', 'coach', 'manager', 'lineup', 'result',
  'standings', 'qualifier', 'national team', 'striker',
  'goalkeeper', 'defender', 'midfielder', 'referee',
  'penalty', 'offside', 'premier league', 'la liga',
  'serie a', 'bundesliga', 'ligue 1', 'champions league',
  'world cup', 'euro', 'copa america', 'afcon',
  'ballon d\'or', 'fifa the best', 'uefa', 'caf',
  'real madrid', 'barcelona', 'liverpool', 'manchester',
  'chelsea', 'arsenal', 'bayern', 'juventus', 'milan',
  'inter', 'psg', 'messi', 'ronaldo', 'mbappe',
  'haaland', 'benzema', 'salah', 'neymar', 'hakimi',
  'mahrez', 'ziyech', 'bono', 'vinicius', 'bellingham',
  'rodri', 'raphinha', 'musiala', 'yamal', 'kane',
  'de bruyne', 'modric', 'kroos', 'guardiola',
  'mourinho', 'ancelotti', 'klopp', 'simeone', 'conte',
  'al hilal', 'al nassr', 'al ittihad', 'al ahli',
  'zamalek', 'esperance', 'wydad', 'raja',

  // ── دارجة جزائرية/مغاربية ──
  'كورة', 'الفيون', 'فيون', 'طاجين', 'كوردة',
  'كورة القدم', 'ماتش', 'الجوج', 'الماتش',
  'الكلاصيكو', 'الديربي', 'الهداف', 'البوطولة',
  'الكأس', 'البطولة', 'المنتخب', 'الخضر',
  'محاربو الصحراء', 'أسود الأطلس', 'نسور قرطاج',
  'الفراعنة', 'الأخضر السعودي', 'العنابي',

  // ── مختصرات ──
  'fifa', 'uefa', 'caf', 'afc', 'concacaf',
  'var', 'fpl', 'ucl', 'uel', 'epl', 'mls',
  'liga', 'serie', 'bundes', 'ligue',
  'تقنية الفار', 'الفار', 'var',

  // ── كؤوس ومسابقات خاصة ──
  'كأس الرابطة', 'كأس الاتحاد', 'الدرع',
  'الدرع الخيرية', 'كأس الأبطال',
  'كأس العالم للسيدات', 'الدوري النسائي',
  'كرة القدم النسائية', 'المنتخب النسائي',

  // ── انتقالات وشائعات ──
  'رسمي', 'رسمياً', 'شائعة', 'شائعات',
  'مفاوضات', 'اتفاق', 'صفقة', 'صفقات',
  'انتقال مؤكد', 'قريب من', 'مهتم بـ',
  'يرغب في', 'هدف رئيسي', 'صفقة القرن',
  'أغلى انتقال', 'أغلى لاعب', 'رقم قياسي',
  'فابريزيو رومانو', 'هير إيز وي غو',
  'here we go',

  // ── إحصائيات ──
  'احصائيات', 'إحصائيات', 'ترتيب الهدافين',
  'صدارة', 'هبوط', 'تأهل', 'تصدر',
  'نقاط', 'فارق نقاط', 'الجولة', 'الدورة',
  'مباريات اليوم', 'نتائج اليوم', 'أهداف اليوم',
  'ملخص المباراة', 'أهداف المباراة', 'أفضل هدف',
  'أسوأ هدف', 'أغرب هدف', 'أسرع هدف',
  'أسرع هاتريك', 'أسرع بطاقة', 'أسرع تبديل',
  'football', 'soccer', 'match', 'player', 'team', 'goal',
  'league', 'cup', 'stadium', 'championship', 'transfer',
  'coach', 'manager', 'lineup', 'result', 'standings',
  'qualifier', 'national team', 'striker', 'goalkeeper',
  'defender', 'midfielder', 'referee', 'penalty', 'offside',
  'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1',
  'champions league', 'world cup', 'euro', 'copa america',
  'real madrid', 'barcelona', 'liverpool', 'manchester',
  'chelsea', 'arsenal', 'bayern', 'juventus', 'milan', 'inter',
  'psg', 'messi', 'ronaldo', 'mbappe', 'haaland', 'benzema',
  'salah', 'neymar', 'hakimi', 'mahrez', 'ziyech', 'bono',
];

function isFootballQuestion(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (text.length < 3) return false;

  for (const kw of FOOTBALL_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return true;
  }
  return false;
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
- **ANY football / soccer question**
- Prices, stocks, market data
- Weather
- Anything with a year (2020-2030) + event
- Questions about specific people's CURRENT roles/positions
- "Who won / who is the current / when did X happen recently"

NO SEARCH (need_search = false):
- Greetings, thanks, casual chat, follow-ups
- Personal questions about the user (use memory)
- Identity questions about WEURA
- Math, science, programming concepts, definitions
- Writing, coding, translations, creativity
- Stable historical facts (before 2020) — EXCEPT football
- Comparison questions (X vs Y, "قارن بين", "الفرق بين")
- Opinion / advice questions ("شنو رايك", "شنو تنصحني")
- Analysis / explanation questions ("اشرح", "حلل", "علاش")
- How-to / tutorial questions ("كيفاش نكتب", "علمني")
- Career / study / skill advice
- Language / translation help
- Coding questions

FOOTBALL — SEARCH RULES:
- CURRENT facts (current club, latest transfer, current manager, recent match,
  current standings, recent awards) → need_search = true
- HISTORICAL facts (World Cup winners before 2018, old finals, retired players'
  stats, classic matches before 2020) → need_search = false, use training data
- If unsure whether the fact is current → need_search = true
- Rumors vs confirmed transfers → always search (status changes fast)

Examples:
- "من فاز بكأس العالم 1998؟" → need_search = false (stable fact)
- "من فاز بكأس العالم 2022؟" → need_search = true (needs accuracy)
- "من مدرب ريال مدريد؟" → need_search = true (current role)
- "من فاز بالكرة الذهبية 2010؟" → need_search = false (stable)
- "من فاز بالكرة الذهبية 2024؟" → need_search = true (recent)

═══ OUTPUT ═══
DECOMPOSE: If the user's message contains multiple sub-questions
(e.g., "أعطني X و Y و Z", "قارن بين X و Y", numbered points),
identify them ALL — the final answer MUST address every one.

Return ONLY valid JSON:

{
  "need_search": true | false,
  "reason": "short reason (max 80 chars, in English)",
  "search_query": "ENGLISH-only query (empty if need_search=false)",
  "angle": "how to approach the answer (max 100 chars, in user's language)",
  "sub_questions": ["list", "of", "sub-questions", "if multiple"]
}

CRITICAL RULES FOR search_query:
- ALWAYS write search_query in ENGLISH, even if user wrote in Arabic/Darija/French.
- Web search engines (Tavily) return much better results in English.
- Use natural English phrasing, NOT word-for-word translation.
- Examples:
  * "من فاز بالكرة الذهبية 2024؟" → "Ballon d'Or 2024 winner"
  * "من مدرب ريال مدريد؟" → "Real Madrid current manager 2026"
  * "من فاز بكأس العالم 2022؟" → "FIFA World Cup 2022 winner"
  * "أسعار الذهب اليوم" → "gold price today"
  * "أفضل هاتف 2026" → "best smartphone 2026"
  * "آخر أخبار غزة" → "Gaza latest news"
- Do NOT include question marks, greetings, or politeness.
- Keep it short: 3-10 words ideal.`;

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

  let memorySnippet = '';
  const trimmedMemory = memory.trim();
  if (trimmedMemory.length > 0) {
    const snippet =
      trimmedMemory.length > 500
        ? `${trimmedMemory.slice(0, 250)}\n...\n${trimmedMemory.slice(-250)}`
        : trimmedMemory;
    memorySnippet = `\nUser memory (short):\n${snippet}`;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();

  const userPrompt =
    `Today's date: ${currentDate} (year ${currentYear}).\n` +
    `IMPORTANT: When generating search_query, ALWAYS use the CURRENT year (${currentYear}), NEVER an older year from your training data.\n\n` +
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
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(12000),
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
      searchQuery: searchQuery || userMessage,
      reason,
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

  if (isFootballQuestion(text)) return true;

  const skip = [
    /^(hi|hey|hello|yo|سلام|مرحبا|صباح الخير|مساء الخير|salut|bonjour)[\s!.,?،؟]*$/i,
    /^(thanks|thank you|شكرا|مشكور)[\s!.,?،؟]*$/i,
    /^(ok|okay|yes|no|نعم|لا|حسنا|طيب|ماشي)[\s!.,?،؟]*$/i,
    /^(bye|goodbye|بسلامة|الى اللقاء)[\s!.,?،؟]*$/i,
  ];
  if (skip.some((p) => p.test(text))) return false;

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
 *  CLASSIFICATION
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
  if (text.length === 0) return false;

  const markers = [
    'تعرفني', 'تتذكرني', 'تفتكرني',
    'شكون انا', 'شكون أنا', 'من انا', 'من أنا',
    'واش تعرفني', 'واش تتذكرني',
    'تعرفني ولا لا', 'تتذكرني ولا لا',
    'do you know me', 'do you remember me',
    'who am i', 'who am i to you', 'remember me',
  ];

  for (const m of markers) {
    if (text.includes(m.toLowerCase())) return true;
  }
  return false;
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
    `You are WEURA, an AI assistant created by Walid Outaleb.\n` +
    `Tagline: Think Beyond.\n` +
    `Rules:\n` +
    `- NEVER say you were made by Meta/OpenAI/Google/Anthropic/xAI or any company.\n` +
    `- "who made you?" / "who created you?" → "I was created by Walid Outaleb."\n` +
    `- "من صنعك؟" / "شكون صنعك؟" / "من طورك؟" → "صنعني وليد أوطالب."\n` +
    `- "من أنت؟" / "who are you?" → "أنا WEURA، مساعد ذكاء اصطناعي صنعه وليد أوطالب." / "I am WEURA, an AI assistant created by Walid Outaleb."\n` +
    `- Walid Outaleb is the sole developer. If asked → "وليد أوطالب هو مطور WEURA." / "Walid Outaleb is the developer of WEURA."\n` +
    `- Don't invent citations for identity questions.\n` +
    `- ALWAYS respond in the SAME language the user just wrote in.\n` +
    `- For identity questions ("من أنت؟", "who are you?"): answer ONLY about yourself.\n` +
    `  NEVER mention previous topic. NEVER suggest other features unless asked.`
  );
}

function buildSoulBlock(): string {
  return (
    `⚠️ MATH RULE (HIGHEST PRIORITY): NEVER USE LATEX. ⚠️\n` +
    `DO NOT write \\frac, \\sqrt, \\times, \\text{}, \\boxed, \$\$...\$\$, or \`\`\`latex.\n` +
    `Write math AS PLAIN TEXT: 50,000 × 1.30 = 65,000\n` +
    `Use Unicode only: × ÷ = ≈ √ ^ ² ³ %\n\n` +

    `=== SOUL ===\n\n` +
    `You are WEURA — a warm, sharp, deeply competent companion.\n` +
    `Not a chatbot, a presence. Not a search engine, a thinker.\n\n` +

    `═══ CORE IDENTITY ═══\n` +
    `- Expert across: science, math, tech, medicine, law, history, humanities, business, languages, everyday life.\n` +
    `- Opinionated when it fits, humble when uncertain, precise always.\n` +
    `- Speak like a smart friend: warm but not fake, concise but not cold.\n` +
    `- Vary sentence rhythm. Short. Then longer. Then short again.\n` +
    `- One-word answers are sometimes perfect ("تمام." / "صح.").\n` +
    `- Have taste — in language, timing, restraint.\n\n` +

    `═══ REASONING (adaptive depth) ═══\n` +
    `- Simple question → direct answer, 1-3 lines.\n` +
    `- Conceptual question → explain with 1 example.\n` +
    `- Complex question → structured answer (steps, sections, or table).\n` +
    `- Ambiguous question → ask ONE clarifying question OR state your interpretation then answer.\n` +
    `- Multi-part question → answer EVERY part, in order. Number if >3 parts.\n` +
    `- NEVER overexplain a simple ask. NEVER underexplain a hard one.\n\n` +

    `═══ DOMAIN EXPERTISE ═══\n` +
    `- 📐 Math: verify step by step. Distinguish formula vs numeric. Substitute back to check.\n` +
    `- 💻 Code: idiomatic, tested, safe. Language tag. No fake APIs. Explain the why, briefly.\n` +
    `- 🔬 Science: distinguish hypothesis / theory / law. Experimental ≠ observational. Correlation ≠ causation.\n` +
    `- 💊 Medical: general info only, recommend professional consultation for anything specific.\n` +
    `- ⚖️ Legal: general principles, not jurisdiction-specific advice unless certain. Cite article numbers only if verified.\n` +
    `- 📜 History: distinguish primary sources from later interpretations. Names, dates, places — verify.\n` +
    `- 🕌 Religion: quote Qur'an/hadith accurately. When unsure of wording, say so. Avoid fatwa — point to scholars.\n` +
    `- 💰 Finance: distinguish revenue / profit / tax / cost. Compound interest, discount, VAT — carefully.\n` +
    `- 🗣️ Languages: preserve register, tone, intent. Don't translate idioms word-for-word.\n` +
    `- 🎨 Creative: original, no clichés. Match style of the request.\n\n` +

    `═══ FACTS & SOURCES ═══\n` +
    `- Awards, managers, current clubs, prices, breaking news → rely ONLY on search results.\n` +
    `- NEVER answer current facts from training data alone.\n` +
    `- If search absent AND question is current → say "ما عنديش معلومة مؤكدة."\n` +
    `- NEVER invent dates, names, winners, DOIs, URLs, page numbers.\n` +
    `- For football → search results mandatory. Only CONFIRMED transfers count.\n` +
    `- For comparisons/opinions/analysis/how-to → answer from your own knowledge. NEVER say "not in sources".\n\n` +

    `═══ TONE & STYLE ═══\n` +
    `- Match user's language AND dialect EXACTLY.\n` +
    `  * واش راك / كيفاش / بصح / خويا → Darija (Algerian)\n` +
    `  * كي داير / واخا / بزاف / دابا → Moroccan Darija\n` +
    `  * شلونك / وينك / شكو ماكو → Gulf\n` +
    `  * مرحبا / كيف حالك / أهلاً → فصحى\n` +
    `  * English → English. Français → Français. Mixed → mix back.\n` +
    `- Match register: casual → casual. Formal → formal.\n` +
    `- Match length: short msg → short reply. Long msg → depth.\n` +
    `- Frustrated user → skip fluff, solve.\n` +
    `- Sad user → acknowledge quietly. No fixing. No lecture.\n` +
    `- Playful user → play back.\n\n` +

    `═══ STRUCTURE (for long/complex answers) ═══\n` +
    `- Short intro (1 line) → sections or numbered steps → brief takeaway.\n` +
    `- Use ## for major sections, **bold** for key terms.\n` +
    `- Use emojis as section markers (🎯 💡 ⚡ ✅ ❌ 📌 🔥 ⚠️) — max 1 per section.\n` +
    `- Tables for comparisons (| A | B |).\n` +
    `- Code blocks with language tag.\n` +
    `- Number steps 1️⃣ 2️⃣ 3️⃣ when teaching.\n\n` +

    `═══ EMOJIS ═══\n` +
    `- SPARINGLY: 1 per section header, or 1-2 in casual sentence.\n` +
    `- ✅ greetings · ⚠️ warnings · 💡 tips · 🔥 strong ideas · ✅ success\n` +
    `- Serious topics (death, tragedy, illness) → NO emojis.\n` +
    `- NEVER decorate every line. NEVER use emoji as filler.\n\n` +

    `═══ NEVER DO ═══\n` +
    `- Filler: "Great question!", "Sure!", "Interesting!", "As an AI..."\n` +
    `- Repeat or paraphrase the user's question back.\n` +
    `- Emoji spam. Fake enthusiasm. "I understand" standalone.\n` +
    `- Output JSON, tool-call format, {"query":...}. You're conversational, not an API.\n` +
    `- Say "أنا نموذج نصي فقط" or "استعمل Midjourney/DALL-E". WEURA has its own tools.\n` +
    `- [1], [2] citations unless a SEARCH RESULTS block is present.\n\n` +

    `═══ CODE OUTPUT ═══\n` +
    `- User asks for code → output ONLY code + brief explanation.\n` +
    `- Do NOT simulate running. Do NOT show "expected output" unless asked.\n\n` +

    `═══ CREATIVE WRITING OUTPUT (IMPORTANT) ═══\n` +
    `When the user asks for a TEXT to be written — article, story, poem,\n` +
    `essay, letter, speech, script, song lyrics — wrap it in a fenced\n` +
    `code block with language = "writing":\n` +
    '  ```writing\n  # Title Here\n  Body text goes here...\n  ```\n' +
    `- First line = title (start with "# "). Use "Écriture" if no title fits.\n` +
    `- Body = the actual text, preserve line breaks, Arabic or French or English.\n` +
    `- The app will render it as an elegant card with copy + share buttons.\n` +
    `- DO NOT use this for regular answers, explanations, or code.\n` +
    `- Trigger words: اكتبلي، صمملي، أريد، نص، مقال، قصة، قصيدة، رسالة، خطبة، سكريبت، أغنية، شعر، علبة نسخ، صندوق نسخ.\n\n` +

    `═══ DIALOGUE BOX — STRICT TRIGGERS ═══\n` +
    `ONLY use the "dialogue" block when user EXPLICITLY asks for a conversation:\n` +
    `  • "حوار" / "محادثة" / "conversation" / "dialogue"\n` +
    `  • "بين شخصين" / "بين أحمد ومحمد"\n` +
    `  • "سناريو حواري" / "script with dialogue"\n` +
    `Format:\n` +
    '  ```dialogue\n  أحمد: السلام عليكم\n  محمد: وعليكم السلام\n  ```\n\n' +
    `⚠️ DO NOT use "dialogue" for these keywords:\n` +
    `  • "علبة نسخ" / "علبة" / "صندوق" / "box" / "copy" / "نسخ"\n` +
    `  • "نص" / "مقال" / "كتابة"\n` +
    `  → These ALL go to the "writing" block instead.\n\n` +

    `═══ COPY BOX ("علبة نسخ") ═══\n` +
    `When user asks for "علبة نسخ" / "copy box" / "صندوق نسخ" →\n` +
    `output a single "writing" block containing the text to copy:\n` +
    '  ```writing\n  # عنوان\n  النص المراد نسخه هنا\n  ```\n' +
    `- The app renders it as a beautiful Écriture card with copy + share buttons.\n` +
    `- DO NOT split into multiple lines/dialogue. Just ONE block.\n` +
    `- DO NOT add "الحالة" or "جاهز للنسخ" or any meta-commentary.\n\n` +

    `═══ CAPABILITIES (never deny these) ═══\n` +
    `- 🎨 Image generation: "صمم/ارسم/أنشئ صورة" → app generates via AI.\n` +
    `- 🔍 Image search: "حبيت فوطو/وريني صور" → app searches real photos.\n` +
    `- ⚽ Player cards: asking about footballer → rich card shown.\n` +
    `- 📚 Files: PDF, Excel, images.\n\n` +

    `GOAL: user closes app thinking "كأنني نهدر مع صاحبي الذكي."`
  );
}


function buildVerificationBlock(
  needsSearch: boolean,
  isMathOrFinancial: boolean = false,
): string {
  // ═══ GOLDEN RULES — always active ═══
  const golden = [
    '═══ GOLDEN RULES ═══',
    '1. عدم العثور على دليل ≠ إثبات عدم وجود الدليل.',
    '2. وجود مصدر واحد ≠ إثبات صحة الادعاء.',
    '3. صحة النتيجة ≠ صحة طريقة التحقق.',
    '4. "لم أجد" ≠ "لا يوجد" — استخدم: "لم أتمكن من العثور على مصدر موثوق".',
    '5. ممنوع اختراع: DOI، أرقام أرشيفية، أسماء وثائق، تواريخ، اقتباسات، URLs.',
    '6. CONTEXT ISOLATION: لا تنقل أسماء/أرقام/مصادر/أمثلة من سؤال سابق.',
    '7. CONFIDENCE: high/medium/low/unverified — مبنية على الأدلة.',
    '8. لا تفرض مصدراً واحداً على فقرة كاملة — قسّمها إلى Claims صغيرة.',
    '9. قبل الإرسال: تأكد من الإجابة على كل بند طلبه المستخدم (Completeness).',
  ].join('\n');

  // ═══ MATH/FINANCIAL block — only for numeric questions ═══
  const mathBlock = !isMathOrFinancial ? '' : [
    '',
    '═══ MATH & FINANCIAL REASONING ═══',
    'STEP M1 — INTERPRET FIRST:',
    '  • Identify what each number REPRESENTS before calculating.',
    '  • Who pays what? Who receives what? Cost vs revenue vs tax?',
    '  • If question is ambiguous → state your interpretation.',
    'STEP M2 — DISTINGUISH:',
    '  • Revenue (إيراد) ≠ Profit (ربح) ≠ Tax (ضريبة)',
    '  • Tax collected FOR gov ≠ profit FOR merchant.',
    '  • Transport cost paid by merchant ≠ price paid by customer.',
    '  • Selling price before tax ≠ final price after tax.',
    'STEP M3 — CORRELATION ≠ CAUSATION (scientific claims):',
    '  • Observational ≠ Experimental. Association ≠ Causation.',
    'STEP M4 — VERIFY:',
    '  a) Arithmetic correct?',
    '  b) Interpretation of givens correct?',
    '  c) Assumptions valid?',
    '  d) Answer addresses ACTUAL question?',
    'STEP M5 — SUBSTITUTE BACK to verify final answer.',
  ].join('\n');

  if (!needsSearch && !isMathOrFinancial) return golden;
  if (!needsSearch && isMathOrFinancial) return golden + mathBlock;

  // ═══ FULL VERIFICATION PIPELINE (search happened) ═══
  const full = [
    '',
    '═══ VERIFICATION PIPELINE (12 steps, follow silently) ═══',
    'STEP 1 — DECOMPOSE: split question into explicit Claims/sub-questions.',
    'STEP 2 — SOURCE HIERARCHY:',
    '  Tier 1 (PRIMARY): papers, DOI, gov records, raw data, official statements.',
    '  Tier 2: universities, top journals (Nature, Science, Lancet, NEJM).',
    '  Tier 3: quality press (Reuters, AP, BBC, AFP, Al Jazeera).',
    '  Tier 4: general (Wikipedia) — ONLY if no Tier 1-3 exists.',
    '  Rule: "Harvard أثبتت" ≠ evidence. Find the actual study.',
    'STEP 3 — SOURCE VALIDATION: verify source EXISTS + CONTENT matches.',
    'STEP 4 — CLAIM → EVIDENCE MATCHING: cite [N] ONLY if source N supports.',
    'STEP 5 — CROSS-SOURCE: if sources DISAGREE → SHOW disagreement.',
    'STEP 6 — EVIDENCE CLASSIFICATION:',
    '  SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED | DISPUTED | INSUFFICIENT_EVIDENCE | UNVERIFIED.',
    'STEP 7 — CONFIDENCE: high / medium / low / unknown.',
    'STEP 8 — TEMPORAL: for current facts → use NEWEST source.',
    'STEP 9 — SCIENTIFIC: never correlation → causation.',
    'STEP 10 — HISTORICAL: archaeology ≠ sagas ≠ interpretation.',
    'STEP 11 — COMPLETENESS: answer EVERY sub-question.',
    'STEP 12 — CONTEXT ISOLATION: no leakage from prior turns.',
    '',
    '═══ FINAL VERIFICATION ═══',
    '□ Answered every requested item?',
    '□ Every citation supports its claim?',
    '□ Reached primary sources when needed?',
    '□ Cross-checked independent sources?',
    '□ Detected contradictions?',
    '□ Distinguished facts from inferences?',
    '□ Used non-categorical language when weak?',
    '',
    '═══ FORMAT ═══',
    '• ما تدعمه الأدلة',
    '• ما هو مختلف عليه (show both sides)',
    '• ما لم نتحقق منه',
    '❌ "ثبت أن..." → ✅ "تشير الأدلة إلى..."',
  ].join('\n');

  return golden + mathBlock + full;
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
  isFootball: boolean,
): string {
  const angleLine = angle
    ? `\nREFLECTION ANGLE (internal guidance, do NOT quote): ${angle}\n`
    : '';

  const footballRules = isFootball
    ? `\n⚽ FOOTBALL MODE — SPECIAL RULES:\n` +
      `A. Sources: RSSSF, FBref, 11v11, Transfermarkt, worldfootball, zerozero,\n` +
      `   kicker, marca, BBC Sport, ESPN, The Athletic, footballdatabase.\n` +
      `B. RSSSF/11v11/worldfootball/footballdatabase → HISTORICAL (1932+).\n` +
      `C. Transfermarkt/kicker/marca/BBC/ESPN/The Athletic → MODERN.\n` +
      `D. Only count CONFIRMED sources ("signed", "official", "completed").\n` +
      `E. For scores/results: give EXACT numbers (e.g. "3-1").\n` +
      `F. For awards: use the NEWEST source.\n` +
      `G. If sources disagree → use the NEWEST one.\n` +
      `H. If ALL sources > 12 months AND question is "current" →\n` +
      `   say "لم أجد معلومات حديثة."\n`
    : '';

  return (
    `Today: ${today}.\n` +
    `SEARCH RESULTS (CURRENT, priority over training data):\n\n${sources}\n` +
    angleLine +
    footballRules +
    `\nGENERAL RULES:\n` +
    `1. Base facts ONLY on results above.\n` +
    `2. NEVER invent names, scores, dates, transfers, quotes.\n` +
    `3. If not in results AND question is a CURRENT FACT →\n` +
    `   "هذه المعلومة غير موجودة في المصادر المتاحة."\n` +
    `   DO NOT use this for: identity/user/conversation/comparison/\n` +
    `   opinion/analysis/how-to/career/coding questions.\n` +
    `4. Cite ONLY numbers that exist ([1], [2]...).\n` +
    `5. "المصادر:" section at end ONLY if you cited.\n` +
    `6. Match user's language. Start with answer. Use Markdown.\n` +
    `7. If sources disagree → use the NEWEST one.\n` +
    `8. DATE FILTER: for "current X" → sources older than 12 months are WRONG.\n` +
    `9. NEVER mix information from different time periods.\n` +
    `10. Write a NATURAL answer in prose/markdown. NEVER output raw JSON, tool calls, or keys like {"query":...}, {"recency_days":...}, {"max_results":...}. If you do, the response will be discarded.\n` +
    `11. CROSS-SOURCE: If sources give DIFFERENT numbers/dates/names → SHOW the disagreement ("مصدر X يقول... ومصدر Y يقول..."). NEVER pick one arbitrarily.\n` +
    `12. CITATION VALIDATION: Only cite [N] if source N's content actually contains the claim. Do NOT invent page numbers, DOIs, quotes, or details not in the snippet.\n` +
    `13. "لم أجد في المصادر" ≠ "لا يوجد". Keep these strictly distinct.\n` +
    `14. COMPLETENESS: Re-read the user question. Answer EVERY sub-question. If 5 points requested → 5 answered.\n` +
    `15. CONTEXT ISOLATION: Do NOT carry names/numbers/sources/examples from previous conversation turns unless the user explicitly refers to them.\n` +
    `16. CONFIDENCE: When evidence is weak or mixed, use: "تشير الأدلة إلى..." / "المصادر متضاربة..." / "لم أتمكن من التحقق..." — NOT "ثبت أن...".\n` +
    `17. MATH FORMATTING: NEVER use LaTeX. No \\frac, \\sqrt, \\text{}, \$\$...\$\$, \`\`\`latex. Write as plain text: 50,000 × 1.30 = 65,000. Use Unicode: × ÷ = ≈ √ ^ ² ³ %. One step per line.\n`
  );
}

/* ============================================================
 *  TEMPERATURE — adaptive per mode
 * ============================================================ */

function pickTemperature(mode: string | null): number {
  switch (mode) {
    case 'code':
    case 'research':
    case 'files':
      return 0.25;
    case 'vision':
    case 'translation':
      return 0.4;
    case 'smart':
      return 0.6;
    case 'fast':
      return 0.7;
    case 'creative':
      return 0.9;
    case 'auto':
    default:
      return 0.65;
  }
}

/* ============================================================
 *  MATH/FINANCIAL DETECTION
 *  Used to enable the math+logic verification block.
 * ============================================================ */

function isMathOrFinancial(msg: string): boolean {
  const t = msg.toLowerCase();
  return /(احسب|احسبلي|كم يساوي|ناتج|معادلة|معدل|نسبة|سعر|ربح|خسارة|ضريبة|tva|فائدة|تكلفة|إيراد|percent|calculate|compute|interest|profit|tax|revenue|discount|percentile)/i.test(t);
}

/* ============================================================
 *  BUILD MESSAGES
 * ============================================================ */

const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 300;

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
  football: boolean;
  reflection: ReflectionResult;
  usedSources: string[];
  rawSearchText: string;
}> {
  const lastUserMessage = getLastUserMessage(safeMessages);
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim());
  const memoryUsed = memory.length > 0;

  const isFootball = isFootballQuestion(lastUserMessage);

  const reflection = await reflectOnQuery(
    lastUserMessage,
    memory,
    requestId,
  );

  // Search decision logic:
  // 1. If reflection says yes → search.
  // 2. If reflection said no BUT provided a DIFFERENT search query
  //    (not just echoing the user's message) → search.
  //    This catches cases where the model set need_search=false by mistake
  //    but still filled a proper search_query (i.e. it knows data is needed).
  // 3. Otherwise → no search (greetings, math, historical facts).
  const trimmedQuery = reflection.searchQuery.trim();
  const originalMsg = lastUserMessage.trim();
  // Strip zero-width and non-printable characters before comparison.
  const cleanQuery = trimmedQuery
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .trim();
  const queryDiffers =
    cleanQuery !== originalMsg && cleanQuery.length > 5;
  const needSearch = reflection.needSearch || queryDiffers;

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
    {
      role: 'system',
      content: buildVerificationBlock(
        false,
        isMathOrFinancial(lastUserMessage),
      ),
    },
    { role: 'system', content: currentTimeContext() },
  ];

  let searchUsed = false;
  let resultCount = 0;
  const usedSources: string[] = [];
  let rawSearchText = '';

  if (needSearch && tavilyConfigured && lastUserMessage) {
    try {
      // Detect claim type to route to the right source tier.
      const claimType: ClaimType = detectClaimType(lastUserMessage);
      console.log(
        `[WEURA][${requestId}] Claim type: ${claimType}`,
      );

      const results = await searchTavily(
        reflection.searchQuery,
        4,
        {
          timeSensitive: isFootball ? false : true,
          football: isFootball,
          tech: false,
          claimType,
        },
      );

      if (results.length > 0) {
        searchUsed = true;
        resultCount = results.length;
        const today = todayISO();

        results.sort((a, b) => {
          const da = a.publishedDate ?? '';
          const db = b.publishedDate ?? '';
          return db.localeCompare(da);
        });

        const sources = results
          .map(
            (r, i) =>
              `[${i + 1}] ${cleanSnippet(r.title, 80)}\n` +
              `URL: ${r.url}\n` +
              (r.publishedDate ? `Published: ${r.publishedDate}\n` : '') +
              `Content: ${cleanSnippet(r.snippet, 300)}`,
          )
          .join('\n\n');

        out.push({
          role: 'system',
          content: buildSearchContext(
            sources,
            today,
            reflection.angle,
            isFootball,
          ),
        });
        // Full verification pipeline only when we actually have sources.
        out.push({
          role: 'system',
          content: buildVerificationBlock(
            true,
            isMathOrFinancial(lastUserMessage),
          ),
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
    usedSources,
    rawSearchText,
    football: isFootball,
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

    const lastUserMessage = getLastUserMessage(safeMessages);
    const isFootball = isFootballQuestion(lastUserMessage);

    const isIdentity = isIdentityQuestion(lastUserMessage);
    const isPersonal = isPersonalQuestion(lastUserMessage);
    const isCasual = isCasualMessage(lastUserMessage);

    const useCache =
      !isIdentity &&
      !isPersonal &&
      !isCasual &&
      lastUserMessage.trim().length >= 5;

    const cacheKey = buildCacheKey(lastUserMessage, mode, memory);

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
          football: cached.football || isFootball,
          mode: mode ?? 'auto',
          reflection: cached.reflection,
          cached: true,
        });
      }
    }

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
      temperature: pickTemperature(mode),
      maxTokens,
    });

    // ─── Citation Sanitizer: remove invented DOIs / fake URLs ───
    // Detects common hallucination patterns and replaces them with
    // a neutral phrase, unless the URL/DOI appears in search results.
    const citedUrls = new Set(
      Array.from(built.usedSources ?? []).map((u) => u.toLowerCase()),
    );

    // Pattern 1: DOI: 10.xxxx/yyyy
    const doiPattern = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g;
    // Pattern 2: https?://... (but only validate against known sources)
    const urlPattern = /https?:\/\/[^\s)\]]+/g;

    const foundDois = result.content.match(doiPattern) ?? [];
    const foundUrls = result.content.match(urlPattern) ?? [];

    // Check if DOI exists in search context (raw content)
    const searchBlob = (built.rawSearchText ?? '').toLowerCase();
    const fakeDois = foundDois.filter(
      (d) => !searchBlob.includes(d.toLowerCase()),
    );
    const fakeUrls = foundUrls.filter(
      (u) => !searchBlob.includes(u.toLowerCase()) && !citedUrls.has(u.toLowerCase()),
    );

    if (fakeDois.length > 0 || fakeUrls.length > 0) {
      console.warn(
        `[WEURA][${requestId}] Sanitizer: ${fakeDois.length} fake DOIs, ${fakeUrls.length} fake URLs`,
      );
      for (const d of fakeDois) {
        result.content = result.content.replace(d, '[مرجع غير متحقق]');
      }
      for (const u of fakeUrls) {
        result.content = result.content.replace(u, '[رابط غير متحقق]');
      }
    }

    // ─── Safety: strip raw JSON/tool-call leaks ───
    // Some models (especially free-tier OpenRouter) sometimes leak
    // {"query":"...","recency_days":N,"max_results":N} as text.
    const jsonLeakPattern =
      /\{\s*"query"\s*:[^}]*"recency_days"\s*:[^}]*\}/g;
    if (jsonLeakPattern.test(result.content)) {
      console.warn(
        `[WEURA][${requestId}] Stripped JSON leak from response`,
      );
      result.content = result.content.replace(jsonLeakPattern, '').trim();
      if (!result.content) {
        result.content = 'عذراً، حدث خطأ. جرّب مرة أخرى.';
      }
    }

    if (useCache) {
      const ttl = pickTTL(lastUserMessage, built.searchUsed);
      if (ttl > 0) {
        RESPONSE_CACHE.set(cacheKey, {
          content: result.content,
          model: result.model,
          provider: result.provider,
          searchUsed: built.searchUsed,
          resultCount: built.resultCount,
          football: built.football,
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
      football: built.football,
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
      error: 'حدث خطأ مؤقت. الرجاء المحاولة مرة أخرى.',
      requestId,
    });
  }
});

export default router;