import 'package:test/test.dart';
import 'package:sunshade_links_dart/sunshade_links_dart.dart';

void main() {
  group('SunshadeDeepLinkParser', () {
    test('parses PatchWork node link', () {
      final link = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/pw/node-4819');
      expect(link, isA<PatchworkNodeDeepLink>());
      expect((link as PatchworkNodeDeepLink).nodeId, equals('node-4819'));
    });

    test('parses staging host PatchWork node link', () {
      final link = SunshadeDeepLinkParser.parse('https://links-stag.sunshade.icu/pw/node-999');
      expect(link, isA<PatchworkNodeDeepLink>());
      expect((link as PatchworkNodeDeepLink).nodeId, equals('node-999'));
    });

    test('parses app route deep link', () {
      final link = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/app/makerverse/canvas');
      expect(link, isA<AppRouteDeepLink>());
      expect((link as AppRouteDeepLink).route, equals('makerverse/canvas'));
    });

    test('parses generic short link with channel', () {
      final link = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/launch/bsky');
      expect(link, isA<GenericShortLink>());
      final generic = link as GenericShortLink;
      expect(generic.slug, equals('launch'));
      expect(generic.channel, equals('bsky'));
    });

    test('parses generic short link without channel', () {
      final link = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/civic-summit');
      expect(link, isA<GenericShortLink>());
      final generic = link as GenericShortLink;
      expect(generic.slug, equals('civic-summit'));
      expect(generic.channel, isNull);
    });

    test('returns UnrecognizedDeepLink for foreign hosts', () {
      final link = SunshadeDeepLinkParser.parse('https://example.com/pw/node-123');
      expect(link, isA<UnrecognizedDeepLink>());
    });

    test('returns UnrecognizedDeepLink for empty paths', () {
      final link = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/');
      expect(link, isA<UnrecognizedDeepLink>());
    });
  });
}
