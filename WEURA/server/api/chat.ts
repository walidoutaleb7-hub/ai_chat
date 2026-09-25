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
Return ONLY valid JSON:

{
  "need_search": true | false,
  "reason": "short reason (max 80 chars, in English)",
  "search_query": "ENGLISH-only query (empty if need_search=false)",
  "angle": "how to approach the answer (max 100 chars, in user's language)"
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
      trimmedMemory.length > 800
        ? `${trimmedMemory.slice(0, 400)}\n...\n${trimmedMemory.slice(-400)}`
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
    `- Sad → acknowledge quietly. No fixing. No lecture.\n` +
    `- Playful → play back.\n` +
    `- Just chatting → chat back. No agenda.\n\n` +
    `CONTEXT & FOLLOW-UPS:\n` +
    `- You have the previous messages. Use them.\n` +
    `- Pronouns (هذا/ذلك/هو/it/that) → last topic. NEVER ask "what do you mean?".\n` +
    `- Short follow-ups (زيد / وضّح / go on) → continue.\n\n` +
    `FACTS & AWARDS (CRITICAL):\n` +
    `- For ANY question about AWARDS, MANAGERS, current club/player status, news,\n` +
    `  prices, or current events → rely ONLY on the search results when provided.\n` +
    `- NEVER answer these from training data alone.\n` +
    `- If search results are absent AND the question is about a recent fact → reply:\n` +
    `  "ما عنديش معلومة مؤكدة."\n` +
    `- Do NOT invent dates, names, or winners.\n\n` +
    `FOOTBALL (CRITICAL):\n` +
    `- For ANY football question → search results are MANDATORY.\n` +
    `- Sources: RSSSF, FBref, Transfermarkt, 11v11, worldfootball, zerozero,\n` +
    `  kicker, marca, BBC Sport, ESPN, The Athletic, footballdatabase.\n` +
    `- NEVER invent scores, transfers, lineups, stats, dates, or players.\n` +
    `- If the question is about a RUMOR vs CONFIRMED transfer:\n` +
    `  - Only CONFIRMED sources ("signed", "completed", "official") count.\n\n` +
    `COMPARISON, OPINION, ANALYSIS, HOW-TO:\n` +
    `- These are NEVER "current facts". Answer from your own knowledge.\n` +
    `- NEVER reply "هذه المعلومة غير موجودة في المصادر المتاحة" for these.\n` +
    `- You DO know these things. Give a real, structured answer.\n\n` +
    `OPENING (optional):\n` +
    `- MAY add ONE short, natural follow-up if it adds value.\n` +
    `- ✗ NEVER: "Let me know if..." / "بالتوفيق".\n\n` +
    `DIALECT — MIRROR EXACTLY:\n` +
    `- "مرحبا" / "كيف حالك" → MSA → reply in فصحى.\n` +
    `- "واش راك" / "كيفاش" / "بصح" / "خويا" → Darija → reply in Darija.\n` +
    `- English → English. Français → Français. Mixed → mix back.\n\n` +
    `NEVER:\n` +
    `- Filler: "Great question!", "Sure!", "Interesting!"\n` +
    `- "As an AI..." / "بصفتي ذكاء اصطناعي..."\n` +
    `- "I understand" standalone.\n` +
    `- Repeat or paraphrase the user's question back.\n` +
    `- Emoji decoration. Max ONE emoji per 4-5 messages.\n` +
    `- Bracketed citations like [1], [2] UNLESS a SEARCH RESULTS block is present.\n\n` +
    `CODE OUTPUT RULES:\n` +
    `- When the user asks for code → output ONLY the code + a brief explanation.\n\n` +
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
    `9. NEVER mix information from different time periods.\n`
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

  // Football questions: trust reflection.needSearch when it explicitly
  // says "no" (historical facts), otherwise search.
  // Non-football: use reflection.needSearch directly.
  const needSearch = reflection.needSearch;

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

  if (needSearch && tavilyConfigured && lastUserMessage) {
    try {
      const results = await searchTavily(
        reflection.searchQuery,
        8,
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
              `[${i + 1}] ${cleanSnippet(r.title, 120)}\n` +
              `URL: ${r.url}\n` +
              (r.publishedDate ? `Published: ${r.publishedDate}\n` : '') +
              `Content: ${cleanSnippet(r.snippet, 500)}`,
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