import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { toByteArray } from 'base64-js';
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
export const SEALED_PAYLOAD_PREFIX = 'gsenc1:';

/**
 * Device-bound but readable after the first unlock, so a queued report can still
 * sync while the phone is locked in an officer's pocket.
 */
const KEY_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let storedKeyPromise: Promise<AESEncryptionKey | null> | null = null;
let keyCreationPromise: Promise<AESEncryptionKey> | null = null;

const readStoredEncryptionKey = () => {
  if (!storedKeyPromise) {
    storedKeyPromise = SecureStore.getItemAsync(KEY_STORE_NAME, KEY_STORE_OPTIONS)
      .then((stored) => (stored ? AESEncryptionKey.import(stored, 'base64') : null))
      .catch((error) => {
        storedKeyPromise = null;
        throw error;
      });
  }
  return storedKeyPromise;
};

const getExistingEncryptionKey = async () => {
  if (keyCreationPromise) return keyCreationPromise;
  const stored = await readStoredEncryptionKey();
  if (!stored) {
    throw new Error(
      'The encryption key for queued reports is unavailable. The saved reports were preserved for recovery.',
    );
  }
  return stored;
};

const getOrCreateEncryptionKey = async () => {
  const stored = await readStoredEncryptionKey();
  if (stored) return stored;
  if (!keyCreationPromise) {
    keyCreationPromise = (async () => {
      const generated = await AESEncryptionKey.generate(AESKeySize.AES256);
      await SecureStore.setItemAsync(
        KEY_STORE_NAME,
        await generated.encoded('base64'),
        KEY_STORE_OPTIONS,
      );
      storedKeyPromise = Promise.resolve(generated);
      return generated;
    })().finally(() => {
      keyCreationPromise = null;
    });
  }
  return keyCreationPromise;
};

export const isSealedPayload = (value: string) => value.startsWith(SEALED_PAYLOAD_PREFIX);

export const sealReportPayload = async (
  plaintext: string,
  { allowKeyCreation = true }: { allowKeyCreation?: boolean } = {},
) => {
  const key = allowKeyCreation
    ? await getOrCreateEncryptionKey()
    : await getExistingEncryptionKey();
  const sealed = await aesEncryptAsync(utf8ToBytes(plaintext), key);
  return `${SEALED_PAYLOAD_PREFIX}${await sealed.combined('base64')}`;
};

export const openReportPayload = async (stored: string) => {
  // Reports queued by an older build are still plain JSON and stay readable.
  if (!isSealedPayload(stored)) return stored;

  const key = await getExistingEncryptionKey();
  // Expo Crypto's Android bridge declares `fromCombined` as BinaryInput in
  // TypeScript, but the native implementation receives a ByteArray. Passing
  // the persisted Base64 string through directly therefore makes every
  // encrypted offline row unreadable on Android. Decode it explicitly before
  // crossing the native bridge.
  const combinedBytes = toByteArray(stored.slice(SEALED_PAYLOAD_PREFIX.length));
  const sealed = AESSealedData.fromCombined(combinedBytes);
  const plaintext = await aesDecryptAsync(sealed, key, { output: 'bytes' });
  return bytesToUtf8(plaintext);
};
