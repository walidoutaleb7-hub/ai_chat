import 'dart:convert';
import 'package:http/http.dart' as http;

class GrokMessage {
  final String role;
  final String content;

  const GrokMessage({
    required this.role,
    required this.content,
  });

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
      };
}

class GrokResponse {
  final String content;
  final String? model;

  const GrokResponse({
    required this.content,
    this.model,
  });
}

class GrokService {
  GrokService({
    required this.baseUrl,
  });

  final String baseUrl;

  Future<GrokResponse> sendMessage({
    required List<GrokMessage> messages,
  }) async {
    final uri = Uri.parse('$baseUrl/api/chat');

    try {
      final response = await http
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'messages': messages.map((e) => e.toJson()).toList(),
            }),
          )
          .timeout(const Duration(seconds: 60));

      Map<String, dynamic> data;

      try {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('WEURA received an invalid server response.');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'WEURA could not connect to the AI server.',
        );
      }

      if (data['success'] != true) {
        throw Exception(
          data['error']?.toString() ??
              'Grok returned an unsuccessful response.',
        );
      }

      final content = data['content']?.toString();

      if (content == null || content.trim().isEmpty) {
        throw Exception('Grok returned an empty response.');
      }

      return GrokResponse(
        content: content,
        model: data['model']?.toString(),
      );
    } on http.ClientException {
      throw Exception('Network error. Check your connection.');
    } on FormatException {
      throw Exception('Invalid WEURA server address.');
    }
  }
}