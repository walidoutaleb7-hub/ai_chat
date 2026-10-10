import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders a numbered step-by-step list with elegant cards.
///
/// Input format:
///   1. Title of step
///      Optional detail line.
///   2. Another step
///      Detail.
class StepsBlock extends StatelessWidget {
  const StepsBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    final steps = _parse(content);
    if (steps.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.20),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: steps.asMap().entries.map((entry) {
          final index = entry.key;
          final step = entry.value;
          final isLast = index == steps.length - 1;
          return _StepTile(
            number: index + 1,
            title: step.title,
            detail: step.detail,
            colors: colors,
            isLast: isLast,
          );
        }).toList(),
      ),
    );
  }

  List<_Step> _parse(String raw) {
    final steps = <_Step>[];
    _Step? current;

    for (final line in raw.split('\n')) {
      final trimmed = line.trimRight();
      if (trimmed.trim().isEmpty) continue;

      // Match "1. Title" or "1) Title" or "1- Title"
      final match = RegExp(r'^(\d+)[\.\)\-]\s+(.+)$').firstMatch(trimmed.trim());

      if (match != null) {
        if (current != null) steps.add(current);
        current = _Step(title: match.group(2)!.trim(), detail: '');
      } else if (current != null) {
        // Continuation line → detail
        current = _Step(
          title: current.title,
          detail: current.detail.isEmpty
              ? trimmed.trim()
              : '${current.detail}\n${trimmed.trim()}',
        );
      }
    }

    if (current != null) steps.add(current);
    return steps;
  }
}

class _Step {
  const _Step({required this.title, required this.detail});
  final String title;
  final String detail;
}

class _StepTile extends StatelessWidget {
  const _StepTile({
    required this.number,
    required this.title,
    required this.detail,
    required this.colors,
    required this.isLast,
  });

  final int number;
  final String title;
  final String detail;
  final WeuraColors colors;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ─── Number badge + connector line ───
          Column(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      colors.accentGlow,
                      colors.accent,
                    ],
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: colors.accentGlow.withValues(alpha: 0.35),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    '$number',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      height: 1,
                    ),
                  ),
                ),
              ),
              if (!isLast)
                Container(
                  width: 2,
                  height: 30,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        colors.accentGlow.withValues(alpha: 0.5),
                        colors.accentGlow.withValues(alpha: 0.05),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          // ─── Title + detail ───
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      height: 1.4,
                    ),
                  ),
                  if (detail.trim().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      detail,
                      style: TextStyle(
                        color: colors.textSecondary,
                        fontSize: 14,
                        height: 1.55,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
