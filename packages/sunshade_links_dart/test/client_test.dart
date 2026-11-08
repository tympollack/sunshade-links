import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';
import 'package:sunshade_links_dart/sunshade_links_dart.dart';

void main() {
  group('SunshadeLinksClient', () {
    test('creates shortlink successfully when API returns 200', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/v1/links'));
        final payload = jsonDecode(request.body);
        expect(payload['destination'], equals('https://sunshade.icu/civic'));
        expect(payload['channel'], equals('bsky'));

        return http.Response(
          jsonEncode({
            'shortUrl': 'https://links.sunshade.icu/civic/bsky',
            'slug': 'civic',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = SunshadeLinksClient(
        baseUrl: 'https://links.sunshade.icu',
        httpClient: mockClient,
      );

      final result = await client.createShortLink(
        destination: 'https://sunshade.icu/civic',
        channel: 'bsky',
      );

      expect(result, equals('https://links.sunshade.icu/civic/bsky'));
    });

    test('creates shortlink with nested data payload and auto-generated slug', () async {
      final mockClient = MockClient((request) async {
        final payload = jsonDecode(request.body);
        expect(payload['destination_url'], equals('https://example.com/target'));
        expect(payload['channel_tag'], equals('mastodon'));
        expect(payload['slug'], isNotEmpty);

        return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'id': 'lnk_123',
              'slug': payload['slug'],
              'destination_url': 'https://example.com/target',
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = SunshadeLinksClient(
        baseUrl: 'https://links.sunshade.icu',
        httpClient: mockClient,
      );

      final result = await client.createShortLink(
        destination: 'https://example.com/target',
        channel: 'mastodon',
      );

      expect(result, startsWith('https://links.sunshade.icu/'));
      expect(result, endsWith('/mastodon'));
    });

    test('gracefully falls back to raw URL on server error (500)', () async {
      final mockClient = MockClient((request) async {
        return http.Response('Internal Server Error', 500);
      });

      final client = SunshadeLinksClient(
        baseUrl: 'https://links.sunshade.icu',
        httpClient: mockClient,
      );

      const rawUrl = 'https://sunshade.icu/critical-fallback';
      final result = await client.createShortLink(
        destination: rawUrl,
        channel: 'direct',
      );

      expect(result, equals(rawUrl));
    });

    test('gracefully falls back to raw URL on network exception (offline)', () async {
      final mockClient = MockClient((request) async {
        throw http.ClientException('Network unreachable / offline');
      });

      final client = SunshadeLinksClient(
        baseUrl: 'https://links.sunshade.icu',
        httpClient: mockClient,
      );

      const rawUrl = 'https://sunshade.icu/offline-safe';
      final result = await client.createShortLink(
        destination: rawUrl,
        channel: 'flypack_offline',
      );

      expect(result, equals(rawUrl));
    });

    test('checks trust score successfully', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/v1/trust/check'));
        expect(request.url.queryParameters['url'], equals('https://sunshade.icu'));

        return http.Response(
          jsonEncode({'trustScore': 94}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = SunshadeLinksClient(httpClient: mockClient);
      final score = await client.checkTrustScore('https://sunshade.icu');
      expect(score, equals(94));
    });

    test('falls back to 50 on trust score check error or offline', () async {
      final mockClient = MockClient((request) async {
        return http.Response('Service Unavailable', 503);
      });

      final client = SunshadeLinksClient(httpClient: mockClient);
      final score = await client.checkTrustScore('https://unreachable.org');
      expect(score, equals(50));
    });

    test('does not close injected http client when close() is called', () async {
      var clientWasClosed = false;
      final mockClient = MockClient((request) async {
        return http.Response('{}', 200);
      });

      // Wrap in custom client to monitor close
      final trackingClient = _TrackingClient(mockClient, () {
        clientWasClosed = true;
      });

      final client = SunshadeLinksClient(httpClient: trackingClient);
      client.close();

      expect(clientWasClosed, isFalse);
    });

    test('closes internally created http client when close() is called', () {
      final client = SunshadeLinksClient();
      expect(() => client.close(), returnsNormally);
    });
  });
}

class _TrackingClient extends http.BaseClient {
  final http.Client _inner;
  final void Function() _onClose;

  _TrackingClient(this._inner, this._onClose);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _inner.send(request);
  }

  @override
  void close() {
    _onClose();
    _inner.close();
  }
}
