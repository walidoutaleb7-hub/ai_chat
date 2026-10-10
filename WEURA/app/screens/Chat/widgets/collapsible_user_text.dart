import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Collapsible text used inside user message bubbles.
/// Long messages (>1000 chars) get collapsed to 3 lines by default.
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
  static const int _threshold = 1000;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.text.length <= _threshold) {
      return SelectableText(
        widget.text,
        style: TextStyle(
          color: widget.colors.userBubbleText,
          fontSize: 17,
          height: 1.55,
          letterSpacing: 0.1,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_expanded)
          SelectableText(
            widget.text,
            style: TextStyle(
              color: widget.colors.userBubbleText,
              fontSize: 17,
              height: 1.55,
              letterSpacing: 0.1,
            ),
          )
        else
          Text(
            widget.text,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: widget.colors.userBubbleText,
              fontSize: 17,
              height: 1.55,
              letterSpacing: 0.1,
            ),
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
