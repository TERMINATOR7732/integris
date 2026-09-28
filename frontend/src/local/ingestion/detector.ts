/**
 * INTEGRIS Local Ingestion — File Format, Size Limit & Magic-Byte Detector
 * Mirrors backend/app/ingestion/detector.py and backend/app/api/routes.py
 * for browser-local execution across all 6 supported formats.
 */

export type SupportedLocalFileType = 'csv' | 'tsv' | 'txt' | 'xlsx' | 'xls' | 'pdf';

export const MAX_DATASET_ROWS = 500_000;
export const MAX_DATASET_COLUMNS = 1_000;

export const LOCAL_FORMAT_SIZE_LIMITS_BYTES: Record<SupportedLocalFileType, number> = {
  csv: 50 * 1024 * 1024, // 50 MB
  tsv: 50 * 1024 * 1024, // 50 MB
  txt: 50 * 1024 * 1024, // 50 MB
  xlsx: 25 * 1024 * 1024, // 25 MB
  xls: 25 * 1024 * 1024, // 25 MB
  pdf: 15 * 1024 * 1024, // 15 MB
};

export class LocalIngestionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'LocalIngestionError';
    this.statusCode = statusCode;
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (xlsx, zip)
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // xls, doc
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

function startsWithBytes(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Normalizes an uploaded filename to its safe basename without path components.
 * Mirrors `_sanitize_upload_filename` in backend/app/api/routes.py.
 */
export function sanitizeUploadFilename(rawName: string | null | undefined): string {
  const raw = (rawName || '').trim().replace(/\\/g, '/');
  const parts = raw.split('/');
  let base = (parts[parts.length - 1] || '').trim();
  if (base.includes(':')) {
    const colonParts = base.split(':');
    base = (colonParts[colonParts.length - 1] || '').trim();
  }
  if (!base || base === '.' || base === '..') {
    return 'dataset.csv';
  }
  return base;
}

/**
 * Validates file extension, size boundaries, and magic bytes for browser-local execution.
 * Supports all 6 INTEGRIS formats (.csv, .tsv, .txt, .xlsx, .xls, .pdf).
 */
export function detectLocalFileType(
  fileBytes: Uint8Array,
  filename: string
): SupportedLocalFileType {
  if (!fileBytes || fileBytes.byteLength === 0) {
    throw new LocalIngestionError(
      'Uploaded dataset file is completely empty (0 bytes).',
      400
    );
  }

  const safeName = sanitizeUploadFilename(filename);
  const dotIdx = safeName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? safeName.slice(dotIdx).toLowerCase() : '';

  const isPdfMagic = startsWithBytes(fileBytes, PDF_MAGIC);
  const isZipMagic = startsWithBytes(fileBytes, ZIP_MAGIC);
  const isOle2Magic = startsWithBytes(fileBytes, OLE2_MAGIC);

  // Check magic byte signatures first to catch spoofed extensions
  if (isPdfMagic && ext && ext !== '.pdf') {
    throw new LocalIngestionError(
      `File contains PDF data but has extension '${ext}'.`,
      422
    );
  }
  if (isZipMagic && ext && ext !== '.xlsx') {
    throw new LocalIngestionError(
      `File contains OpenXML/ZIP data but has extension '${ext}'.`,
      422
    );
  }
  if (isOle2Magic && ext && ext !== '.xls') {
    throw new LocalIngestionError(
      `File contains legacy OLE/XLS data but has extension '${ext}'.`,
      422
    );
  }

  const allowedExtensions = ['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.pdf'];
  if (!allowedExtensions.includes(ext)) {
    throw new LocalIngestionError(
      `Unsupported file format '${ext || 'unknown'}'. Allowed extensions: .csv, .tsv, .txt, .xlsx, .xls, .pdf.`,
      415
    );
  }

  const formatKey = ext.slice(1) as SupportedLocalFileType;
  const maxBytes = LOCAL_FORMAT_SIZE_LIMITS_BYTES[formatKey];
  if (maxBytes && fileBytes.byteLength > maxBytes) {
    throw new LocalIngestionError(
      `Dataset size (${(fileBytes.byteLength / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB for ${ext.toUpperCase()}.`,
      413
    );
  }

  if (formatKey === 'pdf') {
    if (!isPdfMagic) {
      throw new LocalIngestionError(
        'Invalid .pdf file: missing %PDF header signature.',
        422
      );
    }
    return 'pdf';
  }

  if (formatKey === 'xlsx') {
    if (!isZipMagic) {
      throw new LocalIngestionError(
        'Invalid .xlsx file: missing OpenXML zip archive signature.',
        422
      );
    }
    return 'xlsx';
  }

  if (formatKey === 'xls') {
    if (!isOle2Magic) {
      throw new LocalIngestionError(
        'Invalid .xls file: missing legacy Excel binary signature.',
        422
      );
    }
    return 'xls';
  }

  // Text-based formats (.csv, .tsv, .txt): check first 8192 bytes for null bytes (unless UTF-16 BOM)
  const isUtf16Bom =
    startsWithBytes(fileBytes, UTF16_LE_BOM) ||
    startsWithBytes(fileBytes, UTF16_BE_BOM);
  if (!isUtf16Bom) {
    const checkLen = Math.min(fileBytes.length, 8192);
    for (let i = 0; i < checkLen; i++) {
      if (fileBytes[i] === 0x00) {
        throw new LocalIngestionError(
          `File with extension '${ext}' contains binary null-byte data and is not valid text.`,
          422
        );
      }
    }
  }

  return formatKey;
}
