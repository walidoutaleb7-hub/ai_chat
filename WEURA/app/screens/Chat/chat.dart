import 'package:flutter/material.dart';

import '../../core/AI/ai_router.dart';
import '../../services/Grok/grok_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    this.initialMessage,
  });

  final String? initialMessage;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatMessage {
  const _ChatMessage({
    required this.text,
    required this.isUser,
  });

  final String text;
  final bool isUser;
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final AIRouter _router = const AIRouter();

  late final GrokService _grok;

  final List<_ChatMessage> _messages = [];

  AIMode _mode = AIMode.auto;
  bool _isLoading = false;

  static const String _serverUrl = 'http://10.0.2.2:8080';

  @override
  void initState() {
    super.initState();

    _grok = GrokService(
      baseUrl: _serverUrl,
    );

    if (widget.initialMessage != null &&
        widget.initialMessage!.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sendMessage(widget.initialMessage!);
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage([String? value]) async {
    final text = (value ?? _controller.text).trim();

    if (text.isEmpty || _isLoading) return;

    _controller.clear();

    final resolvedMode = _router.resolve(
      message: text,
      selectedMode: _mode,
    );

    setState(() {
      _messages.add(
        _ChatMessage(
          text: text,
          isUser: true,
        ),
      );

      _isLoading = true;
    });

    _scrollToBottom();

    try {
      final conversation = <GrokMessage>[
        GrokMessage(
          role: 'system',
          content: _router.systemPromptFor(resolvedMode),
        ),
        ..._messages.map(
          (message) => GrokMessage(
            role: message.isUser ? 'user' : 'assistant',
            content: message.text,
          ),
        ),
      ];

      final result = await _grok.sendMessage(
        messages: conversation,
      );

      if (!mounted) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: result.content,
            isUser: false,
          ),
        );
      });

      _scrollToBottom();
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
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

  String _cleanError(Object error) {
    final message = error.toString();

    if (message.startsWith('Exception: ')) {
      return message.substring(11);
    }

    return 'WEURA encountered an unexpected error. Please try again.';
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  void _showModePicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF101018),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: AIMode.values.map((mode) {
                return ListTile(
                  leading: Icon(
                    _modeIcon(mode),
                    color: Colors.white,
                  ),
                  title: Text(
                    _modeName(mode),
                    style: const TextStyle(
                      color: Colors.white,
                    ),
                  ),
                  trailing: _mode == mode
                      ? const Icon(
                          Icons.check,
                          color: Colors.blueAccent,
                        )
                      : null,
                  onTap: () {
                    setState(() {
                      _mode = mode;
                    });

                    Navigator.pop(context);
                  },
                );
              }).toList(),
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

  IconData _modeIcon(AIMode mode) {
    switch (mode) {
      case AIMode.auto:
        return Icons.auto_awesome;
      case AIMode.smart:
        return Icons.psychology;
      case AIMode.fast:
        return Icons.bolt;
      case AIMode.research:
        return Icons.search;
      case AIMode.code:
        return Icons.code;
      case AIMode.creative:
        return Icons.lightbulb_outline;
      case AIMode.vision:
        return Icons.visibility_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07070C),
      appBar: AppBar(
        backgroundColor: const Color(0xFF07070C),
        elevation: 0,
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
            icon: Icon(_modeIcon(_mode)),
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
                        return _typingIndicator();
                      }

                      return _messageBubble(
                        _messages[index],
                      );
                    },
                  ),
          ),
          _composer(),
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
            const Text(
              'Think Beyond.',
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
        constraints: const BoxConstraints(
          maxWidth: 650,
        ),
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
                  color: Colors.white.withValues(alpha: 0.06),
                ),
        ),
        child: SelectableText(
          message.text,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15.5,
            height: 1.5,
          ),
        ),
      ),
    );
  }

  Widget _typingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 14,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFF15151D),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const SizedBox(
          width: 42,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Dot(),
              _Dot(),
              _Dot(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 8,
            vertical: 7,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF111119),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(
                tooltip: 'Mode',
                onPressed: _showModePicker,
                icon: const Icon(
                  Icons.tune,
                  color: Colors.white70,
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _controller,
                  minLines: 1,
                  maxLines: 6,
                  style: const TextStyle(
                    color: Colors.white,
                  ),
                  cursorColor: Colors.blueAccent,
                  decoration: const InputDecoration(
                    hintText: 'Message WEURA...',
                    hintStyle: TextStyle(
                      color: Colors.white38,
                    ),
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              IconButton(
                tooltip: 'Send',
                onPressed: _isLoading ? null : _sendMessage,
                icon: Icon(
                  Icons.arrow_upward_rounded,
                  color: _isLoading
                      ? Colors.white24
                      : Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration: const BoxDecoration(
        color: Colors.white54,
        shape: BoxShape.circle,
      ),
    );
  }
}