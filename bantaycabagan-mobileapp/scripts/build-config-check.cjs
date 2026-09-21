const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const easConfig = require(resolve(projectRoot, 'eas.json'));
const appConfig = require(resolve(projectRoot, 'app.json')).expo;
const packageMetadata = require(resolve(projectRoot, 'package.json'));
const resolveAppConfig = require(resolve(projectRoot, 'app.config.js'));
const androidBuildGradlePath = resolve(projectRoot, 'android/app/build.gradle');

const previewEnvironment = easConfig.build.preview.env;

assert.equal(easConfig.build.preview.android.buildType, 'apk');
assert.equal(previewEnvironment.ANDROID_BUILD_ARCHS, undefined);
assert.equal(previewEnvironment.EXPO_PUBLIC_MAP_PREVIEW, 'true');
assert.equal(easConfig.build.production.env.EXPO_PUBLIC_MAP_PREVIEW, 'false');
assert.equal(appConfig.version, packageMetadata.version);
if (existsSync(androidBuildGradlePath)) {
  const androidBuildGradle = readFileSync(androidBuildGradlePath, 'utf8');
  assert.match(androidBuildGradle, new RegExp(`versionName\\s+"${appConfig.version.replaceAll('.', '\\.')}"`));
  assert.match(androidBuildGradle, new RegExp(`versionCode\\s+${appConfig.android.versionCode}\\b`));
}

const originalEnvironment = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  ALLOW_CLEARTEXT_TRAFFIC: process.env.ALLOW_CLEARTEXT_TRAFFIC,
  ANDROID_BUILD_ARCHS: process.env.ANDROID_BUILD_ARCHS,
  EXPO_PUBLIC_MAP_PREVIEW: process.env.EXPO_PUBLIC_MAP_PREVIEW,
};

const getAndroidProperties = () => resolveAppConfig({ config: { plugins: [] } }).plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
)[1].android;

try {
  for (const profileName of ['preview', 'production']) {
    const environment = easConfig.build[profileName].env;
    assert.equal(environment.EXPO_PUBLIC_API_URL, 'https://geosentri.com');
    assert.equal(environment.ALLOW_CLEARTEXT_TRAFFIC, 'false');
    for (const name of Object.keys(originalEnvironment)) delete process.env[name];
    Object.assign(process.env, environment);
    const properties = getAndroidProperties();
    assert.equal(properties.usesCleartextTraffic, false);
    assert.equal(properties.buildArchs, undefined);
  }

  // Default builds stay secure; local HTTP development requires explicit opt-in.
  for (const name of Object.keys(originalEnvironment)) delete process.env[name];
  assert.equal(getAndroidProperties().usesCleartextTraffic, false);
  assert.equal(getAndroidProperties().buildArchs, undefined);
  process.env.ALLOW_CLEARTEXT_TRAFFIC = 'true';
  assert.equal(getAndroidProperties().usesCleartextTraffic, true);
} finally {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

console.log(
  'Android build configuration checks passed: release profiles use HTTPS without cleartext and retain full Android architecture support.',
);
