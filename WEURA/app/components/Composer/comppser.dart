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
  });

  final String hintText;
  final bool enabled;
  final bool isLoading;

  final ValueChanged<String>? onSend;
  final VoidCallback? onAttach;
  final VoidCallback? onMode;
  final VoidCallback? onVoice;

  @override
  State<WeuraComposer> createState() => _WeuraComposerState();
}

class _WeuraComposerState extends State<WeuraComposer> {
  final TextEditingController _controller =
      TextEditingController();

  final FocusNode _focusNode = FocusNode();

  bool get _canSend =>
      widget.enabled &&
      !widget.isLoading &&
      _controller.text.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();

    _controller.addListener(_refresh);
  }

  @override
  void dispose() {
    _controller.removeListener(_refresh);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _refresh() {
    setState(() {});
  }

  void _send() {
    final text = _controller.text.trim();

    if (text.isEmpty || !widget.enabled || widget.isLoading) {
      return;
    }

    widget.onSend?.call(text);
    _controller.clear();
    _focusNode.requestFocus();
  }

  void _handleSubmitted(String value) {
    if (value.trim().isNotEmpty) {
      _send();
    }
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
          padding: const EdgeInsets.fromLTRB(
            7,
            7,
            7,
            7,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF111119),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: _focusNode.hasFocus
                  ? const Color(0xFF315DFF).withOpacity(.45)
                  : Colors.white.withOpacity(.07),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.18),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            children: [
              TextField(
                controller: _controller,
                focusNode: _focusNode,
                enabled: widget.enabled && !widget.isLoading,
                minLines: 1,
                maxLines: 7,
                textInputAction: TextInputAction.newline,
                keyboardType: TextInputType.multiline,
                onSubmitted: _handleSubmitted,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15.5,
                  height: 1.45,
                ),
                cursorColor: const Color(0xFF5B7CFF),
                decoration: InputDecoration(
                  hintText: widget.hintText,
                  hintStyle: const TextStyle(
                    color: Colors.white30,
                    fontSize: 15,
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                ),
              ),
              Row(
                children: [
                  _actionButton(
                    icon: Icons.add,
                    tooltip: 'Attach',
                    onPressed: widget.enabled
                        ? widget.onAttach
                        : null,
                  ),
                  _actionButton(
                    icon: Icons.tune,
                    tooltip: 'AI mode',
                    onPressed: widget.enabled
                        ? widget.onMode
                        : null,
                  ),
                  const Spacer(),
                  if (widget.isLoading)
                    _loadingButton()
                  else ...[
                    _actionButton(
                      icon: Icons.mic_none,
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
    VoidCallback? onPressed,
  }) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      splashRadius: 21,
      icon: Icon(
        icon,
        size: 21,
        color: onPressed == null
            ? Colors.white18
            : Colors.white60,
      ),
    );
  }

  Widget _sendButton() {
    return AnimatedContainer(
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
        icon: Icon(
          Icons.arrow_upward_rounded,
          size: 21,
          color: _canSend
              ? Colors.white
              : Colors.white24,
        ),
      ),
    );
  }

  Widget _loadingButton() {
    return Container(
      width: 42,
      height: 42,
      decoration: const BoxDecoration(
        color: Color(0xFF24242D),
        shape: BoxShape.circle,
      ),
      child: const Padding(
        padding: EdgeInsets.all(12),
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: Colors.white54,
        ),
      ),
    );
  }
}