/**
 * INTEGRIS Local Engine — Shared Progress & Cancellation Types
 */

import type { SupportedLocalFileType } from '../ingestion/detector';

export interface LocalProgressUpdate {
  percent: number;
  stageIndex: number;
  stageLabel: string;
}

export interface LocalInvestigationOptions {
  fileName: string;
  fileSizeBytes?: number;
  targetColumn?: string | null;
  fileType?: SupportedLocalFileType;
  sheetName?: string | null;
  availableSheets?: string[] | null;
  tableIndex?: number | null;
  pageCount?: number | null;
  onProgress?: (update: LocalProgressUpdate) => void;
  isCancelled?: () => boolean;
}

export class LocalInvestigationCancelledError extends Error {
  constructor() {
    super('Local investigation was cancelled by the user.');
    this.name = 'LocalInvestigationCancelledError';
  }
}
