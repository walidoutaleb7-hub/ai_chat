import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/Theme/weura_theme.dart';


class LatexBlock extends StatelessWidget {
  const LatexBlock({required this.latex, required this.colors});

  final String latex;
  final WeuraColors colors;

  String _clean(String raw) {
    var s = raw.trim();
    s = s.replaceAll(r'\[', '').replaceAll(r'\]', '');
    s = s.replaceAll(r'\(', '').replaceAll(r'\)', '');
    if (s.startsWith(r'$$') && s.endsWith(r'$$')) {
      s = s.substring(2, s.length - 2);
    } else if (s.startsWith(r'$') && s.endsWith(r'$')) {
      s = s.substring(1, s.length - 1);
    }
    return s.trim();
  }

  @override
  Widget build(BuildContext context) {
    final cleaned = _clean(latex);
    if (cleaned.isEmpty) return const SizedBox.shrink();

    final hexColor = '#${(colors.textPrimary.value & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
    final bgColor = '#${(colors.surface.value & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

    // Escape LaTeX for JS string.
    final escaped = cleaned
        .replaceAll(r'\\', r'\\\\')
        .replaceAll('`', r'\\`')
        .replaceAll(r'$', r'\\$');

    final html = """
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
 onload="renderMathInElement(document.body,{delimiters:[{left:'\\\\[',right:'\\\\]',display:true}],throwOnError:false})"></script>
<style>
  html,body{margin:0;padding:14px;background:$bgColor;color:$hexColor;
  font-size:19px;font-family:'Times New Roman',serif;text-align:center;
  overflow-x:auto;overflow-y:hidden;}
  .katex{color:$hexColor!important;font-size:1.1em;}
</style>
</head>
<body>\\\\[$escaped\\\\]</body>
</html>
""";

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: colors.accentGlow.withValues(alpha: 0.25)),
      ),
      child: SizedBox(
        height: 130,
        child: LatexWebView(html: html),
      ),
    );
  }
}

class LatexWebView extends StatefulWidget {
  const LatexWebView({required this.html});
  final String html;

  @override
  State<LatexWebView> createState() => LatexWebViewState();
}

class LatexWebViewState extends State<LatexWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..loadHtmlString(widget.html);
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}

/// Elegant card for creative writing (articles, stories, poetry).
/// Similar to ChatGPT's "Écriture" card.
/// Renders a chat bubble with avatar, like a conversation snapshot.
/// Used when user asks for "علبة حوار" or "dialogue box".
