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
    return {'role': role, 'content': content};
  }
}

class GrokResponse {
  final String content;
  final String? model;
  final String? provider;
  final String? requestId;
  final bool searchUsed;
  final bool memoryUsed;
  final bool football;
  final bool tech;
  final int resultCount;

  const GrokResponse({
    required this.content,
    this.model,
    this.provider,
    this.requestId,
    this.searchUsed = false,
    this.memoryUsed = false,
    this.football = false,
    this.tech = false,
    this.resultCount = 0,
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

  /// Sends a chat request to the WEURA server.
  ///
  /// [messages]   — user/assistant conversation history.
  ///                NEVER include system messages here (server builds them).
  /// [memory]     — relevant memory string built by MemoryManager.
  /// [mode]       — AI mode name (auto/smart/fast/code/...).
  /// [language]   — ISO code (ar/en), optional.
  Future<GrokResponse> sendMessage({
    required List<GrokMessage> messages,
    String? memory,
    String? mode,
    String? language,
  }) async {
    if (messages.isEmpty) {
      throw const GrokException('No messages were provided.');
    }

    final uri = Uri.parse('$baseUrl/api/chat');

    final body = <String, dynamic>{
      'messages': messages.map((m) => m.toJson()).toList(),
    };

    if (memory != null && memory.trim().isNotEmpty) {
      body['memory'] = memory.trim();
    }

    if (mode != null && mode.trim().isNotEmpty) {
      body['mode'] = mode.trim();
    }

    if (language != null && language.trim().isNotEmpty) {
      body['language'] = language.trim();
    }

    try {
      final response = await _client
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 90));

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
      throw const GrokException('Invalid WEURA server address.');
    } on GrokException {
      rethrow;
    } catch (error) {
      throw GrokException('Unexpected connection error: $error');
    }
  }

  Future<bool> checkConnection() async {
    try {
      final uri = Uri.parse('$baseUrl/health');
      final response = await _client
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 8));
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  GrokResponse _parseResponse(http.Response response) {
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

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final serverError = data['error']?.toString().trim();
      if (serverError != null && serverError.isNotEmpty) {
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
      throw const GrokException('The AI returned an empty response.');
    }

    return GrokResponse(
      content: content,
      model: data['model']?.toString(),
      provider: data['provider']?.toString(),
      requestId: data['requestId']?.toString() ??
          response.headers['x-weura-request-id'],
      searchUsed: data['searchUsed'] == true,
      memoryUsed: data['memoryUsed'] == true,
      football: data['football'] == true,
      tech: data['tech'] == true,
      resultCount: (data['resultCount'] is int)
          ? data['resultCount'] as int
          : 0,
    );
  }

  static String _normalizeBaseUrl(String value) {
    var result = value.trim();
    while (result.endsWith('/')) {
      result = result.substring(0, result.length - 1);
    }
    if (result.isEmpty) {
      throw const FormatException('WEURA server URL is empty.');
    }
    if (!result.startsWith('http://') && !result.startsWith('https://')) {
      throw const FormatException(
        'WEURA server URL must start with http:// or https://',
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
      case 413:
        return 'The request is too large.';
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
  const GrokException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}