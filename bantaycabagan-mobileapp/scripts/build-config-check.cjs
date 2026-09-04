const assert = require('node:assert/strict');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const easConfig = require(resolve(projectRoot, 'eas.json'));
const resolveAppConfig = require(resolve(projectRoot, 'app.config.js'));

const previewEnvironment = easConfig.build.preview.env;

assert.equal(easConfig.build.preview.android.buildType, 'apk');
assert.equal(previewEnvironment.ANDROID_BUILD_ARCHS, 'arm64-v8a');

const originalEnvironment = {
  ALLOW_CLEARTEXT_TRAFFIC: process.env.ALLOW_CLEARTEXT_TRAFFIC,
  ANDROID_BUILD_ARCHS: process.env.ANDROID_BUILD_ARCHS,
};

Object.assign(process.env, previewEnvironment);

const previewConfig = resolveAppConfig({ config: { plugins: [] } });
const buildProperties = previewConfig.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
)[1].android;

assert.deepEqual(buildProperties.buildArchs, ['arm64-v8a']);
assert.equal(buildProperties.usesCleartextTraffic, true);

for (const [name, value] of Object.entries(originalEnvironment)) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const defaultConfig = resolveAppConfig({ config: { plugins: [] } });
const defaultBuildProperties = defaultConfig.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
)[1].android;

assert.equal(defaultBuildProperties.buildArchs, undefined);

console.log(
  'Android build configuration checks passed: preview APK is arm64-only; default builds retain full architecture support.',
);
