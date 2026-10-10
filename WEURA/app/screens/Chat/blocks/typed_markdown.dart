import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders Markdown instantly (formatted) with a glowing cursor that
/// disappears after a short delay — mimicking Gemini/ChatGPT streaming.
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
  late final AnimationController _fadeController;
  late final AnimationController _cursorController;

  bool _showCursor = true;

  @override
  void initState() {
    super.initState();

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );

    _cursorController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _fadeController.forward();

    // Hide the cursor after a short delay (feels like "done typing").
    Future.delayed(const Duration(milliseconds: 1400), () {
      if (!mounted) return;
      setState(() => _showCursor = false);
      _cursorController.stop();
      widget.onComplete?.call();
    });

    // Notify parent once so it can adjust scroll.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onTick?.call();
    });
  }

  @override
  void didUpdateWidget(covariant TypedMarkdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fullText != widget.fullText) {
      // New content → show cursor briefly again.
      setState(() => _showCursor = true);
      _cursorController.repeat(reverse: true);
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (!mounted) return;
        setState(() => _showCursor = false);
        _cursorController.stop();
        widget.onComplete?.call();
      });
    }
  }

  @override
  void dispose() {
    _fadeController.dispose();
    _cursorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return FadeTransition(
      opacity: _fadeController,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MarkdownBody(
            data: widget.fullText,
            selectable: true,
            styleSheet: widget.styleSheet,
            builders: widget.builders,
            imageBuilder: widget.imageBuilder,
          ),
          if (_showCursor)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 2),
              child: AnimatedBuilder(
                animation: _cursorController,
                builder: (context, _) {
                  final t = _cursorController.value;
                  return Opacity(
                    opacity: 0.35 + (t * 0.55),
                    child: Container(
                      width: 34,
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
      ),
    );
  }
}
