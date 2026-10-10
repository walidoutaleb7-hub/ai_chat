import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../../core/Theme/weura_theme.dart';

/// Inline image fetched from the server's /api/image/search endpoint.
/// The AI requests images via [[IMG: query]] markup.
class InlineImage extends StatefulWidget {
  const InlineImage({
    super.key,
    required this.query,
    required this.serverUrl,
    required this.colors,
    this.onTap,
  });

  final String query;
  final String serverUrl;
  final WeuraColors colors;
  final void Function(String url, String photographer)? onTap;

  @override
  State<InlineImage> createState() => _InlineImageState();
}

class _InlineImageState extends State<InlineImage> {
  String? _url;
  String? _photographer;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final resp = await http
          .post(
            Uri.parse('${widget.serverUrl}/api/image/search'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'query': widget.query, 'count': 1}),
          )
          .timeout(const Duration(seconds: 20));

      if (!mounted) return;

      if (resp.statusCode != 200) {
        setState(() {
          _loading = false;
          _error = true;
        });
        return;
      }

      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final results = (data['results'] as List?) ?? [];

      if (results.isEmpty) {
        setState(() {
          _loading = false;
          _error = true;
        });
        return;
      }

      final first = (results.first as Map).cast<String, dynamic>();
      final url = (first['preview'] ?? first['thumbnail'] ?? '').toString();
      final photographer = (first['photographer'] ?? '').toString();

      if (url.isEmpty) {
        setState(() {
          _loading = false;
          _error = true;
        });
        return;
      }

      setState(() {
        _url = url;
        _photographer = photographer;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 10),
        height: 200,
        decoration: BoxDecoration(
          color: widget.colors.surfaceAlt,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: widget.colors.border),
        ),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: widget.colors.accentGlow,
            ),
          ),
        ),
      );
    }

    if (_error || _url == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => widget.onTap?.call(_url!, _photographer ?? ''),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(
                    color: widget.colors.accentGlow
                        .withValues(alpha: 0.20),
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Image.network(
                  _url!,
                  fit: BoxFit.cover,
                  loadingBuilder: (_, child, progress) {
                    if (progress == null) return child;
                    return Container(
                      height: 200,
                      color: widget.colors.surfaceAlt,
                    );
                  },
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ),
          ),
          if (_photographer != null && _photographer!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 5, left: 6),
              child: Text(
                '📷 $_photographer  •  Pexels',
                style: TextStyle(
                  color: widget.colors.textFaint,
                  fontSize: 10.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
