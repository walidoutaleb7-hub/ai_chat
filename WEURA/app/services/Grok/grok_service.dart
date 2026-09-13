import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class GrokMessage {
  final String role;
  final String content;

  const GrokMessage({
    required this.role,
    required this.content,
  });

  Map<String, dynamic> toJson() {
    return {
      'role': role,
      'content': content,
    };
  }
}

class GrokResponse {
  final String content;
  final String? model;
  final String? requestId;

  const GrokResponse({
    required this.content,
    this.model,
    this.requestId,
  });
}

class GrokService {
  GrokService({
    required String baseUrl,
    http.Client? client,
  })  : baseUrl = _normalizeBaseUrl(baseUrl),
        _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Future<GrokResponse> sendMessage({
    required List<GrokMessage> messages,
  }) async {
    if (messages.isEmpty) {
      throw const GrokException(
        'No messages were provided.',
      );
    }

    final uri = Uri.parse('$baseUrl/api/chat');

    try {
      final response = await _client
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'messages': messages
                  .map((message) => message.toJson())
                  .toList(),
            }),
          )
          .timeout(
            const Duration(seconds: 75),
          );

      return _parseResponse(response);
    } on TimeoutException {
      throw const GrokException(
        'The AI server took too long to respond.',
      );
    } on http.ClientException catch (error) {
      throw GrokException(
        'Network connection failed: ${error.message}',
      );
    } on FormatException {
      throw const GrokException(
        'Invalid WEURA server address.',
      );
    } on GrokException {
      rethrow;
    } catch (error) {
      throw GrokException(
        'Unexpected connection error: $error',
      );
    }
  }

  Future<bool> checkConnection() async {
    try {
      final uri = Uri.parse('$baseUrl/health');

      final response = await _client
          .get(
            uri,
            headers: const {
              'Accept': 'application/json',
            },
          )
          .timeout(
            const Duration(seconds: 8),
          );

      return response.statusCode >= 200 &&
          response.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  GrokResponse _parseResponse(
    http.Response response,
  ) {
    Map<String, dynamic> data;

    try {
      final decoded = jsonDecode(response.body);

      if (decoded is! Map<String, dynamic>) {
        throw const FormatException();
      }

      data = decoded;
    } catch (_) {
      throw GrokException(
        'WEURA received an invalid server response '
        '(HTTP ${response.statusCode}).',
      );
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300) {
      final serverError =
          data['error']?.toString().trim();

      if (serverError != null &&
          serverError.isNotEmpty) {
        throw GrokException(
          serverError,
          statusCode: response.statusCode,
        );
      }

      throw GrokException(
        _statusMessage(response.statusCode),
        statusCode: response.statusCode,
      );
    }

    if (data['success'] != true) {
      throw GrokException(
        data['error']?.toString() ??
            'The AI server rejected the request.',
        statusCode: response.statusCode,
      );
    }

    final content = data['content']?.toString().trim();

    if (content == null || content.isEmpty) {
      throw const GrokException(
        'Grok returned an empty response.',
      );
    }

    return GrokResponse(
      content: content,
      model: data['model']?.toString(),
      requestId: data['requestId']?.toString() ??
          response.headers['x-weura-request-id'],
    );
  }

  static String _normalizeBaseUrl(String value) {
    var result = value.trim();

    while (result.endsWith('/')) {
      result = result.substring(
        0,
        result.length - 1,
      );
    }

    if (result.isEmpty) {
      throw const FormatException(
        'WEURA server URL is empty.',
      );
    }

    return result;
  }

  static String _statusMessage(int statusCode) {
    switch (statusCode) {
      case 400:
        return 'Invalid request sent to WEURA.';
      case 401:
        return 'The AI server rejected authentication.';
      case 403:
        return 'Access to the AI server was denied.';
      case 404:
        return 'WEURA chat endpoint was not found.';
      case 408:
        return 'The server request timed out.';
      case 429:
        return 'Too many requests. Please try again shortly.';
      case 500:
        return 'The WEURA server encountered an error.';
      case 502:
        return 'The AI provider is temporarily unavailable.';
      case 503:
        return 'The WEURA server is unavailable.';
      default:
        return 'Server error (HTTP $statusCode).';
    }
  }

  void dispose() {
    _client.close();
  }
}

class GrokException implements Exception {
  const GrokException(
    this.message, {
    this.statusCode,
  });

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}