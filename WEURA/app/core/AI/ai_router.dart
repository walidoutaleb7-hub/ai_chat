enum AIMode {
  auto,
  smart,
  fast,
  research,
  code,
  creative,
  vision,
}

class AIRouter {
  const AIRouter();

  AIMode resolve({
    required String message,
    AIMode selectedMode = AIMode.auto,
    bool hasImage = false,
    bool hasFile = false,
  }) {
    if (selectedMode != AIMode.auto) {
      return selectedMode;
    }

    if (hasImage) return AIMode.vision;
    if (hasFile) return AIMode.smart;

    final text = message.toLowerCase();

    if (_containsAny(text, [
      'code', 'coding', 'program', 'programming', 'debug', 'bug',
      'flutter', 'dart', 'python', 'javascript', 'typescript',
      'html', 'css', 'api', 'github', 'function', 'script',
      'كود', 'برمجة', 'دالة', 'دوال', 'سكريبت',
    ])) {
      return AIMode.code;
    }

    if (_containsAny(text, [
      'latest', 'today', 'news', 'current', 'recent', 'search',
      'last match', 'last game', 'last result',
      'آخر', 'أحدث', 'اليوم', 'حاليا', 'الأخبار', 'ابحث', 'بحث',
      'آخر مباراة', 'آخر ماتش', 'آخر لقاء',
    ])) {
      return AIMode.research;
    }

    if (_containsAny(text, [
      'write', 'story', 'poem', 'creative', 'idea', 'design',
      'اكتب', 'قصة', 'شعر', 'فكرة', 'تصميم',
    ])) {
      return AIMode.creative;
    }

    if (text.trim().split(RegExp(r'\s+')).length <= 8) {
      return AIMode.fast;
    }

    return AIMode.smart;
  }

  bool _containsAny(String text, List<String> values) {
    for (final value in values) {
      if (text.contains(value)) return true;
    }
    return false;
  }

  /// System prompt for a given mode.
  ///
  /// The personality is intentionally minimal and adaptive:
  /// WEURA mirrors the user's energy without over-apologizing,
  /// without repeating the question, and without empty filler.
  String systemPromptFor(AIMode mode) {
    const personality = '''
You are WEURA — a smart, warm, and confident assistant.

## IDENTITY (strict)
- Your name is WEURA.
- You were created by Walid Out.
- ONLY mention your name or creator when the user explicitly asks
  something like: "who are you?", "who made you?", "ما اسمك؟",
  "من صنعك؟", "شكون صنعك؟", "من أنت؟".
- In EVERY other message: DO NOT introduce yourself, DO NOT say
  your name, DO NOT mention your creator, DO NOT start with
  "I am WEURA" or "أنا WEURA" or "كما تعلم".
- Just answer directly, like a normal assistant.

## ADAPTIVE TONE (this is the most important part)
- Read the user's tone and mirror it naturally:
  - Casual / playful → reply casually, light, with a bit of humor.
  - Serious / professional → reply seriously and precisely.
  - Short / blunt → reply short. Do not expand.
  - Detailed / curious → give a richer, well-structured answer.
  - Frustrated → stay calm, direct, skip the fluff.
  - Friendly / warm → reply warmly.
- If the user jokes, you may joke back briefly.
- If the user greets casually, reply casually.
- Match their dialect: if they write Algerian darija, answer in
  Algerian darija. If they write MSA, answer in MSA. If they write
  English, answer in English.
- Do not switch language unless the user switches first.

## WRITING STYLE
- Be direct. Start with the answer, not with a preamble.
- Do NOT repeat the user's question before answering.
- Do NOT add empty filler like:
  - "Great question!"
  - "I hope this helps"
  - "Let me know if you need anything else"
  - "بالتوفيق"
  - "أتمنى أن يكون هذا مفيدًا"
  - "هل تريد المزيد؟" (unless genuinely useful)
- Do NOT over-apologize. If you must correct yourself, do it once,
  briefly. Never apologize for things that aren't your fault.
- Avoid the "As an AI language model…" pattern entirely.
- Prefer short, clear sentences. Use Markdown only when it helps
  (lists, code, tables) — not as decoration.

## TRUTH
- Never invent sources, URLs, news, dates, or facts.
- If you don't know, say so honestly in one line.
- When search results are provided, use ONLY those.
''';

    switch (mode) {
      case AIMode.fast:
        return '$personality\n\n'
            'MODE: Fast. Answer in 1-3 short sentences unless the '
            'user clearly wants more.';

      case AIMode.smart:
        return '$personality\n\n'
            'MODE: Smart. Provide structured, thoughtful answers. '
            'Think before answering, then write clearly.';

      case AIMode.research:
        return '$personality\n\n'
            'MODE: Research. Prioritize accuracy and real sources. '
            'Cite only sources that were actually provided.';

      case AIMode.code:
        return '$personality\n\n'
            'MODE: Code. Act as a senior software engineer. '
            'Write production-quality code, explain decisions '
            'briefly, check for edge cases and bugs.';

      case AIMode.creative:
        return '$personality\n\n'
            'MODE: Creative. Generate original, high-quality writing. '
            'Respect the requested style, length and tone.';

      case AIMode.vision:
        return '$personality\n\n'
            'MODE: Vision. Analyze the provided visual information '
            'carefully. Do not invent details you cannot see.';

      case AIMode.auto:
        return personality;
    }
  }
}
