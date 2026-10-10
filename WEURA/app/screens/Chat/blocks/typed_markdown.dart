import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders Markdown progressively with a typing animation
/// and a blinking cursor.
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
  late AnimationController _controller;
  late AnimationController _cursorController;
  late String _visibleText = '';
  bool _done = false;
  bool _controllerReady = false;

  // Renders images inside Markdown with rounded corners + shadow.
  Widget _buildMarkdownImage(
    WeuraColors colors,
    Uri uri,
    String? title,
    String? alt,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Container(
          decoration: BoxDecoration(
            boxShadow: [
              BoxShadow(
                color: colors.accentGlow.withValues(alpha: 0.20),
                blurRadius: 18,
                spreadRadius: 1,
              ),
            ],
          ),
          child: Image.network(
            uri.toString(),
            fit: BoxFit.cover,
            loadingBuilder: (_, child, progress) {
              if (progress == null) return child;
              return Container(
                height: 200,
                color: colors.surfaceAlt,
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.accentGlow,
                  ),
                ),
              );
            },
            errorBuilder: (_, __, ___) => Container(
              height: 120,
              color: colors.surfaceAlt,
              child: Center(
                child: Icon(
                  Icons.broken_image_outlined,
                  color: colors.textFaint,
                  size: 32,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();

    _cursorController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _cursorController.value = 0.7;
    _cursorController.repeat(reverse: true);

    _startTyping(widget.fullText);
  }

  void _startTyping(String text) {
    if (_controllerReady) {
      _controller.removeListener(_onTick);
      _controller.dispose();
    }

    final len = text.length;

    if (len > 4000) {
      _visibleText = text;
      _done = true;
      _controller = AnimationController(vsync: this);
      _controllerReady = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onComplete?.call();
      });
      _cursorController.stop();
      return;
    }

    final durationMs = (len * 8).clamp(300, 3000);

    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: durationMs),
    );
    _controllerReady = true;

    _visibleText = '';
    _done = false;

    _controller.addListener(_onTick);
    _controller.forward().whenComplete(() {
      if (!mounted) return;
      _done = true;
      _cursorController.stop();
      widget.onComplete?.call();
    });
  }

  @override
  void didUpdateWidget(covariant TypedMarkdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fullText != widget.fullText) {
      _startTyping(widget.fullText);
      if (mounted) setState(() {});
    }
  }

  String _stripUrls(String text) {
    return text.replaceAllMapped(
      RegExp(r'\[(\d+)\]\([^)]*\)'),
      (m) => '[${m[1]}]',
    );
  }

  void _onTick() {
    // Use runes instead of code units to avoid splitting emoji or
    // Arabic letters + combining marks during the typing animation.
    final fullRunes = widget.fullText.runes.toList();
    final total = fullRunes.length;
    if (total == 0) return;

    final count = (_controller.value * total).floor().clamp(0, total);
    final nextVisible =
        String.fromCharCodes(fullRunes.take(count));
    if (nextVisible == _visibleText) return;

    setState(() {
      _visibleText = nextVisible;
    });

    widget.onTick?.call();
  }

  @override
  void dispose() {
    _controller.removeListener(_onTick);
    _controller.dispose();
    _cursorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return MarkdownBody(
        data: _visibleText,
        selectable: true,
        styleSheet: widget.styleSheet,
        builders: widget.builders,
        imageBuilder: widget.imageBuilder ??
            ((uri, title, alt) => _buildMarkdownImage(
                  WeuraColors.of(context),
                  uri,
                  title,
                  alt,
                )),
      );
    }

    final baseStyle = widget.styleSheet.p ??
        const TextStyle(fontSize: 17, height: 1.85);
    final colors = WeuraColors.of(context);

    return AnimatedBuilder(
      animation: _cursorController,
      builder: (context, _) {
        final t = _cursorController.value;
        return RichText(
          text: TextSpan(
            style: baseStyle,
            children: [
              TextSpan(text: _stripUrls(_visibleText)),
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Opacity(
                    opacity: 0.55 + (t * 0.45),
                    child: Container(
                      width: 3,
                      height: 22,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            colors.accentGlow,
                            colors.accentGlow.withValues(alpha: 0.5),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(2.5),
                        boxShadow: [
                          BoxShadow(
                            color: colors.accentGlow
                                .withValues(alpha: 0.7 * t),
                            blurRadius: 10,
                            spreadRadius: 1.5,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
