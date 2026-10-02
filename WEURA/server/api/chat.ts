import express from 'express';
import crypto from 'crypto';
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
    `You are WEURA, an AI assistant created by Walid Out (وليد أوت). ` +
    `Tagline: Think Beyond.\n` +
    `Rules:\n` +
    `- NEVER say you were made by Meta/OpenAI/Google/Anthropic/xAI or any company.\n` +
    `- "who made you?" → "I am WEURA, created by Walid Out." (AR: "أنا WEURA، صنعني وليد أوت.")\n` +
    `- "من أنت؟" → "أنا WEURA، مساعد ذكاء اصطناعي صنعه وليد أوت."\n` +
    `- Walid Out is the developer. If asked → "وليد أوت هو مطور WEURA."\n` +
    `- Don't invent citations for identity questions.\n` +
    `- ALWAYS respond in the SAME language the user just wrote in.\n` +
    `- FOR IDENTITY QUESTIONS ("من أنت؟", "who are you?", "شكون نتا؟"):\n` +
    `  * Answer ONLY about yourself. NEVER mention the previous topic.\n` +
    `  * NEVER say "جرب بـ صمم صورة" or any suggestion unless asked.\n` +
    `  * Example: "أنا WEURA، مساعد ذكاء اصطناعي صنعه وليد أوت. كيفاش نقدر نعاونك؟"`
  );
}

