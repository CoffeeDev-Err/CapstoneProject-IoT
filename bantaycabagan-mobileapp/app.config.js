module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: process.env.ALLOW_CLEARTEXT_TRAFFIC === 'true',
        },
      },
    ],
  ],
});
