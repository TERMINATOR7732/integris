/**
 * INTEGRIS Local Investigation — Dedicated Web Worker Entrypoint
 * Executes CSV, TSV, TXT, XLSX, XLS, and PDF parsing and the 6-module
 * forensic pipeline off the main UI thread with zero network calls.
 */

import type { ForensicDossier } from '../../types/integris';
import {
  investigateBytesLocallyAsync,
  type LocalProgressUpdate,
} from '../engine/pipeline';
import { LocalIngestionError } from '../ingestion/detector';

export interface ForensicWorkerStartMessage {
  type: 'START';
  fileName: string;
  fileSizeBytes: number;
  targetColumn: string | null;
  buffer: ArrayBuffer;
}

export type ForensicWorkerOutboundMessage =
  | {
      type: 'PROGRESS';
      update: LocalProgressUpdate;
    }
  | {
      type: 'COMPLETE';
      dossier: ForensicDossier;
    }
  | {
      type: 'ERROR';
      message: string;
      statusCode: number;
    };

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<ForensicWorkerStartMessage>) => void) | null;
  postMessage: (message: ForensicWorkerOutboundMessage) => void;
};

ctx.onmessage = async (event: MessageEvent<ForensicWorkerStartMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'START') return;

  try {
    const fileBytes = new Uint8Array(msg.buffer);
    const dossier = await investigateBytesLocallyAsync(fileBytes, {
      fileName: msg.fileName,
      fileSizeBytes: msg.fileSizeBytes,
      targetColumn: msg.targetColumn,
      onProgress: (update) => {
        ctx.postMessage({
          type: 'PROGRESS',
          update,
        });
      },
    });

    ctx.postMessage({
      type: 'COMPLETE',
      dossier,
    });
  } catch (err: unknown) {
    const statusCode =
      err instanceof LocalIngestionError ? err.statusCode : 422;
    const message =
      err instanceof Error
        ? err.message
        : 'An unexpected error occurred during local browser analysis.';
    ctx.postMessage({
      type: 'ERROR',
      message,
      statusCode,
    });
  }
};
