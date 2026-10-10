import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Renders an honest code verification report.
///
/// Input format:
///   status: reviewed | tested | partial | proposed
///   language: python
///   checks:
///     - Syntax valid ✓
///     - Imports complete ✓
///   notes: short honest sentence.
class ReportBlock extends StatelessWidget {
  const ReportBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    final data = _parse(content);
    if (data == null) return const SizedBox.shrink();

    final (icon, color, label) = _statusStyle(data.status);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: color.withValues(alpha: 0.35),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ─── Header ───
          Container(
            padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  color.withValues(alpha: 0.22),
                  color.withValues(alpha: 0.08),
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(15),
                topRight: Radius.circular(15),
              ),
              border: Border(
                bottom: BorderSide(
                  color: color.withValues(alpha: 0.25),
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 9),
                Text(
                  label,
                  style: TextStyle(
                    color: color,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                  ),
                ),
                const Spacer(),
                if (data.language.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      data.language.toUpperCase(),
                      style: TextStyle(
                        color: color,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ─── Checks list ───
          if (data.checks.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: data.checks.map((check) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          _checkIcon(check),
                          size: 15,
                          color: _checkColor(check, color, colors),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            check,
                            style: TextStyle(
                              color: colors.textSecondary,
                              fontSize: 13.5,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),

          // ─── Notes ───
          if (data.notes.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
              child: Container(
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: colors.surfaceAlt.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: colors.border,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.info_outline_rounded,
                      size: 15,
                      color: colors.textMuted,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        data.notes,
                        style: TextStyle(
                          color: colors.textSecondary,
                          fontSize: 13,
                          height: 1.45,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            const SizedBox(height: 10),
        ],
      ),
    );
  }

  _ReportData? _parse(String raw) {
    String status = 'reviewed';
    String language = '';
    final checks = <String>[];
    String notes = '';
    bool inChecks = false;
    final notesBuffer = StringBuffer();

    for (final line in raw.split('\n')) {
      final trimmed = line.trimRight();
      final lower = trimmed.trimLeft().toLowerCase();

      if (lower.startsWith('status:')) {
        status = trimmed.split(':').sublist(1).join(':').trim();
        inChecks = false;
        continue;
      }
      if (lower.startsWith('language:')) {
        language = trimmed.split(':').sublist(1).join(':').trim();
        inChecks = false;
        continue;
      }
      if (lower.startsWith('checks:')) {
        inChecks = true;
        continue;
      }
      if (lower.startsWith('notes:')) {
        notes = trimmed.split(':').sublist(1).join(':').trim();
        inChecks = false;
        continue;
      }

      if (inChecks) {
        final m = RegExp(r'^[\s\-•*]+(.+)$').firstMatch(trimmed);
        if (m != null && m.group(1)!.trim().isNotEmpty) {
          checks.add(m.group(1)!.trim());
        }
      } else if (notes.isNotEmpty || notesBuffer.isNotEmpty) {
        if (trimmed.trim().isNotEmpty) {
          notesBuffer.writeln(trimmed.trim());
        }
      }
    }

    if (notesBuffer.isNotEmpty) {
      notes = '${notes.isEmpty ? '' : '$notes '}${notesBuffer.toString().trim()}';
    }

    return _ReportData(
      status: status,
      language: language,
      checks: checks,
      notes: notes,
    );
  }

  (IconData, Color, String) _statusStyle(String status) {
    switch (status.toLowerCase().trim()) {
      case 'tested':
        return (
          Icons.verified_rounded,
          const Color(0xFF10B981),
          'VERIFIED • TESTED',
        );
      case 'reviewed':
        return (
          Icons.check_circle_outline_rounded,
          const Color(0xFF3B82F6),
          'CODE REVIEWED',
        );
      case 'partial':
        return (
          Icons.warning_amber_rounded,
          const Color(0xFFF59E0B),
          'PARTIALLY VERIFIED',
        );
      case 'proposed':
        return (
          Icons.science_outlined,
          const Color(0xFF8B5CF6),
          'PROPOSED • UNVERIFIED',
        );
      default:
        return (
          Icons.check_circle_outline_rounded,
          const Color(0xFF3B82F6),
          'CODE REVIEW',
        );
    }
  }

  IconData _checkIcon(String check) {
    final lower = check.toLowerCase();
    if (lower.contains('✓') || lower.contains('pass')) {
      return Icons.check_rounded;
    }
    if (lower.contains('✗') || lower.contains('fail') || lower.contains('!')){
      return Icons.close_rounded;
    }
    return Icons.circle_outlined;
  }

  Color _checkColor(
    String check,
    Color fallback,
    WeuraColors colors,
  ) {
    final lower = check.toLowerCase();
    if (lower.contains('✓') || lower.contains('pass')) {
      return const Color(0xFF10B981);
    }
    if (lower.contains('✗') || lower.contains('fail')) {
      return colors.danger;
    }
    return fallback;
  }
}

class _ReportData {
  const _ReportData({
    required this.status,
    required this.language,
    required this.checks,
    required this.notes,
  });

  final String status;
  final String language;
  final List<String> checks;
  final String notes;
}
