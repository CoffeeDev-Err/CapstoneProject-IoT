# Mobile dependency review — 2026-09-30

The mobile dependency audit now reports **0 vulnerabilities** and requires no
policy exceptions. The repository-wide npm audit also reports **0 vulnerabilities**,
including development tooling.

## Changes

- Updated Expo SDK 57 packages to their recommended compatible patch releases:
  `expo` 57.0.26, `@expo/metro-runtime` 57.0.16,
  `expo-build-properties` 57.0.22, `expo-constants` 57.0.20,
  `expo-image-picker` 57.0.20, and `expo-notifications` 57.0.21.
- Updated the React Navigation dependency tree to remove the vulnerable
  `query-string` and `decode-uri-component` path.
- Updated affected `brace-expansion` dependency copies to fixed releases.
- Removed the temporary URL-decoding audit exception. The policy now rejects
  every reported advisory without exceptions.
- Updated backend runtime dependencies and pinned fixed transitive releases for
  `engine.io` and the relevant `brace-expansion` dependency path.

Exact resolved versions are recorded in the root and mobile `package-lock.json`
files.

## Verification

Completed locally on 2026-09-30:

- Root `npm audit`: 0 vulnerabilities.
- Mobile `npm audit` and `npm run audit:dependencies`: 0 vulnerabilities and
  policy passed with no exceptions.
- `npx expo install --check`: dependencies are up to date.
- Mobile full check: 29 suites and 124 tests passed, including type checking,
  build configuration, security, authentication, map, storage, and UI checks.
- Android Metro export: passed with 1,788 modules and 40 assets.
- Backend full check: 153 tests plus lint, validation, deployment, and security
  checks passed.
- Web full check: 99 tests plus lint, validation, authentication, workflow,
  analytics, map, evidence, theme, typography, and production build passed.

The APK version 47 installed before this review does not contain these dependency
updates. Build and smoke-test a fresh APK before the final defense release. An EAS
build is not required for the local verification above.

## Release checks

From the mobile directory, run `npm ci`, `npm run check`,
`npx expo install --check`, and `npm run audit:dependencies`. Build and test the
APK on a real device, covering login, navigation, notifications, offline reports,
camera/gallery evidence, and maps. JavaScript tests and the Metro export verify the
code path but do not replace a device smoke test.
