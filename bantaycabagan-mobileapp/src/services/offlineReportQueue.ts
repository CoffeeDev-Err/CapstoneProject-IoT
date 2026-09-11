import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  SEALED_PAYLOAD_PREFIX,
  openReportPayload,
  sealReportPayload,
} from './offlineQueueCipher';
import type { ReportEvidenceInput, SubmitReportInput } from '../types/operations';

const DATABASE_NAME = 'geosentri-offline.db';
const EVIDENCE_DIRECTORY_NAME = 'pending-report-evidence';
const DRAFT_EVIDENCE_DIRECTORY_NAME = 'report-draft-evidence';
const PICKER_DIRECTORY_NAME = 'ImagePicker';
const PICKER_ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_EVIDENCE_BYTES = 100 * 1024 * 1024;

export type PendingReport = {
  id: string;
  personnelId: string;
  input: SubmitReportInput;
  evidenceUri: string | null;
  createdAt: string;
  attemptCount: number;
};

export type PendingReportReadFailure = {
  id: string;
  createdAt: string;
  message: string;
};

export type PendingReportQueueSnapshot = {
  reports: PendingReport[];
  failures: PendingReportReadFailure[];
};

export type StoredReportDraft = {
  form: SubmitReportInput;
  evidencePhoto: ReportEvidenceInput | null;
  updatedAt: string;
};

