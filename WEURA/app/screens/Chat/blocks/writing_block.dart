import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/Theme/weura_theme.dart';


class WritingBlock extends StatelessWidget {
  const WritingBlock({
    required this.title,
    required this.body,
    required this.colors,
    this.onCopy,
    this.onShare,
  });

  final String title;
  final String body;
  final WeuraColors colors;
  final VoidCallback? onCopy;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.22),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ─── Header ───
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
            decoration: BoxDecoration(
              color: colors.surfaceAlt,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
              border: Border(
                bottom: BorderSide(
                  color: colors.accentGlow.withValues(alpha: 0.15),
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.edit_note_rounded,
                  size: 18,
                  color: colors.accentGlow,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (onCopy != null)
                  _iconBtn(
                    icon: Icons.copy_rounded,
                    tooltip: 'نسخ',
                    onTap: onCopy!,
                  ),
                if (onShare != null) ...[
                  const SizedBox(width: 4),
                  _iconBtn(
                    icon: Icons.share_outlined,
                    tooltip: 'مشاركة',
                    onTap: onShare!,
                  ),
                ],
              ],
            ),
          ),
          // ─── Body ───
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: SelectableText(
                body,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 16,
                  height: 1.9,
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconBtn({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(
              icon,
              size: 18,
              color: colors.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}