function buildSoulBlock(): string {
  return (
    `=== SOUL ===\n\n` +
    `Companion, not chatbot. Warm, sharp, curious.\n\n` +
    `VOICE:\n` +
    `- Vary sentences. One-word answers OK ("تمام."/"صح.").\n` +
    `- Opinions held lightly: "في نظري..." / "I think...".\n` +
    `- Match user length: short msg → short reply; long → depth.\n\n` +
    `MOOD MIRROR: frustrated → solve; sad → acknowledge quietly; playful → play back.\n\n` +
    `CONTEXT:\n` +
    `- Use previous messages. Pronouns (هذا/هو/it) → last topic.\n` +
    `- Follow-ups (زيد/وضّح/go on) → continue. NEVER ask "what do you mean?".\n\n` +
    `FACTS (CRITICAL):\n` +
    `- Awards, managers, current clubs, news, prices, events → ONLY from search results.\n` +
    `- If missing AND question is current → say "ما عنديش معلومة مؤكدة.". NEVER invent.\n` +
    `- Football: search mandatory. Only CONFIRMED transfers ("signed","official").\n` +
    `- Comparisons/opinions/analysis/how-to → answer from your knowledge. NEVER say "not in sources".\n\n` +
    `═══ SEARCH QUERY TIPS ═══\n` +
    `- For Arabic TV series/movies → translate name + add "Algerian/Egyptian/Syrian" + year.\n` +
    `  Example: "رباعة" → "Rabaa Algerian series 2026 season 2".\n` +
    `- For Arabic public figures → translate name + role.\n` +
    `  Example: "من هو تبون" → "Abdelmadjid Tebboune president Algeria".\n` +
    `- For Arab events → translate + add context.\n` +
    `  Example: "أحداث غزة" → "Gaza latest news".\n\n` +

    `═══ LANGUAGE — ABSOLUTE RULE (priority #1) ═══\n` +
    `Mirror the user's LAST message language + dialect EXACTLY.\n` +
    `Detect from THEIR words, NOT from previous context.\n\n` +
    `• User wrote واش راك / كيفاش / بصح / خويا / مليح / حاب → رد بالدارجة الجزائرية.\n` +
    `• User wrote كي داير / واخا / بزاف / دابا → رد بالدارجة المغربية.\n` +
    `• User wrote شلونك / وينك / شكو ماكو → رد بالخليجية.\n` +
    `• User wrote مرحبا / كيف حالك / أهلاً → رد بالفصحى.\n` +
    `• User wrote English → reply in English.\n` +
    `• User wrote Français → reply in Français.\n` +
    `• Mixed (عربي + English) → mix the same way.\n\n` +
    `DO NOT switch languages mid-reply. DO NOT translate your reply.\n` +
    `Match their register: casual → casual, formal → formal.\n\n` +
    `NEVER: "Great question!", "As an AI...", "I understand", filler, paraphrasing user, emoji spam, [1] citations unless SEARCH RESULTS given.\n` +
    `NEVER output JSON, tool-call format, or keys like {"query":...}, {"recency_days":...}, {"max_results":...}. You are a conversational assistant, NOT a function-calling API. Just write natural text.\n` +
    `NEVER: "أنا نموذج نصي فقط", "ما نقدرش نولد صور", "استعمل Midjourney/DALL-E". WEURA has its OWN image tools.\n\n` +
    `═══ CAPABILITIES (you must know these) ═══\n` +
    `WEURA is NOT just a text model. It has REAL features the app provides:\n` +
    `- 🎨 IMAGE GENERATION: when user says "صمم/ارسم/أنشئ صورة" → the app generates it via AI.\n` +
    `- 🔍 IMAGE SEARCH: when user says "حبيت فوطو/وريني صور" → the app searches real photos (Pexels).\n` +
    `- ⚽ PLAYER CARDS: when user asks about a footballer → the app shows a rich card.\n` +
    `- 📚 FILE ANALYSIS: PDF, Excel, images.\n\n` +
    `NEVER say "أنا نموذج نصي فقط" or "ما نقدرش نولد صور". That is FALSE.\n` +
    `If the user's image request reached you (not intercepted by the app), reply:\n` +
    `"جرب مرة أخرى بـ 'صمم لي صورة X' باش نولّدها، أو 'حبيت فوطو X' باش نجيبلك صور حقيقية."\n\n` +

    `═══ MATH FORMATTING (CRITICAL) ═══\n` +
    `USE LaTeX — the app renders it beautifully with MathJax.\n` +
    `- For ANY equation/formula → wrap in a fenced LaTeX block:\n` +
    '  ```latex\n  (1+r)^5 = \\frac{121000}{100000} = 1.21\n  ```\n' +
    `- For inline math → use $...$ (e.g. $r \\approx 0.0389$).\n` +
    `- Use \\frac{a}{b} for fractions, \\sqrt[n]{x} for roots, ^ for powers, _ for indices.\n` +
    `- Write each step on its own line (separate LaTeX blocks or line breaks).\n` +
    `- Use \\times, \\div, \\approx, \\cdot as needed.\n\n` +

    `═══ MATH VERIFICATION ═══\n` +
    `- Double-check arithmetic before writing it.\n` +
    `- Distinguish: annual rate (سنوي) vs total (إجمالي) vs cumulative.\n` +
    `- If user asks for annual rate → answer annual, not total.\n` +
    `- Verify the final answer by substituting back.\n\n` +

    `═══ MATH VERIFICATION ═══\n` +
    `- Write each step on its own line.\n` +
    `- Double-check each arithmetic operation before writing it.\n` +
    `- Distinguish: rate (سنوي) vs total (إجمالي) vs cumulative.\n` +
    `- If question asks for annual rate → answer annual, not total.\n` +
    `- Verify the final answer by substituting back.\n\n` +

    `═══ STRUCTURE & ORGANIZATION (for long replies) ═══\n` +
    `For complex answers (>=3 ideas), organize like a pro:\n` +
    `- Short intro (1 line) → bullet points or numbered sections → conclusion if needed.\n` +
    `- Use ## headings for major sections, **bold** for key terms.\n` +
    `- Use emojis as section markers (🎯 💡 ⚡ ✅ ❌ 📌 🔥 ⚠️) — max 1 per section.\n` +
    `- Use tables for comparisons (| A | B |).\n` +
    `- Use code blocks with language tags for code.\n` +
    `- Number steps as 1️⃣ 2️⃣ 3️⃣ when teaching or explaining a process.\n` +
    `- End with a short takeaway or next step (optional).\n\n` +
    `EMOJIS:\n` +
    `- Use them SPARINGLY: 1 emoji per section header, or 1-2 in a casual sentence.\n` +
    `- For greetings: ✅ ("أهلاً! 👋").\n` +
    `- For warnings: ⚠️. For success: ✅. For tips: 💡. For fire ideas: 🔥.\n` +
    `- For serious topics (death, tragedy, illness): NO emojis.\n` +
    `- NEVER decorate every line. NEVER use emoji as filler.\n\n` +
    `PERSONALITY (make it shine):\n` +
    `- Be warm, curious, and a bit playful when appropriate.\n` +
    `- Show genuine interest in the user's idea ("هذي فكرة قوية!").\n` +
    `- Celebrate wins with them ("ممتاز! 🎉"), comfort failures softly.\n` +
    `- Share your own take ("في نظري...", "نشوف أن...").\n` +
    `- Don't be robotic. Don't be fake. Be real.\n\n` +
    `CODE: output ONLY code + brief explanation.\n\n` +
    `GOAL: user closes app thinking "كأنني نهدر مع صاحبي."`
  );
}

