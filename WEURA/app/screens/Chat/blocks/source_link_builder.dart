import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;

import '../../../core/Theme/weura_theme.dart';

/// Renders inline [N] citations as small favicon badges that open
/// the source URL. Falls back to a link icon if favicon fails.
class SourceLinkBuilder extends MarkdownElementBuilder {
  SourceLinkBuilder({
    required this.colors,
    required this.onTap,
  });

  final WeuraColors colors;
  final void Function(String url) onTap;

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final href = element.attributes['href'] ?? '';
    final label = element.textContent;

    if (!RegExp(r'^\d+$').hasMatch(label)) return null;
    if (!href.startsWith('http')) return null;

    final host = Uri.tryParse(href)?.host ?? '';
    final faviconUrl =
        'https://www.google.com/s2/favicons?domain=$host&sz=64';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 1, vertical: 1),
      child: Tooltip(
        message: host,
        child: Material(
          color: colors.accentSoft,
          borderRadius: BorderRadius.circular(5),
          child: InkWell(
            onTap: () => onTap(href),
            borderRadius: BorderRadius.circular(5),
            child: Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(5),
                border: Border.all(
                  color: colors.accentGlow.withValues(alpha: 0.35),
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: Image.network(
                  faviconUrl,
                  width: 12,
                  height: 12,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Icon(
                    Icons.link_rounded,
                    size: 11,
                    color: colors.accentGlow,
                  ),
                  loadingBuilder: (_, child, progress) {
                    if (progress == null) return child;
                    return Icon(
                      Icons.link_rounded,
                      size: 11,
                      color: colors.accentGlow.withValues(alpha: 0.5),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
