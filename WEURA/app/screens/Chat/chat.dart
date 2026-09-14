import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../components/Composer/comppser.dart';
import '../../core/AI/ai_router.dart';
import '../../core/History/chat_history.dart';
import '../../core/Memory/memory_manager.dart';
import '../../services/Grok/grok_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    this.initialMessage,
    this.sessionId,
    this.onBack,
  });

  final String? initialMessage;
  final String? sessionId;
  final VoidCallback? onBack;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatMessage {
  const _ChatMessage({
    required this.text,
    required this.isUser,
    this.isError = false,
  });

  final String text;
  final bool isUser;
  final bool isError;
}

class _ChatScreenState extends State<ChatScreen>
    with TickerProviderStateMixin {
  final ScrollController _scrollController = ScrollController();
  final AIRouter _router = const AIRouter();
  final HistoryManager _history = HistoryManager();
  final MemoryManager _memory = MemoryManager();

  late final GrokService _grok;

  final List<_ChatMessage> _messages = [];

  AIMode _mode = AIMode.auto;
  bool _isLoading = false;
  bool _requestCancelled = false;
  ChatSession? _session;

  static const String _serverUrl =
      'https://ai-chat-tlol.onrender.com';

  @override
  void initState() {
    super.initState();

    _grok = GrokService(baseUrl: _serverUrl);

    _initialize();
  }

  Future<void> _initialize() async {
    await Future.wait([
      _history.load(),
      _memory.load(),
    ]);

    if (widget.sessionId != null) {
      final existing = _history.findById(widget.sessionId!);

      if (existing != null) {
        _session = existing;

        for (final msg in existing.messages) {
          _messages.add(
            _ChatMessage(
              text: msg.text,
              isUser: msg.isUser,
            ),
          );
        }

        if (mounted) setState(() {});
      }
    }

    if (widget.initialMessage != null &&
        widget.initialMessage!.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sendMessage(widget.initialMessage!);
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _grok.dispose();
    super.dispose();
  }

  Future<void> _ensureSession(String firstMessage) async {
    if (_session != null) return;

    final title = firstMessage.length > 40
        ? '${firstMessage.substring(0, 40)}...'
        : firstMessage;

    _session = await _history.create(title: title);
  }

  Future<void> _persistMessages() async {
    final session = _session;
    if (session == null) return;

    session.messages.clear();

    for (final msg in _messages) {
      if (msg.isError) continue;

      session.messages.add(
        ChatMessageData(
          text: msg.text,
          isUser: msg.isUser,
          timestamp: DateTime.now(),
        ),
      );
    }

    await _history.save(session);
  }

  /// Detects explicit "remember this" requests in Arabic and English.
  /// Only stores when the user clearly wants WEURA to remember something.
  Future<void> _maybeStoreMemory(String userMessage) async {
    final text = userMessage.toLowerCase().trim();

    final triggers = [
      'remember that',
      'remember:',
      'remember ',
      'note that',
      'save this',
      'تذكر أن',
      'تذكر ان',
      'تذكر:',
      'احفظ أن',
      'احفظ ان',
      'احفظ:',
      'خلي في بالك',
      'خليك فاكر',
      'سجل أن',
      'سجل ان',
    ];

    String? content;

    for (final trigger in triggers) {
      final index = text.indexOf(trigger);

      if (index != -1) {
        content = userMessage
            .substring(index + trigger.length)
            .trim();

        break;
      }
    }

    if (content == null || content.isEmpty) return;

    try {
      await _memory.add(content);
    } catch (_) {
      // Memory storage failures must never break the chat.
    }
  }

  Future<void> _sendMessage(String text) async {
    if (_isLoading) return;

    final message = text.trim();
    if (message.isEmpty) return;

    final resolvedMode = _router.resolve(
      message: message,
      selectedMode: _mode,
    );

    await _ensureSession(message);
    await _maybeStoreMemory(message);

    setState(() {
      _messages.add(_ChatMessage(text: message, isUser: true));
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      final memoryContext =
          _memory.buildRelevantContext(message);

      final conversation = <GrokMessage>[
        GrokMessage(
          role: 'system',
          content: _router.systemPromptFor(resolvedMode),
        ),
      ];

      if (memoryContext.isNotEmpty) {
        conversation.add(
          GrokMessage(
            role: 'system',
            content:
                'Relevant memory about the user:\n'
                '$memoryContext\n\n'
                'Use this information only when it is directly '
                'relevant to the current request.',
          ),
        );
      }

      conversation.addAll(
        _messages
            .where((m) => !m.isError)
            .map(
              (m) => GrokMessage(
                role: m.isUser ? 'user' : 'assistant',
                content: m.text,
              ),
            ),
      );

      final result = await _grok.sendMessage(messages: conversation);

      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          _ChatMessage(text: result.content, isUser: false),
        );
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _cancelRequest() {
    if (!_isLoading) return;

    setState(() {
      _requestCancelled = true;
      _isLoading = false;
    });
  }

  String _cleanError(Object error) {
    if (error is GrokException) return error.message;

    return 'WEURA could not complete the request. '
        'Please check the connection and try again.';
  }

  void _retryLastMessage() {
    if (_isLoading || _messages.isEmpty) return;

    final userMessages =
        _messages.where((m) => m.isUser).toList();

    if (userMessages.isEmpty) return;

    final lastUserMessage = userMessages.last;

    _messages.removeWhere((m) => !m.isUser && m.isError);

    setState(() {});

    _sendMessage(lastUserMessage.text);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _showMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(milliseconds: 1600),
        ),
      );
  }

  void _showAttachmentSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0D0D14),
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Add to WEURA',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 14),
                _attachmentOption(
                  asset: 'assets/icons/home.svg',
                  title: 'Photos',
                  subtitle: 'Choose an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Image tools will be connected in the Vision step.',
                    );
                  },
                ),
                _attachmentOption(
                  asset: 'assets/icons/camera.svg',
                  title: 'Camera',
                  subtitle: 'Capture an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Camera tools will be connected in the Vision step.',
                    );
                  },
                ),
                _attachmentOption(
                  asset: 'assets/icons/file.svg',
                  title: 'Files',
                  subtitle: 'PDF, DOCX, XLSX, TXT, CSV',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'File tools will be connected in the Files step.',
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _attachmentOption({
    required String asset,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: SizedBox(
        width: 40,
        height: 40,
        child: SvgPicture.asset(asset),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: Colors.white38, fontSize: 12),
      ),
      trailing: SvgPicture.asset(
        'assets/icons/send.svg',
        width: 18,
        height: 18,
      ),
    );
  }

  void _showModePicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0D0D14),
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'AI Mode',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                ...AIMode.values.map((mode) {
                  final selected = _mode == mode;

                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    tileColor: selected
                        ? const Color(0xFF315DFF)
                            .withValues(alpha: 0.10)
                        : null,
                    leading: SvgPicture.asset(
                      'assets/icons/mode.svg',
                      width: 23,
                      height: 23,
                    ),
                    title: Text(
                      _modeName(mode),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    trailing: selected
                        ? SvgPicture.asset(
                            'assets/icons/check.svg',
                            width: 21,
                            height: 21,
                          )
                        : null,
                    onTap: () {
                      setState(() {
                        _mode = mode;
                      });
                      Navigator.pop(sheetContext);
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  String _modeName(AIMode mode) {
    switch (mode) {
      case AIMode.auto:
        return 'Auto';
      case AIMode.smart:
        return 'Smart';
      case AIMode.fast:
        return 'Fast';
      case AIMode.research:
        return 'Research';
      case AIMode.code:
        return 'Code';
      case AIMode.creative:
        return 'Creative';
      case AIMode.vision:
        return 'Vision';
    }
  }

  void _handleVoice() {
    _showMessage(
      'Voice input will be connected in the Voice step.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07070C),
      appBar: AppBar(
        backgroundColor: const Color(0xFF07070C),
        elevation: 0,
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () {
            if (widget.onBack != null) {
              widget.onBack!();
            } else if (Navigator.canPop(context)) {
              Navigator.pop(context);
            }
          },
          icon: SvgPicture.asset(
            'assets/icons/back.svg',
            width: 23,
            height: 23,
          ),
        ),
        title: const Text(
          'WEURA',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'AI Mode',
            onPressed: _showModePicker,
            icon: SvgPicture.asset(
              'assets/icons/mode.svg',
              width: 23,
              height: 23,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _emptyState()
                : ListView.builder(
                    controller: _scrollController,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(
                      16,
                      20,
                      16,
                      20,
                    ),
                    itemCount:
                        _messages.length + (_isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (_isLoading &&
                          index == _messages.length) {
                        return const _WeuraThinking();
                      }

                      return _messageBubble(_messages[index]);
                    },
                  ),
          ),
          WeuraComposer(
            enabled: true,
            isLoading: _isLoading,
            onSend: _sendMessage,
            onAttach: _showAttachmentSheet,
            onMode: _showModePicker,
            onVoice: _handleVoice,
            onStop: _cancelRequest,
          ),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: const Color(0xFF1D4ED8)
                    .withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: const Color(0xFF3B82F6)
                      .withValues(alpha: 0.18),
                ),
              ),
              child: SvgPicture.asset(
                'assets/icons/mode.svg',
                width: 31,
                height: 31,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Think Beyond.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 30,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Ask WEURA anything.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _messageBubble(_ChatMessage message) {
    final alignment = message.isUser
        ? Alignment.centerRight
        : Alignment.centerLeft;

    final background = message.isUser
        ? const Color(0xFF1D4ED8)
        : const Color(0xFF15151D);

    return Align(
      alignment: alignment,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 650),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 13,
        ),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(18),
          border: message.isUser
              ? null
              : Border.all(
                  color: message.isError
                      ? Colors.redAccent.withValues(alpha: 0.25)
                      : Colors.white.withValues(alpha: 0.06),
                ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(
              message.text,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15.5,
                height: 1.5,
              ),
            ),
            if (message.isError) ...[
              const SizedBox(height: 10),
              GestureDetector(
                onTap: _retryLastMessage,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SvgPicture.asset(
                      'assets/icons/history.svg',
                      width: 18,
                      height: 18,
                    ),
                    const SizedBox(width: 7),
                    const Text(
                      'Retry',
                      style: TextStyle(
                        color: Color(0xFF7DD3FC),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeuraThinking extends StatefulWidget {
  const _WeuraThinking();

  @override
  State<_WeuraThinking> createState() => _WeuraThinkingState();
}

class _WeuraThinkingState extends State<_WeuraThinking>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        width: 66,
        height: 44,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF111119),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: const Color(0xFF3B82F6).withValues(alpha: 0.10),
          ),
        ),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                3,
                (index) {
                  final value = (_controller.value * 3 - index)
                      .clamp(0.0, 1.0);

                  final scale = 0.65 + (value * 0.45);

                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 3,
                    ),
                    child: Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF3B82F6),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
