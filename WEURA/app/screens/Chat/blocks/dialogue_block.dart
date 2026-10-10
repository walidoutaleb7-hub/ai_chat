import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/Theme/weura_theme.dart';


class DialogueBlock extends StatelessWidget {
  const DialogueBlock({required this.content, required this.colors});

  final String content;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    // Parse optional lines: "Name: message" or just "message".
    final lines = content
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    if (lines.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.20),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: lines.map((line) {
          // Split "Name: msg" if colon found.
          String speaker = '';
          String msg = line;
          final colonIdx = line.indexOf(':');
          if (colonIdx > 0 && colonIdx < 30) {
            speaker = line.substring(0, colonIdx).trim();
            msg = line.substring(colonIdx + 1).trim();
          }

          // Alternate alignment for dialogue
          final isQuestion = msg.trim().endsWith('؟') ||
              msg.trim().endsWith('?');

          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              mainAxisAlignment: isQuestion
                  ? MainAxisAlignment.start
                  : MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (speaker.isNotEmpty && isQuestion) ...[
                  _avatar(speaker),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: isQuestion
                          ? colors.surfaceAlt
                          : colors.accentGlow.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(16),
                        topRight: const Radius.circular(16),
                        bottomLeft: Radius.circular(isQuestion ? 4 : 16),
                        bottomRight: Radius.circular(isQuestion ? 16 : 4),
                      ),
                      border: Border.all(
                        color: colors.accentGlow
                            .withValues(alpha: isQuestion ? 0.15 : 0.25),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (speaker.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              speaker,
                              style: TextStyle(
                                color: colors.accentGlow,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        SelectableText(
                          msg,
                          style: TextStyle(
                            color: colors.textPrimary,
                            fontSize: 15,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (speaker.isNotEmpty && !isQuestion) ...[
                  const SizedBox(width: 8),
                  _avatar(speaker),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _avatar(String name) {
    final letter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: colors.accentGlow.withValues(alpha: 0.25),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          letter,
          style: TextStyle(
            color: colors.accentGlow,
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
