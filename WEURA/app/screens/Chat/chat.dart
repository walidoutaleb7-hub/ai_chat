import 'package:flutter/material.dart';

import '../../core/AI/ai_router.dart';
import '../../services/Grok/grok_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    this.initialMessage,
    this.onBack,
  });

  final String? initialMessage;
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

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller =
      TextEditingController();

  final ScrollController _scrollController =
      ScrollController();

  final FocusNode _focusNode = FocusNode();

  final AIRouter _router = const AIRouter();

  late final GrokService _grok;

  final List<_ChatMessage> _messages = [];

  AIMode _mode = AIMode.auto;

  bool _isLoading = false;
  bool _requestCancelled = false;

  // Android emulator:
  // http://10.0.2.2:8080
  //
  // IMPORTANT:
  // On a real phone this must be replaced with a
  // reachable backend URL.
  static const String _serverUrl =
      'http://10.0.2.2:8080';

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
    _focusNode.dispose();
    _grok.dispose();
    super.dispose();
  }

  Future<void> _sendMessage([String? value]) async {
    if (_isLoading) {
      return;
    }

    final text = (value ?? _controller.text).trim();

    if (text.isEmpty) {
      _focusNode.requestFocus();
      return;
    }

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
      _requestCancelled = false;
    });

    _focusNode.unfocus();
    _scrollToBottom();

    try {
      final conversation = <GrokMessage>[
        GrokMessage(
          role: 'system',
          content: _router.systemPromptFor(
            resolvedMode,
          ),
        ),
        ..._messages
            .where((message) => !message.isError)
            .map(
              (message) => GrokMessage(
                role: message.isUser
                    ? 'user'
                    : 'assistant',
                content: message.text,
              ),
            ),
      ];

      final result = await _grok.sendMessage(
        messages: conversation,
      );

      if (!mounted) {
        return;
      }

      if (_requestCancelled) {
        return;
      }

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
      if (!mounted) {
        return;
      }

      if (_requestCancelled) {
        return;
      }

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
    if (!_isLoading) {
      return;
    }

    setState(() {
      _requestCancelled = true;
      _isLoading = false;
    });

    _showMessage('Generation stopped.');
  }

  String _cleanError(Object error) {
    if (error is GrokException) {
      return error.message;
    }

    final message = error.toString();

    if (message.startsWith('Exception: ')) {
      return message.substring(
        'Exception: '.length,
      );
    }

    return 'WEURA could not complete the request. '
        'Please check the connection and try again.';
  }

  void _retryLastMessage() {
    if (_isLoading || _messages.isEmpty) {
      return;
    }

    final lastUserMessage = _messages
        .where((message) => message.isUser)
        .lastOrNull;

    if (lastUserMessage == null) {
      return;
    }

    _messages.removeWhere(
      (message) =>
          !message.isUser &&
          message.isError,
    );

    setState(() {});

    _sendMessage(lastUserMessage.text);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) {
        return;
      }

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }

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
      backgroundColor: const Color(0xFF111119),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              18,
              18,
              18,
              24,
            ),
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
                  icon: Icons.photo_library_outlined,
                  title: 'Photos',
                  subtitle: 'Choose an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Image picker will be connected next.',
                    );
                  },
                ),
                _attachmentOption(
                  icon: Icons.camera_alt_outlined,
                  title: 'Camera',
                  subtitle: 'Capture an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Camera will be connected next.',
                    );
                  },
                ),
                _attachmentOption(
                  icon: Icons.attach_file,
                  title: 'Files',
                  subtitle: 'PDF, DOCX, XLSX, TXT, CSV',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'File picker will be connected next.',
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
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 6,
        vertical: 2,
      ),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: const Color(0xFF1D4ED8)
              .withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(
          icon,
          color: Colors.white,
        ),
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
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 12,
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: Colors.white30,
      ),
    );
  }

  void _showModePicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF101018),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
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
                  return ListTile(
                    leading: Icon(
                      _modeIcon(mode),
                      color: Colors.white70,
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
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () {
            if (widget.onBack != null) {
              widget.onBack!();
            } else if (Navigator.canPop(context)) {
              Navigator.pop(context);
            }
          },
          icon: const Icon(
            Icons.arrow_back_ios_new,
            color: Colors.white,
            size: 20,
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
            icon: Icon(
              _modeIcon(_mode),
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
                        ScrollViewKeyboardDismissBehavior
                            .onDrag,
                    padding: const EdgeInsets.fromLTRB(
                      16,
                      20,
                      16,
                      20,
                    ),
                    itemCount:
                        _messages.length +
                        (_isLoading ? 1 : 0),
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
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: const Color(0xFF1D4ED8)
                    .withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: Colors.blueAccent
                      .withValues(alpha: 0.18),
                ),
              ),
              child: const Icon(
                Icons.auto_awesome,
                color: Colors.blueAccent,
                size: 30,
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
                color: Colors.white
                    .withValues(alpha: 0.55),
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
                  color: message.isError
                      ? Colors.redAccent
                          .withValues(alpha: 0.25)
                      : Colors.white
                          .withValues(alpha: 0.06),
                ),
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            SelectableText(
              message.text,
              style: TextStyle(
                color: Colors.white,
                fontSize: 15.5,
                height: 1.5,
              ),
            ),
            if (message.isError) ...[
              const SizedBox(height: 10),
              TextButton.icon(
                onPressed: _retryLastMessage,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 32),
                ),
                icon: const Icon(
                  Icons.refresh,
                  size: 17,
                ),
                label: const Text('Retry'),
              ),
            ],
          ],
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
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _Dot(),
            const SizedBox(width: 5),
            const _Dot(),
            const SizedBox(width: 5),
            const _Dot(),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: _cancelRequest,
              child: const Icon(
                Icons.stop_circle_outlined,
                color: Colors.white54,
                size: 19,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          12,
          6,
          12,
          12,
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 7,
            vertical: 7,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF111119),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: Colors.white
                  .withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            crossAxisAlignment:
                CrossAxisAlignment.end,
            children: [
              IconButton(
                tooltip: 'Add',
                onPressed: _showAttachmentSheet,
                icon: const Icon(
                  Icons.add,
                  color: Colors.white70,
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  minLines: 1,
                  maxLines: 6,
                  textInputAction:
                      TextInputAction.newline,
                  keyboardType:
                      TextInputType.multiline,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15.5,
                  ),
                  cursorColor: Colors.blueAccent,
                  decoration: const InputDecoration(
                    hintText: 'Message WEURA...',
                    hintStyle: TextStyle(
                      color: Colors.white38,
                    ),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding:
                        EdgeInsets.symmetric(
                      vertical: 10,
                    ),
                  ),
                ),
              ),
              IconButton(
                tooltip: _isLoading
                    ? 'Stop'
                    : 'Send',
                onPressed: _isLoading
                    ? _cancelRequest
                    : _sendMessage,
                icon: Icon(
                  _isLoading
                      ? Icons.stop_rounded
                      : Icons.arrow_upward_rounded,
                  color: _isLoading
                      ? Colors.redAccent
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

extension _LastOrNull<T> on Iterable<T> {
  T? get lastOrNull {
    if (isEmpty) {
      return null;
    }

    return last;
  }
}