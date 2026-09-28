/**
 * INTEGRIS Local Ingestion — File Format & Magic-Byte Detector
 * Mirrors backend/app/ingestion/detector.py for browser-local execution.
 */

export type SupportedLocalFileType = 'csv' | 'tsv' | 'txt';

export class LocalIngestionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'LocalIngestionError';
    this.statusCode = statusCode;
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (xlsx, zip)
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // xls, doc

function startsWithBytes(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Validates file extension and magic bytes for browser-local execution.
 * Local Mode supports tabular text formats (.csv, .tsv, .txt) directly in the browser.
 * Binary formats (.xlsx, .xls, .pdf) are explicitly rejected with actionable guidance
 * rather than faking support or silently uploading to a server.
 */
export function detectLocalFileType(
  fileBytes: Uint8Array,
  filename: string
): SupportedLocalFileType {
  if (!fileBytes || fileBytes.byteLength === 0) {
    throw new LocalIngestionError(
      'Uploaded file is completely empty (0 bytes).',
      400
    );
  }

  const trimmedName = (filename || '').trim();
  const dotIdx = trimmedName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? trimmedName.slice(dotIdx + 1).toLowerCase() : '';

  const isPdfMagic = startsWithBytes(fileBytes, PDF_MAGIC);
  const isZipMagic = startsWithBytes(fileBytes, ZIP_MAGIC);
  const isOle2Magic = startsWithBytes(fileBytes, OLE2_MAGIC);

  if (ext === 'xlsx' || ext === 'xls' || ext === 'pdf') {
    throw new LocalIngestionError(
      `Local Browser Mode supports .csv, .tsv, and .txt datasets. '${trimmedName}' (.${ext}) requires binary document extraction — please export the table to CSV or switch to Online Mode.`,
      415
    );
  }

  if (ext !== 'csv' && ext !== 'tsv' && ext !== 'txt') {
    throw new LocalIngestionError(
      `Unsupported file format '${ext ? '.' + ext : 'unknown'}'. Local Browser Mode accepts: .csv, .tsv, .txt.`,
      415
    );
  }

  if (isPdfMagic || isZipMagic || isOle2Magic) {
    throw new LocalIngestionError(
      `File '${trimmedName}' has a text extension (.${ext}) but contains binary archive or PDF magic bytes.`,
      422
    );
  }

  // Check first 1024 bytes for null bytes indicating a binary file
  const checkLen = Math.min(fileBytes.length, 1024);
  for (let i = 0; i < checkLen; i++) {
    if (fileBytes[i] === 0x00) {
      throw new LocalIngestionError(
        `File '${trimmedName}' appears to be a binary file and cannot be parsed as tabular text.`,
        422
      );
    }
  }

  return ext as SupportedLocalFileType;
}
