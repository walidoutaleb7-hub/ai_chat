import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../../core/Theme/weura_theme.dart';

/// Reveals Markdown progressively — word by word — and renders the
/// visible portion formatted (no raw markdown symbols shown).
///
/// The user can scroll up at any time; the animation does NOT
/// force them back to the bottom.
class TypedMarkdown extends StatefulWidget {
  const TypedMarkdown({
    super.key,
    required this.fullText,
    required this.styleSheet,
    this.builders = const {},
    this.onComplete,
    this.onTick,
    this.imageBuilder,
  });

  final String fullText;
  final MarkdownStyleSheet styleSheet;
  final Map<String, MarkdownElementBuilder> builders;
  final VoidCallback? onComplete;
  final VoidCallback? onTick;
  final Widget Function(Uri, String?, String?)? imageBuilder;

  @override
  State<TypedMarkdown> createState() => _TypedMarkdownState();
}

class _TypedMarkdownState extends State<TypedMarkdown>
    with TickerProviderStateMixin {
  late final AnimationController _cursorController;

  Timer? _timer;
  String _visible = '';
  int _cursor = 0;
  List<String> _tokens = [];
  bool _done = false;

  @override
  void initState() {
    super.initState();

    _cursorController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _startTyping(widget.fullText);
  }

  void _startTyping(String text) {
    _timer?.cancel();
    _tokens = text.split(RegExp(r'(?<=\s)'));
    _cursor = 0;
    _visible = '';
    _done = false;

    if (_tokens.isEmpty) {
      _done = true;
      widget.onComplete?.call();
      return;
    }

    // Total duration ≈ 2.4 s for a long answer, min 0.6 s.
    final totalMs = (text.length * 12).clamp(600, 2400);
    final stepMs = (totalMs / _tokens.length).round().clamp(8, 40);

    _timer = Timer.periodic(Duration(milliseconds: stepMs), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_cursor >= _tokens.length) {
        t.cancel();
        setState(() => _done = true);
        _cursorController.stop();
        widget.onComplete?.call();
        return;
      }

      setState(() {
        _visible += _tokens[_cursor];
        _cursor++;
      });

      widget.onTick?.call();
    });
  }

  @override
  void didUpdateWidget(covariant TypedMarkdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fullText != widget.fullText) {
      _cursorController.repeat(reverse: true);
      _startTyping(widget.fullText);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _cursorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    // When done → render the full formatted markdown, no cursor.
    if (_done) {
      return MarkdownBody(
        data: widget.fullText,
        selectable: true,
        styleSheet: widget.styleSheet,
        builders: widget.builders,
        imageBuilder: widget.imageBuilder,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MarkdownBody(
          data: _visible,
          selectable: false,
          styleSheet: widget.styleSheet,
          builders: widget.builders,
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, left: 2),
          child: AnimatedBuilder(
            animation: _cursorController,
            builder: (context, _) {
              final t = _cursorController.value;
              return Opacity(
                opacity: 0.35 + (t * 0.55),
                child: Container(
                  width: 32,
                  height: 3,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        colors.accentGlow.withValues(alpha: 0.0),
                        colors.accentGlow,
                        colors.accentGlow.withValues(alpha: 0.0),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(2),
                    boxShadow: [
                      BoxShadow(
                        color: colors.accentGlow
                            .withValues(alpha: 0.7 * t),
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
