import 'dart:convert';
import 'package:http/http.dart' as http;

class SunshadeLinksException implements Exception {
  final String message;
  final dynamic cause;

  const SunshadeLinksException(this.message, [this.cause]);

  @override
  String toString() =>
      cause != null ? 'SunshadeLinksException: $message ($cause)' : 'SunshadeLinksException: $message';
}

class SunshadeLinksClient {
  final String baseUrl;
  final String? apiKey;
  final http.Client _client;

  SunshadeLinksClient({
    this.baseUrl = 'https://links.sunshade.icu',
    this.apiKey,
    http.Client? httpClient,
  }) : _client = httpClient ?? http.Client();

  /// Shortens [destination] for a specific [channel] and optional vanity [slug].
  ///
  /// If the network request fails, or the device is offline, gracefully
  /// falls back to returning the original [destination] URL without crashing.
  Future<String> createShortLink({
    required String destination,
    required String channel,
    String? slug,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/api/v1/links');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        if (apiKey != null) 'Authorization': 'Bearer $apiKey',
      };

      final body = jsonEncode({
        'destination': destination,
        'channel': channel,
        if (slug != null && slug.isNotEmpty) 'slug': slug,
      });

      final response = await _client.post(uri, headers: headers, body: body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        if (data.containsKey('shortUrl') && data['shortUrl'] is String) {
          return data['shortUrl'] as String;
        }
        if (data.containsKey('slug') && data['slug'] is String) {
          final returnedSlug = data['slug'] as String;
          return channel.isNotEmpty && channel != 'direct'
              ? '$baseUrl/$returnedSlug/$channel'
              : '$baseUrl/$returnedSlug';
        }
      }

      // Non-2xx response: graceful fallback
      return destination;
    } catch (_) {
      // Offline / SocketException / Timeout: gracefully fallback to destination
      return destination;
    }
  }

  /// Checks the Horizon Trust Network (HTN) score (0-100) for a given URL.
  ///
  /// If offline or server error, falls back to neutral baseline score (50).
  Future<int> checkTrustScore(String url) async {
    try {
      final uri = Uri.parse('$baseUrl/api/v1/trust/check').replace(
        queryParameters: {'url': url},
      );
      final headers = <String, String>{
        'Content-Type': 'application/json',
        if (apiKey != null) 'Authorization': 'Bearer $apiKey',
      };

      final response = await _client.get(uri, headers: headers);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        if (data.containsKey('trustScore') && data['trustScore'] is num) {
          return (data['trustScore'] as num).toInt();
        }
        if (data.containsKey('score') && data['score'] is num) {
          return (data['score'] as num).toInt();
        }
      }

      return 50; // Neutral fallback
    } catch (_) {
      return 50; // Offline fallback
    }
  }

  void close() {
    _client.close();
  }
}
