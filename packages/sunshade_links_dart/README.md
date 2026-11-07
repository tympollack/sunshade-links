# sunshade_links_dart

Pure Dart / Flutter linking client and universal deep link parser for SunShade ecosystem applications (`patchwork`, `war_second_wind`, etc.).

## Features

- **Shortlink Generation**: `createShortLink` with fallback to destination URL on offline or server outage.
- **Trust Score Queries**: Query Horizon Trust Network (HTN) score (0–100) with graceful fallback to neutral score (50).
- **Universal Link Parsing**: Parses incoming universal deep links:
  - `links.sunshade.icu/pw/:nodeId` -> `PatchworkNodeDeepLink`
  - `links.sunshade.icu/app/:route` -> `AppRouteDeepLink`
  - `links.sunshade.icu/:slug/:channel` -> `GenericShortLink`

## Usage

```dart
import 'package:sunshade_links_dart/sunshade_links_dart.dart';

final client = SunshadeLinksClient();

// Create shortlink
final shortUrl = await client.createShortLink(
  destination: 'https://sunshade.icu/civic',
  channel: 'bsky',
);

// Check Trust Score
final score = await client.checkTrustScore(shortUrl);

// Parse incoming universal link
final deepLink = SunshadeDeepLinkParser.parse('https://links.sunshade.icu/pw/node-123');
if (deepLink is PatchworkNodeDeepLink) {
  print('Navigate to PatchWork node: ${deepLink.nodeId}');
}
```
