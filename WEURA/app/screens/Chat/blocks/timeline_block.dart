import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders a vertical timeline with year badges and connectors.
///
/// Input format:
///   1990 | Event title one
///   1995 | Event title two — with short detail
///   2003 | Another major event
class TimelineBlock extends StatelessWidget {
  const TimelineBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    final events = _parse(content);
    if (events.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.20),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: events.asMap().entries.map((entry) {
          return _TimelineRow(
            year: entry.value.year,
            title: entry.value.title,
            detail: entry.value.detail,
            colors: colors,
            isLast: entry.key == events.length - 1,
          );
        }).toList(),
      ),
    );
  }

  List<_TimelineEvent> _parse(String raw) {
    final events = <_TimelineEvent>[];
    for (final line in raw.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;

      final parts = trimmed.split('|');
      if (parts.length < 2) continue;

      final year = parts[0].trim();
      final rest = parts.sublist(1).join('|').trim();

      // Split "Title — detail" or "Title - detail"
      final dashIdx = rest.indexOf(' — ') >= 0
          ? rest.indexOf(' — ')
          : rest.indexOf(' - ');
      String title = rest;
      String detail = '';
      if (dashIdx > 0) {
        title = rest.substring(0, dashIdx).trim();
        detail = rest.substring(dashIdx + 3).trim();
      }

      events.add(_TimelineEvent(year: year, title: title, detail: detail));
    }
    return events;
  }
}

class _TimelineEvent {
  const _TimelineEvent({
    required this.year,
    required this.title,
    required this.detail,
  });
  final String year;
  final String title;
  final String detail;
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.year,
    required this.title,
    required this.detail,
    required this.colors,
    required this.isLast,
  });

  final String year;
  final String title;
  final String detail;
  final WeuraColors colors;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ─── Year badge ───
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  colors.accent,
                  colors.accentGlow,
                ],
              ),
              borderRadius: BorderRadius.circular(9),
              boxShadow: [
                BoxShadow(
                  color: colors.accentGlow.withValues(alpha: 0.30),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Text(
              year,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // ─── Dot + vertical line ───
          Column(
            children: [
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.accentGlow,
                  boxShadow: [
                    BoxShadow(
                      color: colors.accentGlow.withValues(alpha: 0.6),
                      blurRadius: 8,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              if (!isLast)
                Container(
                  width: 2,
                  height: 40,
                  margin: const EdgeInsets.only(top: 3),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        colors.accentGlow.withValues(alpha: 0.4),
                        colors.accentGlow.withValues(alpha: 0.05),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          // ─── Title + detail ───
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      height: 1.4,
                    ),
                  ),
                  if (detail.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      detail,
                      style: TextStyle(
                        color: colors.textSecondary,
                        fontSize: 13.5,
                        height: 1.5,
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
