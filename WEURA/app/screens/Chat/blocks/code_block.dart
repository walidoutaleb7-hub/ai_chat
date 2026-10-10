import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:share_plus/share_plus.dart';

import '../../../core/Theme/weura_theme.dart';
import '../widgets/inline_image.dart';
import 'compare_block.dart';
import 'report_block.dart';
import 'diagram_block.dart';
import 'dialogue_block.dart';
import 'latex_block.dart';
import 'steps_block.dart';
import 'timeline_block.dart';
import 'writing_block.dart';

class CodeBlockBuilder extends MarkdownElementBuilder {
  CodeBlockBuilder({
    required this.colors,
    required this.serverUrl,
  });

  final WeuraColors colors;
  final String serverUrl;

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final cls = element.attributes['class'];

    if (cls == null || !cls.startsWith('language-')) {
      return null;
    }

    final language = cls.substring('language-'.length).trim().toLowerCase();
    final code = element.textContent.trimRight();

    // LaTeX math block
    if (language == 'latex' ||
        language == 'math' ||
        language == 'tex' ||
        language == 'katex') {
      return LatexBlock(latex: code, colors: colors);
    }

    // Dialogue / chat box
    if (language == 'dialogue' ||
        language == 'chat' ||
        language == 'bubble' ||
        language == 'conversation') {
      return DialogueBlock(content: code, colors: colors);
    }

    // Creative writing block (articles, stories, poetry)
    if (language == 'writing' ||
        language == 'article' ||
        language == 'poem' ||
        language == 'story' ||
        language == 'text') {
      // First line = title (if it starts with '# '), body = rest
      final lines = code.split('\n');
      String title = 'Écriture';
      String body = code;

      if (lines.isNotEmpty && lines.first.startsWith('# ')) {
        title = lines.first.substring(2).trim();
        body = lines.sublist(1).join('\n').trim();
      } else if (lines.isNotEmpty && lines.first.trim().isNotEmpty &&
                 lines.first.length < 60 &&
                 lines.length > 1) {
        // First short line = title
        title = lines.first.trim();
        body = lines.sublist(1).join('\n').trim();
      }

      return WritingBlock(
        title: title,
        body: body,
        colors: colors,
        onCopy: () => Clipboard.setData(ClipboardData(text: code)),
        onShare: () => Share.share(code),
      );
    }

    // Inline image request
    if (language == 'inline-image' || language == 'img') {
      return InlineImage(
        query: code.trim(),
        serverUrl: serverUrl,
        colors: colors,
      );
    }

    // Code verification report
    if (language == 'report' || language == 'verification') {
      return ReportBlock(content: code, colors: colors);
    }

    // Steps block
    if (language == 'steps' || language == 'step') {
      return StepsBlock(content: code, colors: colors);
    }

    // Diagram block
    if (language == 'diagram' ||
        language == 'ascii' ||
        language == 'flow') {
      return DiagramBlock(content: code, colors: colors);
    }

    // Compare table
    if (language == 'compare' ||
        language == 'comparison' ||
        language == 'vs') {
      return CompareBlock(content: code, colors: colors);
    }

    // Timeline
    if (language == 'timeline' || language == 'history') {
      return TimelineBlock(content: code, colors: colors);
    }

    return Directionality(
      textDirection: TextDirection.ltr,
      child: CodeBlock(
        code: code,
        language: language,
        colors: colors,
      ),
    );
  }
}

class CodeBlock extends StatefulWidget {
  const CodeBlock({
    required this.code,
    required this.language,
    required this.colors,
  });

  final String code;
  final String language;
  final WeuraColors colors;

  @override
  State<CodeBlock> createState() => CodeBlockState();
}

class CodeBlockState extends State<CodeBlock> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.code));
    if (!mounted) return;
    setState(() => _copied = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  Map<String, TextStyle> _theme() {
    final base = Map<String, TextStyle>.from(atomOneDarkTheme);
    base['root'] = const TextStyle(
      backgroundColor: Colors.transparent,
      color: Color(0xFFE6E6E6),
    );
    return base;
  }

  String _normalizeLanguage(String raw) {
    final l = raw.toLowerCase().trim();
    if (l.isEmpty) return 'plaintext';
    if (l == 'js') return 'javascript';
    if (l == 'ts') return 'typescript';
    if (l == 'py') return 'python';
    if (l == 'rb') return 'ruby';
    if (l == 'sh' || l == 'shell') return 'bash';
    if (l == 'yml') return 'yaml';
    if (l == 'html') return 'xml';
    if (l == 'c++') return 'cpp';
    if (l == 'c#') return 'cs';
    return l;
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final displayLang =
        widget.language.isEmpty ? 'code' : widget.language;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0B12),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 11, 10, 11),
            decoration: BoxDecoration(
              color: const Color(0xFF0F1119),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(15),
                topRight: Radius.circular(15),
              ),
              border: Border(
                bottom: BorderSide(color: colors.border),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.accentGlow,
                    boxShadow: [
                      BoxShadow(
                        color: colors.accentGlow
                            .withValues(alpha: 0.6),
                        blurRadius: 9,
                        spreadRadius: 1.5,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  displayLang,
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                  ),
                ),
                const Spacer(),
                InkWell(
                  onTap: _copy,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _copied
                              ? Icons.check_rounded
                              : Icons.copy_rounded,
                          size: 15,
                          color: _copied
                              ? colors.accentGlow
                              : colors.textMuted,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _copied ? 'Copied' : 'Copy',
                          style: TextStyle(
                            color: _copied
                                ? colors.accentGlow
                                : colors.textMuted,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(15),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: HighlightView(
                widget.code,
                language: _normalizeLanguage(widget.language),
                theme: _theme(),
                padding: EdgeInsets.zero,
                textStyle: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 14,
                  height: 1.65,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
