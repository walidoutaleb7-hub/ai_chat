import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders a comparison table with alternating row highlights.
///
/// Input format:
///   # Metric | Option A | Option B
///   Speed    | Fast     | Slow
///   Cost     | High     | Low
class CompareBlock extends StatelessWidget {
  const CompareBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    final rows = _parse(content);
    if (rows.isEmpty) return const SizedBox.shrink();

    final header = rows.first;
    final body = rows.sublist(1);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.25),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── Header row ───
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    colors.accent.withValues(alpha: 0.20),
                    colors.accentGlow.withValues(alpha: 0.10),
                  ],
                ),
                border: Border(
                  bottom: BorderSide(
                    color: colors.accentGlow.withValues(alpha: 0.30),
                  ),
                ),
              ),
              child: Row(
                children: header.cells.map((cell) {
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Text(
                        cell,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: colors.textPrimary,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            // ─── Body rows ───
            ...body.asMap().entries.map((entry) {
              final idx = entry.key;
              final isEven = idx % 2 == 0;
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: isEven
                      ? Colors.transparent
                      : colors.surfaceAlt.withValues(alpha: 0.35),
                ),
                child: Row(
                  children: entry.value.cells.map((cell) {
                    return Expanded(
                      child: Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 6),
                        child: Text(
                          cell,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: colors.textSecondary,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  List<_CompareRow> _parse(String raw) {
    final rows = <_CompareRow>[];
    for (final line in raw.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;

      // Strip leading "# "
      final clean = trimmed.startsWith('#')
          ? trimmed.replaceFirst(RegExp(r'^#\s*'), '')
          : trimmed;

      final cells = clean.split('|').map((c) => c.trim()).toList();
      if (cells.length >= 2) {
        rows.add(_CompareRow(cells: cells));
      }
    }
    return rows;
  }
}

class _CompareRow {
  const _CompareRow({required this.cells});
  final List<String> cells;
}
