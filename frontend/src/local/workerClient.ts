/**
 * INTEGRIS Local Investigation Mode — Main-Thread Web Worker Client
 *
 * Lightweight coordinator imported by the React UI (`App.tsx`) so that heavy
 * binary parsers (`xlsx`, `pdfjs-dist`) and the 6 forensic engine modules are
 * bundled exclusively inside `forensicWorker.ts` and never bloat the main UI bundle.
 */

import type { ForensicDossier } from '../types/integris';
import {
  LocalInvestigationCancelledError,
  type LocalProgressUpdate,
} from './engine/types';
import { LocalIngestionError } from './ingestion/detector';
import type {
  ForensicWorkerOutboundMessage,
  ForensicWorkerStartMessage,
} from './worker/forensicWorker';

export { LocalInvestigationCancelledError, LocalIngestionError };
export type { LocalProgressUpdate };

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
    const pipelineModulePath = './engine/pipeline';
    const { investigateBytesLocallyAsync: fallbackInvestigate } = (await import(
      /* @vite-ignore */ pipelineModulePath
    )) as typeof import('./engine/pipeline');
    return fallbackInvestigate(new Uint8Array(buffer), {
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
          err.message ||
            'Web Worker terminated unexpectedly during local investigation.',
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
