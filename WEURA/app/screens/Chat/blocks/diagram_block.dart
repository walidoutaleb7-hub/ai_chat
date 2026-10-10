import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders a monospace ASCII/Unicode diagram in a dark themed card.
class DiagramBlock extends StatelessWidget {
  const DiagramBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    final cleaned = content.trimRight();
    if (cleaned.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0B12),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.25),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.10),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ─── Header ───
          Container(
            padding: const EdgeInsets.fromLTRB(14, 9, 12, 9),
            decoration: BoxDecoration(
              color: const Color(0xFF0F1119),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(15),
                topRight: Radius.circular(15),
              ),
              border: Border(
                bottom: BorderSide(color: colors.border),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.account_tree_outlined,
                  size: 15,
                  color: colors.accentGlow,
                ),
                const SizedBox(width: 8),
                Text(
                  'DIAGRAM',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.4,
                  ),
                ),
              ],
            ),
          ),
          // ─── Body: monospace, scrollable horizontally ───
          Padding(
            padding: const EdgeInsets.all(16),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: Text(
                  cleaned,
                  style: TextStyle(
                    color: colors.accentGlow,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    height: 1.5,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
