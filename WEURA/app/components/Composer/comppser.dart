import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';

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
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_refresh);
    _focusNode.addListener(_refresh);
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
    if (mounted) setState(() {});
  }

  bool get _canSend =>
      widget.enabled &&
      !widget.isLoading &&
      _controller.text.trim().isNotEmpty;

  bool get _sendOnEnter => AppSettingsManager.instance.sendOnEnter;

  void _send() {
    final text = _controller.text.trim();
    if (!_canSend || text.isEmpty) return;

    widget.onSend?.call(text);
    _controller.clear();
    _focusNode.requestFocus();
  }

  /// Called when the user presses the keyboard "Send" button
  /// (only active when sendOnEnter is true).
  void _handleSubmitted(String value) {
    if (value.trim().isNotEmpty) {
      _send();
    }
  }

  /// Manual key handler: on desktop/web, Enter sends when sendOnEnter.
  /// On mobile, we rely on TextInputAction.
  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey != LogicalKeyboardKey.enter) {
      return KeyEventResult.ignored;
    }

    final shiftPressed = HardwareKeyboard.instance.isShiftPressed;
    if (shiftPressed) return KeyEventResult.ignored;

    if (_sendOnEnter && _canSend) {
      _send();
      return KeyEventResult.handled;
    }

    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.fromLTRB(7, 5, 7, 6),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: _focusNode.hasFocus
                  ? colors.accent.withValues(alpha: 0.45)
                  : colors.border,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Focus(
                onKeyEvent: _handleKey,
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  enabled: widget.enabled && !widget.isLoading,
                  minLines: 1,
                  maxLines: 7,
                  keyboardType: TextInputType.multiline,
                  textInputAction: _sendOnEnter
                      ? TextInputAction.send
                      : TextInputAction.newline,
                  onSubmitted: _sendOnEnter ? _handleSubmitted : null,
                  textCapitalization: TextCapitalization.sentences,
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 15.5,
                    height: 1.45,
                  ),
                  cursorColor: colors.accent,
                  decoration: InputDecoration(
                    hintText: widget.hintText,
                    hintStyle: TextStyle(
                      color: colors.textFaint,
                      fontSize: 15,
                    ),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                  ),
                ),
              ),
              Row(
                children: [
                  _svgButton(
                    colors: colors,
                    asset: 'assets/icons/attachment.svg',
                    tooltip: 'Attach',
                    onPressed: widget.enabled && !widget.isLoading
                        ? widget.onAttach
                        : null,
                  ),
                  _svgButton(
                    colors: colors,
                    asset: 'assets/icons/mode.svg',
                    tooltip: 'AI mode',
                    onPressed: widget.enabled && !widget.isLoading
                        ? widget.onMode
                        : null,
                  ),
                  const Spacer(),
                  if (widget.isLoading)
                    _stopButton(colors)
                  else ...[
                    _svgButton(
                      colors: colors,
                      asset: 'assets/icons/microphone.svg',
                      tooltip: 'Voice',
                      onPressed: widget.enabled ? widget.onVoice : null,
                    ),
                    const SizedBox(width: 4),
                    _sendButton(colors),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _svgButton({
    required WeuraColors colors,
    required String asset,
    required String tooltip,
    required VoidCallback? onPressed,
  }) {
    final active = onPressed != null;

    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      splashRadius: 21,
      icon: AnimatedOpacity(
        duration: const Duration(milliseconds: 150),
        opacity: active ? 1 : 0.28,
        child: SvgPicture.asset(
          asset,
          width: 23,
          height: 23,
        ),
      ),
    );
  }

  Widget _sendButton(WeuraColors colors) {
    return AnimatedScale(
      scale: _canSend ? 1 : 0.92,
      duration: const Duration(milliseconds: 140),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _canSend ? _send : null,
          borderRadius: BorderRadius.circular(21),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: _canSend
                  ? colors.accent
                  : colors.surfaceAlt,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Opacity(
                opacity: _canSend ? 1 : 0.3,
                child: SvgPicture.asset(
                  'assets/icons/send.svg',
                  width: 23,
                  height: 23,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _stopButton(WeuraColors colors) {
    return Tooltip(
      message: 'Stop',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onStop,
          borderRadius: BorderRadius.circular(21),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: colors.accentSoft,
              shape: BoxShape.circle,
              border: Border.all(
                color: colors.accentGlow.withValues(alpha: 0.30),
              ),
            ),
            child: Center(
              child: SvgPicture.asset(
                'assets/icons/stop.svg',
                width: 23,
                height: 23,
              ),
            ),
          ),
        ),
      ),
    );
  }
}