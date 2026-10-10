import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Collapsible text used inside user message bubbles.
/// Long messages (> 8 lines) get collapsed by default.
class CollapsibleUserText extends StatefulWidget {
  const CollapsibleUserText({
    super.key,
    required this.text,
    required this.colors,
  });

  final String text;
  final WeuraColors colors;

  @override
  State<CollapsibleUserText> createState() => _CollapsibleUserTextState();
}

class _CollapsibleUserTextState extends State<CollapsibleUserText> {
  /// Collapse when the message exceeds this many lines.
  static const int _maxLinesCollapsed = 8;

  /// Also collapse very long single-paragraph messages.
  static const int _maxCharsCollapsed = 500;

  bool _expanded = false;

  bool get _shouldCollapse {
    final lineCount = widget.text.split('\n').length;
    if (lineCount > _maxLinesCollapsed) return true;
    if (widget.text.length > _maxCharsCollapsed) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      color: widget.colors.userBubbleText,
      fontSize: 17,
      height: 1.55,
      letterSpacing: 0.1,
    );

    if (!_shouldCollapse) {
      return SelectableText(widget.text, style: style);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_expanded)
          SelectableText(widget.text, style: style)
        else
          Text(
            widget.text,
            maxLines: _maxLinesCollapsed,
            overflow: TextOverflow.ellipsis,
            style: style,
          ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _expanded ? 'عرض أقل' : 'عرض المزيد',
                  style: TextStyle(
                    color: widget.colors.userBubbleText
                        .withValues(alpha: 0.75),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  _expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  size: 16,
                  color: widget.colors.userBubbleText
                      .withValues(alpha: 0.75),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