type PendingReportRow = {
  id: string;
  personnel_id: string;
  payload_json: string;
  evidence_uri: string | null;
  created_at: string;
  attempt_count: number;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;
let draftWriteChain: Promise<void> = Promise.resolve();

const createSubmissionId = () => (
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
);

const getDatabase = async () => {
  if (Platform.OS === 'web') return null;
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS pending_reports (
          id TEXT PRIMARY KEY NOT NULL,
          personnel_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          evidence_uri TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS pending_reports_personnel_status
          ON pending_reports(personnel_id, status, created_at);
        CREATE TABLE IF NOT EXISTS report_drafts (
          personnel_id TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          evidence_uri TEXT,
          updated_at TEXT NOT NULL
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

const evidenceDirectory = () => new Directory(Paths.document, EVIDENCE_DIRECTORY_NAME);
const draftEvidenceDirectory = () => new Directory(Paths.document, DRAFT_EVIDENCE_DIRECTORY_NAME);

const ensureDraftEvidenceDirectory = () => {
  const directory = draftEvidenceDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
};

const ensureEvidenceDirectory = () => {
  const directory = evidenceDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
};

const safelyDeleteFile = (uri?: string | null) => {
  if (!uri?.startsWith('file://')) return;
  const file = new File(uri);
  if (file.exists) file.delete();
};

export const discardTemporaryEvidence = async (uri?: string | null) => {
  if (!uri?.startsWith(new Directory(Paths.cache, PICKER_DIRECTORY_NAME).uri)) return;
  safelyDeleteFile(uri);
};

const serializeDraftWrite = <Result>(operation: () => Promise<Result>) => {
  const result = draftWriteChain.catch(() => undefined).then(operation);
  draftWriteChain = result.then(() => undefined, () => undefined);
  return result;
};

const readDraftPayload = async (payloadJson: string): Promise<StoredReportDraft> => {
  const parsed = JSON.parse(await openReportPayload(payloadJson)) as StoredReportDraft;
  if (!parsed || typeof parsed !== 'object' || !parsed.form || typeof parsed.form !== 'object') {
    throw new Error('The saved report draft could not be opened.');
  }
  return parsed;
};

export const loadReportDraft = async (
  personnelId: string,
): Promise<StoredReportDraft | null> => {
  const database = await getDatabase();
  if (!database || !personnelId) return null;
  const row = await database.getFirstAsync<{
    payload_json: string;
    evidence_uri: string | null;
    updated_at: string;
  }>(
    `SELECT payload_json, evidence_uri, updated_at
     FROM report_drafts WHERE personnel_id = ? LIMIT 1`,
    personnelId,
  );
  if (!row) return null;
  const draft = await readDraftPayload(row.payload_json);
  const evidenceUri = row.evidence_uri;
  const evidenceExists = evidenceUri ? new File(evidenceUri).exists : false;
  return {
    ...draft,
    evidencePhoto: evidenceExists && draft.evidencePhoto
      ? { ...draft.evidencePhoto, uri: evidenceUri! }
      : null,
    updatedAt: row.updated_at,
  };
};

export const saveReportDraft = async (
  personnelId: string,
  form: SubmitReportInput,
  evidencePhoto: ReportEvidenceInput | null,
): Promise<StoredReportDraft | null> => serializeDraftWrite(async () => {
  const database = await getDatabase();
  if (!database || !personnelId) return null;

  const existing = await database.getFirstAsync<{
    payload_json: string;
    evidence_uri: string | null;
  }>(
    `SELECT payload_json, evidence_uri FROM report_drafts WHERE personnel_id = ? LIMIT 1`,
    personnelId,
  );
  let durableEvidenceUri: string | null = null;
  let copiedEvidenceUri: string | null = null;

  if (evidencePhoto) {
    const incoming = new File(evidencePhoto.uri);
    if (!incoming.exists) {
      throw new Error('The captured evidence file is no longer available. Please retake the photo.');
    }
    const draftDirectory = ensureDraftEvidenceDirectory();
    if (evidencePhoto.uri.startsWith(draftDirectory.uri)) {
      durableEvidenceUri = evidencePhoto.uri;
    } else if (existing?.evidence_uri && new File(existing.evidence_uri).exists) {
      try {
        const previous = await readDraftPayload(existing.payload_json);
        if (previous.evidencePhoto?.captured_at === evidencePhoto.captured_at) {
          durableEvidenceUri = existing.evidence_uri;
        }
      } catch {
        // The fresh encrypted payload below replaces an unreadable draft row.
      }
    }
    if (!durableEvidenceUri) {
      const extension = incoming.extension || '.jpg';
      const destination = new File(
        draftDirectory,
        `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`,
      );
      await incoming.copy(destination, { overwrite: false });
      if (!destination.exists || destination.size <= 0) {
        safelyDeleteFile(destination.uri);
        throw new Error('The evidence photo could not be secured with the report draft.');
      }
      durableEvidenceUri = destination.uri;
      copiedEvidenceUri = destination.uri;
    }
  }

  const updatedAt = new Date().toISOString();
  const durableEvidence = evidencePhoto && durableEvidenceUri
    ? { ...evidencePhoto, uri: durableEvidenceUri }
    : null;
  const draft: StoredReportDraft = { form, evidencePhoto: durableEvidence, updatedAt };

  try {
    const existingEncryptedRow = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM (
         SELECT id FROM pending_reports
         WHERE status IN ('pending', 'uploading') AND payload_json LIKE ?
         UNION ALL
         SELECT personnel_id AS id FROM report_drafts WHERE payload_json LIKE ?
       ) LIMIT 1`,
      `${SEALED_PAYLOAD_PREFIX}%`,
      `${SEALED_PAYLOAD_PREFIX}%`,
    );
    const sealedPayload = await sealReportPayload(
      JSON.stringify(draft),
      { allowKeyCreation: !existingEncryptedRow },
    );
    await database.runAsync(
      `INSERT INTO report_drafts (personnel_id, payload_json, evidence_uri, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(personnel_id) DO UPDATE SET
         payload_json = excluded.payload_json,
         evidence_uri = excluded.evidence_uri,
         updated_at = excluded.updated_at`,
      personnelId,
      sealedPayload,
      durableEvidenceUri,
      updatedAt,
    );
  } catch (error) {
    safelyDeleteFile(copiedEvidenceUri);
    throw error;
  }

  if (existing?.evidence_uri && existing.evidence_uri !== durableEvidenceUri) {
    safelyDeleteFile(existing.evidence_uri);
  }
  return draft;
});

export const clearReportDraft = async (personnelId: string) => serializeDraftWrite(async () => {
  const database = await getDatabase();
  if (!database || !personnelId) return;
  const row = await database.getFirstAsync<{ evidence_uri: string | null }>(
    `SELECT evidence_uri FROM report_drafts WHERE personnel_id = ? LIMIT 1`,
    personnelId,
  );
  await database.runAsync(`DELETE FROM report_drafts WHERE personnel_id = ?`, personnelId);
  safelyDeleteFile(row?.evidence_uri);
});

export const cleanupOrphanedPickerEvidence = async () => {
  if (Platform.OS === 'web') return;
  const directory = new Directory(Paths.cache, PICKER_DIRECTORY_NAME);
  if (!directory.exists) return;
  const cutoff = Date.now() - PICKER_ORPHAN_MAX_AGE_MS;
  directory.list().forEach((entry) => {
    if (!(entry instanceof File)) return;
    const modifiedAt = entry.lastModified ?? entry.creationTime;
    if (modifiedAt !== null && modifiedAt < cutoff && entry.exists) entry.delete();
  });
};

export const stagePendingReport = async (
  input: SubmitReportInput,
  personnelId: string,
): Promise<PendingReport | null> => {
  const database = await getDatabase();
  if (!database) return null;

  const id = input.client_submission_id || createSubmissionId();
  const createdAt = new Date().toISOString();
  let durableEvidenceUri: string | null = null;
  let stagedInput: SubmitReportInput = { ...input, client_submission_id: id };

  if (input.evidence_photo) {
    const source = new File(input.evidence_photo.uri);
    if (!source.exists) throw new Error('The captured evidence file is no longer available. Please retake the photo.');
    const directory = ensureEvidenceDirectory();
    if ((directory.size ?? 0) + source.size > MAX_PENDING_EVIDENCE_BYTES) {
      throw new Error('Offline evidence storage is full. Synchronize pending reports before capturing more evidence.');
    }
    const extension = source.extension || '.jpg';
    const destination = new File(directory, `${id}${extension}`);
    await source.copy(destination, { overwrite: false });
    if (!destination.exists || destination.size <= 0) {
      safelyDeleteFile(destination.uri);
      throw new Error('The evidence photo could not be secured for offline submission.');
    }
    durableEvidenceUri = destination.uri;
    stagedInput = {
      ...stagedInput,
      evidence_photo: { ...input.evidence_photo, uri: durableEvidenceUri },
    };
  }

  try {
    const existingEncryptedRow = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM pending_reports
       WHERE status IN ('pending', 'uploading') AND payload_json LIKE ?
       LIMIT 1`,
      `${SEALED_PAYLOAD_PREFIX}%`,
    );
    await database.runAsync(
      `INSERT INTO pending_reports (
        id, personnel_id, payload_json, evidence_uri, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      id,
      personnelId,
      await sealReportPayload(
        JSON.stringify(stagedInput),
        { allowKeyCreation: !existingEncryptedRow },
      ),
      durableEvidenceUri,
      createdAt,
      createdAt,
    );
  } catch (error) {
    safelyDeleteFile(durableEvidenceUri);
    throw error;
  }

  return {
    id,
    personnelId,
    input: stagedInput,
    evidenceUri: durableEvidenceUri,
    createdAt,
    attemptCount: 0,
  };
};

export const getPendingReports = async (
  personnelId: string,
): Promise<PendingReportQueueSnapshot> => {
  const database = await getDatabase();
  if (!database) return { reports: [], failures: [] };
  const rows = await database.getAllAsync<PendingReportRow>(
    `SELECT id, personnel_id, payload_json, evidence_uri, created_at, attempt_count
     FROM pending_reports
     WHERE personnel_id = ? AND status IN ('pending', 'uploading')
     ORDER BY created_at ASC`,
    personnelId,
  );

  const reports: PendingReport[] = [];
  const failures: PendingReportReadFailure[] = [];
  for (const row of rows) {
    let input: SubmitReportInput;
    try {
      input = JSON.parse(await openReportPayload(row.payload_json)) as SubmitReportInput;
    } catch (error) {
      const message = error instanceof Error
        ? error.message.slice(0, 500)
        : 'The queued report payload could not be opened.';
      await database.runAsync(
        `UPDATE pending_reports SET updated_at = ?, last_error = ? WHERE id = ?`,
        new Date().toISOString(),
        message,
        row.id,
      );
      failures.push({ id: row.id, createdAt: row.created_at, message });
      continue;
    }
    reports.push({
      id: row.id,
      personnelId: row.personnel_id,
      input,
      evidenceUri: row.evidence_uri,
      createdAt: row.created_at,
      attemptCount: row.attempt_count,
    });
  }
  return { reports, failures };
};

export const markPendingReportUploading = async (id: string) => {
  const database = await getDatabase();
  await database?.runAsync(
    `UPDATE pending_reports
     SET status = 'uploading', updated_at = ?, attempt_count = attempt_count + 1, last_error = NULL
     WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
};

export const markPendingReportFailed = async (id: string, error: unknown) => {
  const database = await getDatabase();
  await database?.runAsync(
    `UPDATE pending_reports SET status = 'pending', updated_at = ?, last_error = ? WHERE id = ?`,
    new Date().toISOString(),
    error instanceof Error ? error.message.slice(0, 500) : 'Synchronization failed.',
    id,
  );
};

export const completePendingReport = async (report: PendingReport) => {
  const database = await getDatabase();
  if (!database) return;
  await database.runAsync(
    `UPDATE pending_reports SET status = 'synced', updated_at = ?, last_error = NULL WHERE id = ?`,
    new Date().toISOString(),
    report.id,
  );
  try {
    safelyDeleteFile(report.evidenceUri);
    await database.runAsync(`DELETE FROM pending_reports WHERE id = ? AND status = 'synced'`, report.id);
  } catch {
    // The durable synced marker lets startup cleanup safely finish interrupted deletion.
  }
};

export const discardRejectedPendingReport = async (report: PendingReport) => {
  const database = await getDatabase();
  if (!database) return;
  await database.runAsync(`DELETE FROM pending_reports WHERE id = ?`, report.id);
  safelyDeleteFile(report.evidenceUri);
};

export const cleanupConfirmedReports = async () => {
  const database = await getDatabase();
  if (!database) return;
  const rows = await database.getAllAsync<{ id: string; evidence_uri: string | null }>(
    `SELECT id, evidence_uri FROM pending_reports WHERE status = 'synced'`,
  );
  for (const row of rows) {
    try {
      safelyDeleteFile(row.evidence_uri);
      await database.runAsync(`DELETE FROM pending_reports WHERE id = ? AND status = 'synced'`, row.id);
    } catch {
      // Retry cleanup at the next startup/reconnect; never downgrade a confirmed row.
    }
  }
};
