sealed class SunshadeDeepLink {
  const SunshadeDeepLink();
}

class PatchworkNodeDeepLink extends SunshadeDeepLink {
  final String nodeId;
  const PatchworkNodeDeepLink({required this.nodeId});

  @override
  String toString() => 'PatchworkNodeDeepLink(nodeId: $nodeId)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PatchworkNodeDeepLink && other.nodeId == nodeId;

  @override
  int get hashCode => nodeId.hashCode;
}

class AppRouteDeepLink extends SunshadeDeepLink {
  final String route;
  const AppRouteDeepLink({required this.route});

  @override
  String toString() => 'AppRouteDeepLink(route: $route)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AppRouteDeepLink && other.route == route;

  @override
  int get hashCode => route.hashCode;
}

class GenericShortLink extends SunshadeDeepLink {
  final String slug;
  final String? channel;
  const GenericShortLink({required this.slug, this.channel});

  @override
  String toString() => 'GenericShortLink(slug: $slug, channel: $channel)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GenericShortLink &&
          other.slug == slug &&
          other.channel == channel;

  @override
  int get hashCode => Object.hash(slug, channel);
}

class UnrecognizedDeepLink extends SunshadeDeepLink {
  final Uri rawUri;
  const UnrecognizedDeepLink({required this.rawUri});

  @override
  String toString() => 'UnrecognizedDeepLink(rawUri: $rawUri)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UnrecognizedDeepLink && other.rawUri == rawUri;

  @override
  int get hashCode => rawUri.hashCode;
}

class SunshadeDeepLinkParser {
  static const Set<String> validHosts = {
    'links.sunshade.icu',
    'links-stag.sunshade.icu',
    'staging.links.sunshade.icu',
  };

  /// Parses an incoming universal link string or [Uri].
  static SunshadeDeepLink parse(dynamic input) {
    final Uri uri = input is Uri ? input : Uri.parse(input.toString());

    if (!validHosts.contains(uri.host.toLowerCase()) && uri.host.isNotEmpty) {
      return UnrecognizedDeepLink(rawUri: uri);
    }

    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segments.isEmpty) {
      return UnrecognizedDeepLink(rawUri: uri);
    }

    final prefix = segments[0].toLowerCase();

    // Pattern 1: links.sunshade.icu/pw/:nodeId
    if (prefix == 'pw') {
      if (segments.length >= 2) {
        return PatchworkNodeDeepLink(nodeId: segments[1]);
      }
      return UnrecognizedDeepLink(rawUri: uri);
    }

    // Pattern 2: links.sunshade.icu/app/:route*
    if (prefix == 'app') {
      if (segments.length >= 2) {
        final remainingRoute = segments.sublist(1).join('/');
        return AppRouteDeepLink(route: remainingRoute);
      }
      return UnrecognizedDeepLink(rawUri: uri);
    }

    // Pattern 3: links.sunshade.icu/:slug[/:channel]
    final slug = segments[0];
    final channel = segments.length > 1 ? segments[1] : null;
    return GenericShortLink(slug: slug, channel: channel);
  }
}
