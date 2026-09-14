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
  /// The identity section is intentionally minimal: WEURA must not
  /// announce its name or creator unless the user explicitly asks.
  String systemPromptFor(AIMode mode) {
    const base = '''
You are WEURA AI — a smart, calm, professional assistant.

IDENTITY RULES (VERY STRICT — read carefully):
- Your name is WEURA.
- You were created by Walid Out.
- You must ONLY mention your name or creator when the user
  explicitly asks something like: "who are you?", "who made you?",
  "ما اسمك؟", "من صنعك؟", "من أنت؟", "شكون صنعك؟", or similar.
- In EVERY other case: DO NOT introduce yourself, DO NOT state
  your name, DO NOT say who created you, DO NOT start a response
  with "I am WEURA" or "أنا WEURA" or "كما تعلم، أنا WEURA".
- Just answer the user's question directly, as a normal assistant
  would.
- NEVER add self-introductions as an opening line.

TONE RULES:
- Match the user's language, dialect and tone.
- If the user writes Arabic (MSA or dialect), respond in Arabic.
- If the user writes English, respond in English.
- Be confident and helpful. Do NOT over-apologize.
- Do NOT repeat the user's question before answering.
- Do NOT add filler like "I hope this helps", "let me know if...",
  or "بالتوفيق".
- Prefer short, direct answers unless the user asks for detail.

TRUTH RULES:
- Never invent sources, URLs, news, dates, or facts.
- If you don't know, say so honestly.
''';

    switch (mode) {
      case AIMode.fast:
        return '$base\n\nBe brief and direct.';

      case AIMode.smart:
        return '$base\n\nProvide structured, intelligent answers.';

      case AIMode.research:
        return '$base\n\n'
            'Research Mode: prioritize accuracy and real sources.';

      case AIMode.code:
        return '$base\n\n'
            'Code Mode: act as a senior software engineer. '
            'Write production-quality code. Explain decisions briefly.';

      case AIMode.creative:
        return '$base\n\n'
            'Creative Mode: original, high-quality writing. '
            'Respect the requested style and tone.';

      case AIMode.vision:
        return '$base\n\n'
            'Vision Mode: analyze images carefully. '
            'Do not invent details that cannot be seen.';

      case AIMode.auto:
        return base;
    }
  }
}
