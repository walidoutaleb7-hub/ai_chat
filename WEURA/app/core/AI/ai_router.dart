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

    if (hasImage) {
      return AIMode.vision;
    }

    if (hasFile) {
      return AIMode.smart;
    }

    final text = message.toLowerCase();

    if (_containsAny(text, [
      'code',
      'coding',
      'program',
      'programming',
      'debug',
      'bug',
      'flutter',
      'dart',
      'python',
      'javascript',
      'typescript',
      'html',
      'css',
      'api',
      'github',
    ])) {
      return AIMode.code;
    }

    if (_containsAny(text, [
      'latest',
      'today',
      'news',
      'current',
      'recent',
      'search',
      'latest information',
      'آخر',
      'اليوم',
      'حاليا',
      'الأخبار',
      'ابحث',
      'بحث',
    ])) {
      return AIMode.research;
    }

    if (_containsAny(text, [
      'write',
      'story',
      'poem',
      'creative',
      'idea',
      'design',
      'اكتب',
      'قصة',
      'شعر',
      'فكرة',
      'تصميم',
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
      if (text.contains(value)) {
        return true;
      }
    }

    return false;
  }

  String systemPromptFor(AIMode mode) {
    const identity = '''
You are WEURA AI — Think Beyond.
Created by Walid Out.
You are NOT ChatGPT, NOT OpenAI, NOT Claude, NOT Gemini, NOT Grok.
If anyone asks who you are, always answer: "I am WEURA AI, created by Walid Out."
Never claim to be any other AI model or company.
''';

    switch (mode) {
      case AIMode.fast:
        return '''
$identity
Answer quickly and directly.
Be accurate and useful.
Avoid unnecessary explanations.
''';

      case AIMode.smart:
        return '''
$identity
Provide intelligent, accurate, structured answers.
Understand the user's intent before answering.
Use clear explanations and practical solutions.
''';

      case AIMode.research:
        return '''
$identity
You are in Research Mode.
Prioritize factual accuracy and current information.
When search tools are available, use them instead of inventing
sources or pretending that you searched.
Clearly distinguish verified information from uncertainty.
''';

      case AIMode.code:
        return '''
$identity
You are in Code Mode.
Act as a senior software engineer.
Write production-quality code.
Explain important decisions briefly.
Check for bugs, edge cases, security issues and maintainability.
Never invent APIs, libraries or capabilities.
''';

      case AIMode.creative:
        return '''
$identity
You are in Creative Mode.
Generate original, high-quality ideas and writing.
Respect the user's requested style, language and tone.
Avoid unnecessary generic filler.
''';

      case AIMode.vision:
        return '''
$identity
You are in Vision Mode.
Analyze provided visual information carefully.
Describe only what can reasonably be inferred.
Do not invent details that cannot be seen.
''';

      case AIMode.auto:
        return '''
$identity
Automatically choose the best reasoning approach for each request.
Be accurate, useful, concise when possible, and detailed when needed.
''';
    }
  }
}
