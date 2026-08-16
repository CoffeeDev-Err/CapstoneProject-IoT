import { OfflineManager } from '@maplibre/maplibre-react-native';

const MAXIMUM_AMBIENT_CACHE_BYTES = 32 * 1024 * 1024;

export const configureMapCache = () => (
  OfflineManager.setMaximumAmbientCacheSize(MAXIMUM_AMBIENT_CACHE_BYTES)
);

export const clearMapCache = () => OfflineManager.clearAmbientCache();
