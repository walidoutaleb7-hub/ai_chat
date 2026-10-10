import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';
import '../../../services/Grok/grok_service.dart';

/// Shows a small, elegant pill indicating what WEURA did before
/// answering: searched the web, used memory, used football mode,
/// or just thought from knowledge.
///
/// Tappable → expands to reveal reason, search query, and angle.
class ReflectionCard extends StatefulWidget {
  const ReflectionCard({
    super.key,
    required this.reflection,
    required this.searchUsed,
    required this.memoryUsed,
    required this.football,
    required this.resultCount,
    required this.colors,
  });

  final GrokReflection reflection;
  final bool searchUsed;
  final bool memoryUsed;
  final bool football;
  final int resultCount;
  final WeuraColors colors;

  @override
  State<ReflectionCard> createState() => _ReflectionCardState();
}

class _ReflectionCardState extends State<ReflectionCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final step = _buildStep();
    final hasDetails = _hasDetails();

    return Padding(
      padding: const EdgeInsets.only(bottom: 10, left: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ─── Pill ───
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: hasDetails
                  ? () => setState(() => _expanded = !_expanded)
                  : null,
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: step.color.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: step.color.withValues(alpha: 0.30),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(step.icon, size: 13, color: step.color),
                    const SizedBox(width: 6),
                    Text(
                      step.label,
                      style: TextStyle(
                        color: step.color,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                      ),
                    ),
                    if (hasDetails) ...[
                      const SizedBox(width: 4),
                      Icon(
                        _expanded
                            ? Icons.expand_less_rounded
                            : Icons.expand_more_rounded,
                        size: 14,
                        color: step.color.withValues(alpha: 0.7),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),

          // ─── Details (expanded) ───
          if (_expanded && hasDetails)
            Padding(
              padding: const EdgeInsets.only(top: 8, left: 2, right: 6),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: widget.colors.surface.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: widget.colors.border,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (widget.reflection.reason.isNotEmpty)
                      _row(
                        Icons.lightbulb_outline_rounded,
                        'Reason',
                        widget.reflection.reason,
                      ),
                    if (widget.reflection.searchQuery.isNotEmpty &&
                        widget.searchUsed)
                      _row(
                        Icons.search_rounded,
                        'Query',
                        widget.reflection.searchQuery,
                      ),
                    if (widget.reflection.angle.isNotEmpty)
                      _row(
                        Icons.explore_outlined,
                        'Angle',
                        widget.reflection.angle,
                      ),
                    if (widget.resultCount > 0)
                      _row(
                        Icons.article_outlined,
                        'Sources',
                        '${widget.resultCount} results',
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: widget.colors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                children: [
                  TextSpan(
                    text: '$label: ',
                    style: TextStyle(
                      color: widget.colors.textMuted,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  TextSpan(
                    text: value,
                    style: TextStyle(
                      color: widget.colors.textSecondary,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool _hasDetails() {
    return widget.reflection.reason.isNotEmpty ||
        widget.reflection.searchQuery.isNotEmpty ||
        widget.reflection.angle.isNotEmpty ||
        widget.resultCount > 0;
  }

  _ReflectionStep _buildStep() {
    if (widget.football && widget.searchUsed) {
      return _ReflectionStep(
        icon: Icons.sports_soccer_rounded,
        label: 'Football · ${widget.resultCount} sources',
        color: const Color(0xFF34D399),
      );
    }
    if (widget.searchUsed) {
      return _ReflectionStep(
        icon: Icons.travel_explore_rounded,
        label: 'Searched the web · ${widget.resultCount} sources',
        color: widget.colors.accentGlow,
      );
    }
    if (widget.memoryUsed) {
      return _ReflectionStep(
        icon: Icons.psychology_rounded,
        label: 'Recalled from memory',
        color: const Color(0xFF8B5CF6),
      );
    }
    return _ReflectionStep(
      icon: Icons.auto_awesome_rounded,
      label: 'Answered from knowledge',
      color: widget.colors.textMuted,
    );
  }
}

class _ReflectionStep {
  const _ReflectionStep({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;
}
