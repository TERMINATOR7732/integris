/**
 * INTEGRIS Local Investigation Mode — Public API & Web Worker Coordinator
 *
 * Guarantees:
 * - Zero network requests (never uploads dataset to Render or any external endpoint).
 * - Supports all 6 INTEGRIS formats (.csv, .tsv, .txt, .xlsx, .xls, .pdf) locally.
 * - Offloads heavy 45+ MB parsing and forensic execution to a dedicated Web Worker.
 * - Transfers ArrayBuffer ownership to the worker with zero memory duplication.
 * - Supports instant cancellation via AbortSignal (`worker.terminate()`).
 */

import {
  investigateBytesLocally,
  investigateBytesLocallyAsync,
  LocalInvestigationCancelledError,
  type LocalInvestigationOptions,
  type LocalProgressUpdate,
  runLocalForensicPipeline,
} from './engine/pipeline';
import {
  detectLocalFileType,
  LOCAL_FORMAT_SIZE_LIMITS_BYTES,
  LocalIngestionError,
  MAX_DATASET_COLUMNS,
  MAX_DATASET_ROWS,
  type SupportedLocalFileType,
} from './ingestion/detector';
import {
  type ColumnarFrame,
  type ColumnData,
  type InferredDtype,
  parseColumnarCsvBytes,
} from './ingestion/csvParser';
import {
  type ExcelIngestionResult,
  MAX_EXCEL_UNCOMPRESSED_BYTES,
  parseExcelBytes,
  validateXlsxZipArchive,
} from './ingestion/excelParser';
import {
  type PdfIngestionResult,
  parsePdfBytes,
} from './ingestion/pdfParser';
import {
  type BrowserLocalInvestigationParams,
  runBrowserLocalInvestigation,
} from './workerClient';

export {
  runBrowserLocalInvestigation,
  investigateBytesLocally,
  investigateBytesLocallyAsync,
  runLocalForensicPipeline,
  parseColumnarCsvBytes,
  parseExcelBytes,
  validateXlsxZipArchive,
  parsePdfBytes,
  detectLocalFileType,
  LocalIngestionError,
  LocalInvestigationCancelledError,
  LOCAL_FORMAT_SIZE_LIMITS_BYTES,
  MAX_DATASET_ROWS,
  MAX_DATASET_COLUMNS,
  MAX_EXCEL_UNCOMPRESSED_BYTES,
};

export type {
  BrowserLocalInvestigationParams,
  LocalProgressUpdate,
  LocalInvestigationOptions,
  SupportedLocalFileType,
  ColumnarFrame,
  ColumnData,
  InferredDtype,
  ExcelIngestionResult,
  PdfIngestionResult,
};
