# sunshade-links

SunShade universal link engine: tracked, verifiable links, algorithmic trust scoring, and telemetry across the SunShade ecosystem (`links.sunshade.icu`).

## Architecture

This repository is organized as an npm workspace monorepo:

- **`apps/links-dashboard`**: High-density link channel management dashboard, mobile viewport containment shell, and zero-dependency telemetry sparklines built with Next.js 16, React 19, and Tailwind CSS.
- **`packages/sunshade_links_dart`**: Pure Dart / Flutter client library and universal deep link parser (`links.sunshade.icu/pw/:nodeId`, `links.sunshade.icu/app/:route`) for mobile ecosystem apps (`patchwork`, `war_second_wind`).
- **Ecosystem Client Library**: [`@digitalcanopy/links`](https://www.npmjs.com/package/@digitalcanopy/links) on npm for React/TypeScript ecosystem apps (`cozy`, `makerverse`, `patchwork`).

## Workspaces & Commands

```bash
# Install dependencies
npm install

# TypeScript type check (all packages and apps)
npm run typecheck

# Unit tests (Vitest)
npm test

# Run development server for links dashboard
npm run dev
```

## Dart Package (`packages/sunshade_links_dart`)

```bash
cd packages/sunshade_links_dart
dart pub get
dart test
```
