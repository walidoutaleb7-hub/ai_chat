import 'package:flutter/material.dart';

class WeuraComposer extends StatefulWidget {
  const WeuraComposer({
    super.key,
    this.hintText = 'Message WEURA...',
    this.enabled = true,
    this.isLoading = false,
    this.onSend,
    this.onAttach,
    this.onMode,
    this.onVoice,
    this.onStop,
  });

  final String hintText;
  final bool enabled;
  final bool isLoading;

  final ValueChanged<String>? onSend;
  final VoidCallback? onAttach;
  final VoidCallback? onMode;
  final VoidCallback? onVoice;
  final VoidCallback? onStop;

  @override
  State<WeuraComposer> createState() => _WeuraComposerState();
}

class _WeuraComposerState extends State<WeuraComposer> {
  final TextEditingController _controller =
      TextEditingController();

  final FocusNode _focusNode = FocusNode();

  bool get _canSend {
    return widget.enabled &&
        !widget.isLoading &&
        _controller.text.trim().isNotEmpty;
  }

  @override
  void initState() {
    super.initState();

    _controller.addListener(_refresh);
    _focusNode.addListener(_refresh);
  }

  @override
  void didUpdateWidget(
    covariant WeuraComposer oldWidget,
  ) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.isLoading != widget.isLoading ||
        oldWidget.enabled != widget.enabled) {
      _refresh();
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_refresh);
    _focusNode.removeListener(_refresh);

    _controller.dispose();
    _focusNode.dispose();

    super.dispose();
  }

  void _refresh() {
    if (mounted) {
      setState(() {});
    }
  }

  void _send() {
    final text = _controller.text.trim();

    if (!_canSend || text.isEmpty) {
      return;
    }

    widget.onSend?.call(text);

    _controller.clear();

    if (mounted) {
      _focusNode.requestFocus();
    }
  }

  void _handleSubmitted(String value) {
    if (value.trim().isEmpty) {
      return;
    }

    _send();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          12,
          6,
          12,
          12,
        ),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.fromLTRB(
            7,
            5,
            7,
            6,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF111119),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: _focusNode.hasFocus
                  ? const Color(0xFF315DFF)
                      .withValues(alpha: 0.45)
                  : Colors.white
                      .withValues(alpha: 0.07),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black
                    .withValues(alpha: 0.18),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _controller,
                focusNode: _focusNode,
                enabled:
                    widget.enabled &&
                    !widget.isLoading,
                minLines: 1,
                maxLines: 7,
                textInputAction:
                    TextInputAction.newline,
                keyboardType:
                    TextInputType.multiline,
                onSubmitted: _handleSubmitted,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15.5,
                  height: 1.45,
                ),
                cursorColor:
                    const Color(0xFF5B7CFF),
                decoration: InputDecoration(
                  hintText: widget.hintText,
                  hintStyle: const TextStyle(
                    color: Colors.white30,
                    fontSize: 15,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                ),
              ),
              Row(
                children: [
                  _actionButton(
                    icon: Icons.add_rounded,
                    tooltip: 'Attach',
                    onPressed:
                        widget.enabled &&
                                !widget.isLoading
                            ? widget.onAttach
                            : null,
                  ),
                  _actionButton(
                    icon: Icons.tune_rounded,
                    tooltip: 'AI mode',
                    onPressed:
                        widget.enabled &&
                                !widget.isLoading
                            ? widget.onMode
                            : null,
                  ),
                  const Spacer(),
                  if (widget.isLoading) ...[
                    _stopButton(),
                  ] else ...[
                    _actionButton(
                      icon: Icons.mic_none_rounded,
                      tooltip: 'Voice',
                      onPressed: widget.enabled
                          ? widget.onVoice
                          : null,
                    ),
                    const SizedBox(width: 4),
                    _sendButton(),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback? onPressed,
  }) {
    final active = onPressed != null;

    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      splashRadius: 21,
      icon: Icon(
        icon,
        size: 21,
        color: active
            ? Colors.white.withValues(alpha: 0.68)
            : Colors.white.withValues(alpha: 0.18),
      ),
    );
  }

  Widget _sendButton() {
    return AnimatedScale(
      scale: _canSend ? 1.0 : 0.92,
      duration: const Duration(milliseconds: 140),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: _canSend
              ? const Color(0xFF315DFF)
              : const Color(0xFF24242D),
          shape: BoxShape.circle,
        ),
        child: IconButton(
          tooltip: 'Send',
          onPressed: _canSend ? _send : null,
          padding: EdgeInsets.zero,
          icon: Icon(
            Icons.arrow_upward_rounded,
            size: 21,
            color: _canSend
                ? Colors.white
                : Colors.white24,
          ),
        ),
      ),
    );
  }

  Widget _stopButton() {
    return GestureDetector(
      onTap: widget.onStop,
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Colors.redAccent
              .withValues(alpha: 0.14),
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.redAccent
                .withValues(alpha: 0.25),
          ),
        ),
        child: const Icon(
          Icons.stop_rounded,
          size: 21,
          color: Colors.redAccent,
        ),
      ),
    );
  }
}