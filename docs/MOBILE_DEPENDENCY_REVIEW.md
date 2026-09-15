# Mobile dependency review — 2026-09-15

The review began with 14 affected dependency entries (6 high, 8 moderate).
Compatible dependency updates and Metro 0.84.5 reduce this to **7 moderate entries,
0 high, 0 critical**, representing **one unique upstream advisory**.
Counts are npm's dependency-tree entries, not seven distinct vulnerabilities.

## Changes

- Lockfile updates include fixed xmldom 0.8.15/0.9.12, Browserslist 4.28.9 and
  baseline-browser-mapping 2.11.23, plus compatible React Navigation updates.
- Pin `metro`, `metro-config`, and `metro-transform-worker` to 0.84.5. Expo already
  resolves this patch; React Native's exact 0.84.4 dependency otherwise retains
  vulnerable image-size 1.2.1. Metro 0.84.5 uses its own image dimension parser and
  removes that dependency. Do not force image-size v2 into Metro's v1 API.
- Update Expo and its native modules to the recommended patches within SDK 57.
  Expo is 57.0.22; no SDK major migration. Add the image/sqlite plugins requested
  by the Expo installer to the static configuration consumed by app.config.js.
- Retain the existing xcode/uuid override and existing asset security check.

Sources: [xmldom advisory](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv),
[Browserslist advisory](https://github.com/advisories/GHSA-c83g-rgw3-j3cx),
[image-size advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr).
Exact installed versions are recorded in the committed mobile package-lock.json.

## Remaining tracked exposure

`@react-navigation/* → query-string → decode-uri-component@0.2.2` is affected by
[GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr): excessive
processing of malformed percent-encoded input. npm reports no available fix at
the time of this review.

GeoSentri's NavigationContainer currently has no linking configuration, and the
app does not turn external URLs into navigation state. That lowers exposure to
the affected parsing path, but it does not remove the vulnerable package. Do not
describe this release as having zero vulnerabilities. Reassess before introducing
deep links, URL-based navigation, or direct query-string/URI-decoder usage.

The temporary tracking exception in `dependency-audit-policy.json` expires on
**2026-10-15 UTC**. The maintainer should review weekly and before release. This
repository policy is not an organizational risk sign-off. New advisory URLs,
changed severity, expired exceptions, audit network failures, and changes to the
NavigationContainer setup fail `npm run audit:dependencies`. Raw `npm audit`
continues to exit nonzero while the upstream vulnerability remains.

The new GitHub workflow runs on relevant pull requests, on Mondays, and manually;
it saves a dated JSON report with lockfile SHA-256 as an artifact. It becomes active
after these changes are committed/pushed to GitHub. Local reports are written to
the ignored `bantaycabagan-mobileapp/security-reports/` folder.

## Release checks

Completed locally on 2026-09-15: `npm run check` passed (25 suites, 110 tests,
typecheck and all mobile validation scripts); `npx expo install --check` reported
dependencies up to date; the dependency policy check passed with the one tracked
moderate advisory; Android Metro export passed (1,787 modules, 40 assets).
No APK was built/installed and no device smoke test was performed in this change.

Run `npm ci`, `npm run check`, `npx expo install --check`, and
`npm run audit:dependencies` from the mobile directory. Export an Android bundle
to check the actual Metro asset/bundle path. Build and smoke-test a new APK before
release because this change includes native Expo patch updates; the existing
installed APK is not updated by changing the lockfile. Verify login, navigation,
notifications, SQLite offline reports, camera/gallery evidence, and maps on a
real device. JavaScript tests/bundle export do not replace the device smoke test.
