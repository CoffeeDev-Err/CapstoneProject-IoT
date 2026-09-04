module.exports = ({ config }) => {
  const androidBuildArchs = (process.env.ANDROID_BUILD_ARCHS || '')
    .split(',')
    .map((arch) => arch.trim())
    .filter(Boolean);

  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: process.env.ALLOW_CLEARTEXT_TRAFFIC === 'true',
            ...(androidBuildArchs.length > 0 ? { buildArchs: androidBuildArchs } : {}),
          },
        },
      ],
    ],
  };
};
