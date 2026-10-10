import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;

import '../../../core/Theme/weura_theme.dart';

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

    final host = Uri.tryParse(href)?.host ?? href;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
      child: Tooltip(
        message: host,
        child: Material(
          color: colors.accentSoft,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            onTap: () => onTap(href),
            borderRadius: BorderRadius.circular(6),
            child: Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: colors.accentGlow.withValues(alpha: 0.45),
                ),
              ),
              child: Icon(
                Icons.link_rounded,
                size: 12,
                color: colors.accentGlow,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
