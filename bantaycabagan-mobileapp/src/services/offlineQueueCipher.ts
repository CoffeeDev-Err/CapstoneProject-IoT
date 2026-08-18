import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
// Imported with the explicit .js subpath: the package's exports map only
// publishes "./utils.js", and Metro enforces that map at runtime.
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';

/**
 * At-rest protection for the offline report queue.
 *
 * Staged report payloads carry incident narratives, victim details, and precise
 * coordinates, so they are sealed with AES-256-GCM before they reach SQLite.
 * The key itself never touches the database: it lives in the platform keystore
 * (Android Keystore / iOS Keychain) via expo-secure-store, so reading the app's
 * files off a rooted or imaged device does not reveal report contents.
 *
 * Evidence image files remain unencrypted on purpose — they are kept in
 * app-private storage, excluded from backups by `android.allowBackup: false`,
 * and deleted as soon as a submission is confirmed. Encrypting them would add a
 * decrypt step to the upload path, which is the one path that must not fail.
 */

const KEY_STORE_NAME = 'geosentri.offline-queue-key';

/**
 * Marks a column value as sealed. Rows written before this module existed hold
 * bare JSON, so the prefix is what distinguishes the two formats on read.
 */
const ENVELOPE_PREFIX = 'gsenc1:';

/**
 * Device-bound but readable after the first unlock, so a queued report can still
 * sync while the phone is locked in an officer's pocket.
 */
const KEY_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let keyPromise: Promise<AESEncryptionKey> | null = null;

const loadEncryptionKey = async () => {
  const stored = await SecureStore.getItemAsync(KEY_STORE_NAME, KEY_STORE_OPTIONS);
  if (stored) return AESEncryptionKey.import(stored, 'base64');

  const generated = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(
    KEY_STORE_NAME,
    await generated.encoded('base64'),
    KEY_STORE_OPTIONS,
  );
  return generated;
};

const getEncryptionKey = () => {
  if (!keyPromise) {
    keyPromise = loadEncryptionKey().catch((error) => {
      // Never cache a rejection; the next staging attempt should retry cleanly.
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
};

export const isSealedPayload = (value: string) => value.startsWith(ENVELOPE_PREFIX);

export const sealReportPayload = async (plaintext: string) => {
  const key = await getEncryptionKey();
  const sealed = await aesEncryptAsync(utf8ToBytes(plaintext), key);
  return `${ENVELOPE_PREFIX}${await sealed.combined('base64')}`;
};

export const openReportPayload = async (stored: string) => {
  // Reports queued by an older build are still plain JSON and stay readable.
  if (!isSealedPayload(stored)) return stored;

  const key = await getEncryptionKey();
  const sealed = AESSealedData.fromCombined(stored.slice(ENVELOPE_PREFIX.length));
  const plaintext = await aesDecryptAsync(sealed, key, { output: 'bytes' });
  return bytesToUtf8(plaintext);
};
