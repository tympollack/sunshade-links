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
  ///
  /// Enforces:
  /// - Trusted schemes only (`https` or `http`)
  /// - Verified SunShade linking hostnames (non-empty)
  /// - Strict path segment validation:
  ///   * `/pw/:nodeId`: exactly 2 segments
  ///   * `/app/:route*`: 2 or more segments
  ///   * `/:slug` or `/:slug/:channel`: 1 or 2 segments
  static SunshadeDeepLink parse(dynamic input) {
    final Uri uri = input is Uri ? input : Uri.parse(input.toString());

    // Enforce trusted schemes (reject ftp, file, javascript, custom schemas)
    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'https' && scheme != 'http') {
      return UnrecognizedDeepLink(rawUri: uri);
    }

    // Require non-empty valid host
    final host = uri.host.toLowerCase();
    if (host.isEmpty || !validHosts.contains(host)) {
      return UnrecognizedDeepLink(rawUri: uri);
    }

    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segments.isEmpty) {
      return UnrecognizedDeepLink(rawUri: uri);
    }

    final prefix = segments[0].toLowerCase();

    // Pattern 1: links.sunshade.icu/pw/:nodeId (strictly exactly 2 segments)
    if (prefix == 'pw') {
      if (segments.length == 2) {
        return PatchworkNodeDeepLink(nodeId: segments[1]);
      }
      return UnrecognizedDeepLink(rawUri: uri);
    }

    // Pattern 2: links.sunshade.icu/app/:route* (2 or more segments)
    if (prefix == 'app') {
      if (segments.length >= 2) {
        final remainingRoute = segments.sublist(1).join('/');
        return AppRouteDeepLink(route: remainingRoute);
      }
      return UnrecognizedDeepLink(rawUri: uri);
    }

    // Pattern 3: links.sunshade.icu/:slug or links.sunshade.icu/:slug/:channel (strictly 1 or 2 segments)
    if (segments.length == 1) {
      return GenericShortLink(slug: segments[0]);
    } else if (segments.length == 2) {
      return GenericShortLink(slug: segments[0], channel: segments[1]);
    } else {
      // 3 or more segments on a generic link is malformed
      return UnrecognizedDeepLink(rawUri: uri);
    }
  }
}
