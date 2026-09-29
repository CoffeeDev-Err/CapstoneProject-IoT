import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { openReportPayload, sealReportPayload } from './offlineQueueCipher';
import type { DeploymentAssignment, OperationalTask, PoliceReport } from '../types/operations';

const DATABASE_NAME = 'geosentri-offline.db';
const MAX_CACHED_RECORDS = 200;

type CacheRow = { payload_json: string; updated_at: string };
export type CachedSnapshot<T> = { data: T; updatedAt: string };
export type CachedOperations = {
  deployments: DeploymentAssignment[];
  upcomingDeployment: DeploymentAssignment | null;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;
const writeChains = new Map<string, Promise<void>>();

const getDatabase = async () => {
  if (Platform.OS === 'web') return null;
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS operational_cache (
          personnel_id TEXT NOT NULL,
          cache_key TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (personnel_id, cache_key)
        );
      `);
      return database;
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};

const readSnapshot = async <T>(personnelId: string, cacheKey: string): Promise<CachedSnapshot<T> | null> => {
  const database = await getDatabase();
  if (!database || !personnelId) return null;
  const row = await database.getFirstAsync<CacheRow>(
    `SELECT payload_json, updated_at FROM operational_cache
     WHERE personnel_id = ? AND cache_key = ? LIMIT 1`,
    personnelId,
    cacheKey,
  );
  if (!row) return null;
  const data = JSON.parse(await openReportPayload(row.payload_json)) as T;
  return { data, updatedAt: row.updated_at };
};

const serializeWrite = (key: string, operation: () => Promise<void>) => {
  const previous = writeChains.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  let tracked: Promise<void>;
  tracked = next.finally(() => {
    if (writeChains.get(key) === tracked) writeChains.delete(key);
  });
  writeChains.set(key, tracked);
  return tracked;
};

const writeSnapshot = async <T>(personnelId: string, cacheKey: string, data: T) => {
  if (!personnelId) return;
  const writeKey = `${personnelId}:${cacheKey}`;
  return serializeWrite(writeKey, async () => {
    const database = await getDatabase();
    if (!database) return;
    const updatedAt = new Date().toISOString();
    const payload = await sealReportPayload(JSON.stringify(data));
    await database.runAsync(
      `INSERT INTO operational_cache (personnel_id, cache_key, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(personnel_id, cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      personnelId,
      cacheKey,
      payload,
      updatedAt,
    );
  });
};

const mergeLatestById = <T extends { id: string }>(cached: T[], incoming: T[]) => {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [...incoming, ...cached.filter((item) => !incomingIds.has(item.id))]
    .slice(0, MAX_CACHED_RECORDS);
};

export const loadCachedOperations = (personnelId: string) => (
  readSnapshot<CachedOperations>(personnelId, 'operations')
);

export const saveCachedOperations = (
  personnelId: string,
  data: CachedOperations,
) => writeSnapshot(personnelId, 'operations', data);

export const loadCachedTasks = (personnelId: string) => (
  readSnapshot<OperationalTask[]>(personnelId, 'tasks')
);

export const saveCachedTasks = async (personnelId: string, tasks: OperationalTask[]) => {
  const cached = await loadCachedTasks(personnelId).catch(() => null);
  return writeSnapshot(personnelId, 'tasks', mergeLatestById(cached?.data || [], tasks));
};

export const loadCachedReports = (personnelId: string) => (
  readSnapshot<PoliceReport[]>(personnelId, 'reports')
);

export const saveCachedReports = async (personnelId: string, reports: PoliceReport[]) => {
  const cached = await loadCachedReports(personnelId).catch(() => null);
  return writeSnapshot(personnelId, 'reports', mergeLatestById(cached?.data || [], reports));
};

export const clearCachedOperationalData = async () => {
  const database = await getDatabase();
  if (database) await database.runAsync('DELETE FROM operational_cache');
};
