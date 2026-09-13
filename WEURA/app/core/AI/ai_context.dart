import '../Memory/memory_manager.dart';
import 'ai_router.dart';

class AIContext {
  const AIContext({
    required this.userMessage,
    required this.mode,
    this.conversation = const [],
    this.memoryContext = '',
    this.toolResults = const [],
  });

  final String userMessage;
  final AIMode mode;
  final List<Map<String, String>> conversation;
  final String memoryContext;
  final List<String> toolResults;

  List<Map<String, String>> buildMessages({
    String? systemPrompt,
  }) {
    final messages = <Map<String, String>>[];

    if (systemPrompt != null && systemPrompt.trim().isNotEmpty) {
      messages.add({
        'role': 'system',
        'content': systemPrompt.trim(),
      });
    }

    if (memoryContext.trim().isNotEmpty) {
      messages.add({
        'role': 'system',
        'content': '''
Relevant memory:
$memoryContext

Use this information only when it is relevant to the user's request.
''',
      });
    }

    if (toolResults.isNotEmpty) {
      messages.add({
        'role': 'system',
        'content': '''
Tool results:
${toolResults.join('\n\n')}
''',
      });
    }

    for (final message in conversation) {
      final role = message['role'];
      final content = message['content'];

      if ((role == 'user' || role == 'assistant') &&
          content != null &&
          content.trim().isNotEmpty) {
        messages.add({
          'role': role!,
          'content': content,
        });
      }
    }

    messages.add({
      'role': 'user',
      'content': userMessage,
    });

    return messages;
  }

  AIContext copyWith({
    String? userMessage,
    AIMode? mode,
    List<Map<String, String>>? conversation,
    String? memoryContext,
    List<String>? toolResults,
  }) {
    return AIContext(
      userMessage: userMessage ?? this.userMessage,
      mode: mode ?? this.mode,
      conversation: conversation ?? this.conversation,
      memoryContext: memoryContext ?? this.memoryContext,
      toolResults: toolResults ?? this.toolResults,
    );
  }

  static AIContext fromMemory({
    required String message,
    required AIMode mode,
    required MemoryManager memory,
    List<Map<String, String>> conversation = const [],
    List<String> toolResults = const [],
  }) {
    return AIContext(
      userMessage: message,
      mode: mode,
      conversation: conversation,
      memoryContext: memory.buildRelevantContext(message),
      toolResults: toolResults,
    );
  }
}