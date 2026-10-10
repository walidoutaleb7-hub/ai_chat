import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';

/// Premium dialogue/conversation renderer.
///
/// Input format (one line per turn):
///   Name: message
///   Other: reply
///
/// Features:
///   - Auto-alternating left/right alignment
///   - Per-speaker color + initial avatar
///   - Name badge on top of each bubble
///   - Question marks push the bubble left; statements push right
class DialogueBlock extends StatelessWidget {
  const DialogueBlock({
    super.key,
    required this.content,
    required this.colors,
  });

  final String content;
  final WeuraColors colors;

  // 8 distinct speaker colors
  static const List<Color> _palette = [
    Color(0xFF6366F1), // indigo
    Color(0xFF10B981), // emerald
    Color(0xFFF59E0B), // amber
    Color(0xFFEC4899), // pink
    Color(0xFF06B6D4), // cyan
    Color(0xFF8B5CF6), // violet
    Color(0xFFEF4444), // red
    Color(0xFF84CC16), // lime
  ];

  Color _colorFor(String name, Map<String, Color> assigned) {
    if (assigned.containsKey(name)) return assigned[name]!;
    final c = _palette[assigned.length % _palette.length];
    assigned[name] = c;
    return c;
  }

  @override
  Widget build(BuildContext context) {
    final lines = content
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    if (lines.isEmpty) return const SizedBox.shrink();

    final assigned = <String, Color>{};

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.18),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: lines.map((line) {
          return _DialogueTurn(
            line: line,
            colors: colors,
            paletteColor: (name) => _colorFor(name, assigned),
          );
        }).toList(),
      ),
    );
  }
}

class _DialogueTurn extends StatelessWidget {
  const _DialogueTurn({
    required this.line,
    required this.colors,
    required this.paletteColor,
  });

  final String line;
  final WeuraColors colors;
  final Color Function(String) paletteColor;

  @override
  Widget build(BuildContext context) {
    // Split "Name: message"
    String speaker = '';
    String msg = line;
    final colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      speaker = line.substring(0, colonIdx).trim();
      msg = line.substring(colonIdx + 1).trim();
    }

    if (msg.isEmpty) return const SizedBox.shrink();

    // Decide side: questions left, statements right
    final isQuestion =
        msg.endsWith('؟') || msg.endsWith('?');
    final accent = speaker.isNotEmpty
        ? paletteColor(speaker)
        : colors.accentGlow;

    final isRight = !isQuestion;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isRight ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isRight && speaker.isNotEmpty) ...[
            _Avatar(name: speaker, color: accent),
            const SizedBox(width: 10),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                // ─── Speaker name badge ───
                if (speaker.isNotEmpty)
                  Padding(
                    padding: EdgeInsets.only(
                      bottom: 5,
                      left: isRight ? 0 : 4,
                      right: isRight ? 4 : 0,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: accent,
                            boxShadow: [
                              BoxShadow(
                                color: accent.withValues(alpha: 0.6),
                                blurRadius: 6,
                                spreadRadius: 1,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          speaker,
                          style: TextStyle(
                            color: accent,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                // ─── Message bubble ───
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 15,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: isRight
                          ? Alignment.topRight
                          : Alignment.topLeft,
                      end: isRight
                          ? Alignment.bottomLeft
                          : Alignment.bottomRight,
                      colors: isRight
                          ? [
                              accent.withValues(alpha: 0.22),
                              accent.withValues(alpha: 0.10),
                            ]
                          : [
                              colors.surfaceAlt,
                              colors.surfaceAlt.withValues(alpha: 0.7),
                            ],
                    ),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isRight ? 18 : 4),
                      bottomRight: Radius.circular(isRight ? 4 : 18),
                    ),
                    border: Border.all(
                      color: accent.withValues(alpha: 0.30),
                      width: 1,
                    ),
                  ),
                  child: SelectableText(
                    msg,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 15,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (isRight && speaker.isNotEmpty) ...[
            const SizedBox(width: 10),
            _Avatar(name: speaker, color: accent),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, required this.color});

  final String name;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final letter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            color,
            color.withValues(alpha: 0.6),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.35),
            blurRadius: 10,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Center(
        child: Text(
          letter,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
      ),
    );
  }
}
