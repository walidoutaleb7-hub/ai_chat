import 'dart:convert';

import 'package:http/http.dart' as http;

class SearchResult {
  const SearchResult({
    required this.title,
    required this.url,
    required this.domain,
    this.snippet = '',
  });

  final String title;
  final String url;
  final String domain;
  final String snippet;

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    final url = json['url']?.toString() ?? '';

    return SearchResult(
      title: json['title']?.toString() ?? 'Untitled',
      url: url,
      domain: _extractDomain(url),
      snippet: json['snippet']?.toString() ?? '',
    );
  }

  static String _extractDomain(String url) {
    try {
      return Uri.parse(url).host;
    } catch (_) {
      return '';
    }
  }
}

class SearchResponse {
  const SearchResponse({
    required this.query,
    required this.results,
  });

  final String query;
  final List<SearchResult> results;
}

class SearchService {
  SearchService({
    required this.baseUrl,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Future<SearchResponse> search(
    String query, {
    int limit = 10,
  }) async {
    final cleanQuery = query.trim();

    if (cleanQuery.isEmpty) {
      throw Exception('Search query cannot be empty.');
    }

    final uri = Uri.parse(
      '$baseUrl/api/search',
    ).replace(
      queryParameters: {
        'q': cleanQuery,
        'limit': limit.clamp(1, 20).toString(),
      },
    );

    try {
      final response = await _client
          .get(
            uri,
            headers: const {
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 30));

      Map<String, dynamic> data;

      try {
        data = jsonDecode(response.body)
            as Map<String, dynamic>;
      } catch (_) {
        throw Exception(
          'Search server returned invalid data.',
        );
      }

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Search request failed.',
        );
      }

      if (data['success'] != true) {
        throw Exception(
          data['error']?.toString() ??
              'Search provider is unavailable.',
        );
      }

      final rawResults = data['results'];

      if (rawResults is! List) {
        return SearchResponse(
          query: cleanQuery,
          results: const [],
        );
      }

      final results = rawResults
          .whereType<Map>()
          .map(
            (item) => SearchResult.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .where((result) => result.url.isNotEmpty)
          .toList();

      return SearchResponse(
        query: cleanQuery,
        results: results,
      );
    } on http.ClientException {
      throw Exception(
        'Network error while searching.',
      );
    } on FormatException {
      throw Exception(
        'Invalid WEURA search server address.',
      );
    }
  }

  void dispose() {
    _client.close();
  }
}