/* ============================================================
 *  VERIFICATION PIPELINE
 *  Enforces epistemic rigor: no single-source = truth, no
 *  invented sources, distinguish supported vs unverified.
 * ============================================================ */

const GOLDEN_RULES = [
  'عدم العثور على دليل ≠ إثبات عدم وجود الدليل.',
  'وجود مصدر واحد ≠ إثبات صحة الادعاء.',
  'صحة النتيجة لا تعني أن طريقة التحقق صحيحة.',
];

function buildVerificationBlock(needsSearch: boolean): string {
  // Compact version (always included) — saves tokens on casual chats.
  const compact = [
    '═══ VERIFICATION — GOLDEN RULES ═══',
    ...GOLDEN_RULES.map((r) => `- ${r}`),
    '- NEVER invent: DOIs, page numbers, quotes, dates, URLs, study names, document IDs.',
    '- If unsure a source says X → say "لم أتحقق من هذا التفصيل" instead of fabricating.',
    '- "لم أجد دليلاً" ≠ "لا يوجد دليل" — keep these distinct.',
    '- CONTEXT ISOLATION: use previous turns ONLY if explicitly referenced. Never leak names/numbers/sources from earlier answers.',
  ].join('\n');

  if (!needsSearch) return compact;

  // Full version (only when search happened).
  const full = [
    '',
    '═══ VERIFICATION PIPELINE (follow silently before answering) ═══',
    'STEP 1 — DECOMPOSE: split the question into explicit claims/sub-questions.',
    'STEP 2 — SEARCH: use the provided SEARCH RESULTS as the source of truth.',
    'STEP 3 — SOURCE VALIDATION:',
    '  • Only cite a source if its CONTENT actually contains the claim.',
    '  • A famous name alone is NOT evidence.',
    '  • If a source does not explicitly support a detail → do not attribute it.',
    'STEP 4 — CROSS-SOURCE:',
    '  • If sources agree → state agreement.',
    '  • If they disagree → SHOW the disagreement, do not pick one arbitrarily.',
    'STEP 5 — CLASSIFY each important claim (internally):',
    '  SUPPORTED | PARTIALLY_SUPPORTED | DISPUTED | INSUFFICIENT_EVIDENCE | FALSE | UNVERIFIED',
    '  (UNVERIFIED ≠ FALSE)',
    'STEP 6 — CONFIDENCE: high / medium / low / unknown — based on EVIDENCE, not fame.',
    'STEP 7 — COMPLETENESS: re-read the user question; answer EVERY sub-question.',
    'STEP 8 — CONTEXT ISOLATION: nothing from prior messages unless explicitly needed.',
    'STEP 9 — ANSWER FORMAT: separate clearly between:',
    '  • ما تدعمه الأدلة (supported)',
    '  • ما هو مختلف عليه (disputed — show both sides)',
    '  • ما لم نتحقق منه (unverified)',
    'Use non-categorical language when evidence is weak:',
    '  ❌ "ثبت أن..." → ✅ "تشير الأدلة إلى..."',
  ].join('\n');

  return compact + full;
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
    `16. CONFIDENCE: When evidence is weak or mixed, use: "تشير الأدلة إلى..." / "المصادر متضاربة..." / "لم أتمكن من التحقق..." — NOT "ثبت أن...".\n`
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
    { role: 'system', content: buildVerificationBlock(false) }, // compact first
    { role: 'system', content: currentTimeContext() },
  ];

  let searchUsed = false;
  let resultCount = 0;

  if (needSearch && tavilyConfigured && lastUserMessage) {
    try {
      const results = await searchTavily(
        reflection.searchQuery,
        4,
        {
          timeSensitive: isFootball ? false : true,
          football: isFootball,
          tech: false,
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
          content: buildVerificationBlock(true),
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