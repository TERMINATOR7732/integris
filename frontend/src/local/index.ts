/**
 * INTEGRIS Local Investigation Mode — Public API & Web Worker Coordinator
 *
 * Guarantees:
 * - Zero network requests (never uploads dataset to Render or any external endpoint).
 * - Offloads heavy 45+ MB parsing and forensic execution to a dedicated Web Worker.
 * - Transfers ArrayBuffer ownership to the worker with zero memory duplication.
 * - Supports instant cancellation via AbortSignal (`worker.terminate()`).
 */

import type { ForensicDossier } from '../types/integris';
import {
  investigateBytesLocally,
  LocalInvestigationCancelledError,
  type LocalInvestigationOptions,
  type LocalProgressUpdate,
  runLocalForensicPipeline,
} from './engine/pipeline';
import {
  detectLocalFileType,
  LocalIngestionError,
  type SupportedLocalFileType,
} from './ingestion/detector';
import {
  type ColumnarFrame,
  type ColumnData,
  type InferredDtype,
  parseColumnarCsvBytes,
} from './ingestion/csvParser';
import type {
  ForensicWorkerOutboundMessage,
  ForensicWorkerStartMessage,
} from './worker/forensicWorker';

export {
  investigateBytesLocally,
  runLocalForensicPipeline,
  parseColumnarCsvBytes,
  detectLocalFileType,
  LocalIngestionError,
  LocalInvestigationCancelledError,
};

export type {
  LocalProgressUpdate,
  LocalInvestigationOptions,
  SupportedLocalFileType,
  ColumnarFrame,
  ColumnData,
  InferredDtype,
};

export interface BrowserLocalInvestigationParams {
  file: File;
  targetColumn?: string | null;
  onProgress?: (update: LocalProgressUpdate) => void;
  signal?: AbortSignal;
}

/**
 * Executes a full INTEGRIS forensic investigation inside a dedicated browser Web Worker.
 */
export async function runBrowserLocalInvestigation({
  file,
  targetColumn = null,
  onProgress,
  signal,
}: BrowserLocalInvestigationParams): Promise<ForensicDossier> {
  if (signal?.aborted) {
    throw new LocalInvestigationCancelledError();
  }

  onProgress?.({
    percent: 0,
    stageIndex: 0,
    stageLabel: 'Reading file into local browser memory',
  });

  const buffer = await file.arrayBuffer();

  if (signal?.aborted) {
    throw new LocalInvestigationCancelledError();
  }

  // Fallback for non-Worker environments (e.g., Node test runner)
  if (typeof Worker === 'undefined') {
    return investigateBytesLocally(new Uint8Array(buffer), {
      fileName: file.name,
      fileSizeBytes: file.size,
      targetColumn,
      onProgress,
      isCancelled: () => Boolean(signal?.aborted),
    });
  }

  return new Promise<ForensicDossier>((resolve, reject) => {
    const worker = new Worker(
      new URL('./worker/forensicWorker.ts', import.meta.url),
      { type: 'module' }
    );

    let settled = false;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      worker.terminate();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new LocalInvestigationCancelledError());
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    worker.onmessage = (
      event: MessageEvent<ForensicWorkerOutboundMessage>
    ) => {
      const msg = event.data;
      if (!msg || settled) return;

      if (msg.type === 'PROGRESS') {
        onProgress?.(msg.update);
      } else if (msg.type === 'COMPLETE') {
        settled = true;
        cleanup();
        resolve(msg.dossier);
      } else if (msg.type === 'ERROR') {
        settled = true;
        cleanup();
        reject(new LocalIngestionError(msg.message, msg.statusCode));
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new LocalIngestionError(
          err.message || 'Web Worker terminated unexpectedly during local investigation.',
          500
        )
      );
    };

    const startMsg: ForensicWorkerStartMessage = {
      type: 'START',
      fileName: file.name,
      fileSizeBytes: file.size,
      targetColumn: targetColumn ?? null,
      buffer,
    };

    // Transfer ArrayBuffer ownership to avoid duplicating 45+ MB in browser RAM
    worker.postMessage(startMsg, [buffer]);
  });
}
