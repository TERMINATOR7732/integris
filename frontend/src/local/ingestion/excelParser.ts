/**
 * INTEGRIS Local Ingestion — Excel (.xlsx & .xls) Workbook Parser
 *
 * Mirrors backend/app/ingestion/excel_parser.py for browser-local Web Worker execution:
 * - Validates .xlsx ZIP structure & enforces a 250 MB uncompressed decompression-bomb guard.
 * - Validates .xls OLE2 compound document header.
 * - Iterates worksheets in order and selects the first sheet with non-empty tabular records.
 * - Normalizes Excel date serial numbers to "YYYY-MM-DD HH:MM:SS" with zero timezone drift.
 * - Preserves literal strings such as "N/A" (matching `keep_default_na=False, na_values=[""]`).
 * - Enforces MAX_DATASET_ROWS (500,000) and MAX_DATASET_COLUMNS (1,000).
 */

import * as XLSXNamespace from 'xlsx';
import type { CellObject, WorkBook } from 'xlsx';
import type { ColumnarFrame, ColumnData, InferredDtype } from './csvParser';
import {
  LocalIngestionError,
  MAX_DATASET_COLUMNS,
  MAX_DATASET_ROWS,
} from './detector';

const XLSX: typeof XLSXNamespace =
  (Reflect.get(XLSXNamespace, 'default') as typeof XLSXNamespace | undefined) ??
  XLSXNamespace;

export const MAX_EXCEL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB bomb guard

export interface ExcelIngestionResult {
  frame: ColumnarFrame;
  fileType: 'xlsx' | 'xls';
  sheetName: string;
  availableSheets: string[];
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  );
}

/**
 * Validates .xlsx ZIP Central Directory and Local File Headers before passing bytes to SheetJS.
 * Prevents SheetJS from silently falling back to text/PRN parsing on corrupted .xlsx files
 * and blocks ZIP decompression bombs (> 250 MB uncompressed).
 */
export function validateXlsxZipArchive(
  fileBytes: Uint8Array,
  maxUncompressedBytes: number = MAX_EXCEL_UNCOMPRESSED_BYTES
): void {
  const corruptedMsg =
    'Unable to read Excel file (.xlsx). The workbook may be corrupted, malformed, or password-protected.';

  if (fileBytes.byteLength < 22) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }

  // Locate End of Central Directory (EOCD) signature 0x06054b50 scanning backwards
  const minEocdOffset = Math.max(0, fileBytes.byteLength - 65557);
  let eocdOffset = -1;
  for (let i = fileBytes.byteLength - 22; i >= minEocdOffset; i--) {
    if (
      fileBytes[i] === 0x50 &&
      fileBytes[i + 1] === 0x4b &&
      fileBytes[i + 2] === 0x05 &&
      fileBytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }

  const totalEntries = readUint16LE(fileBytes, eocdOffset + 10);
  const cdSize = readUint32LE(fileBytes, eocdOffset + 12);
  const cdOffset = readUint32LE(fileBytes, eocdOffset + 16);

  if (
    totalEntries === 0 ||
    cdOffset + cdSize > eocdOffset ||
    cdOffset >= fileBytes.byteLength
  ) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }

  let totalUncompressed = 0;
  let pos = cdOffset;
  let hasOpenXmlEntry = false;
  const asciiDecoder = new TextDecoder('utf-8', { fatal: false });

  for (let idx = 0; idx < totalEntries; idx++) {
    if (pos + 46 > eocdOffset) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }
    const sig = readUint32LE(fileBytes, pos);
    if (sig !== 0x02014b50) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }

    const compressedSize = readUint32LE(fileBytes, pos + 20);
    const uncompressedSize = readUint32LE(fileBytes, pos + 24);
    const fileNameLen = readUint16LE(fileBytes, pos + 28);
    const extraLen = readUint16LE(fileBytes, pos + 30);
    const commentLen = readUint16LE(fileBytes, pos + 32);
    const localHeaderOffset = readUint32LE(fileBytes, pos + 42);

    if (pos + 46 + fileNameLen + extraLen + commentLen > eocdOffset) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }

    const entryName = asciiDecoder.decode(
      fileBytes.subarray(pos + 46, pos + 46 + fileNameLen)
    );
    if (
      entryName === '[Content_Types].xml' ||
      entryName.startsWith('xl/') ||
      entryName.startsWith('_rels/')
    ) {
      hasOpenXmlEntry = true;
    }

    // Verify corresponding Local File Header (0x04034b50)
    if (localHeaderOffset + 30 > cdOffset) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }
    const lfhSig = readUint32LE(fileBytes, localHeaderOffset);
    if (lfhSig !== 0x04034b50) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }
    const lfhNameLen = readUint16LE(fileBytes, localHeaderOffset + 26);
    const lfhExtraLen = readUint16LE(fileBytes, localHeaderOffset + 28);
    const lfhUncompressed = readUint32LE(fileBytes, localHeaderOffset + 22);

    if (
      localHeaderOffset + 30 + lfhNameLen + lfhExtraLen + compressedSize >
      cdOffset
    ) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }

    totalUncompressed += Math.max(uncompressedSize, lfhUncompressed);
    if (totalUncompressed > maxUncompressedBytes) {
      throw new LocalIngestionError(
        'Excel archive uncompressed size exceeds safety limits (potential decompression bomb).',
        400
      );
    }

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  if (!hasOpenXmlEntry) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }
}

/**
 * Validates .xls OLE2 Compound File Binary header before passing bytes to SheetJS.
 */
function validateXlsOle2Header(fileBytes: Uint8Array): void {
  const corruptedMsg =
    'Unable to read Excel file (.xls). The workbook may be corrupted, malformed, or password-protected.';

  // Standard OLE2 header is 512 bytes
  if (fileBytes.byteLength < 512) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }

  // Verify byte order mark (0xFFFE at offset 28) and sector shift (offset 30 typically 9 or 12)
  const byteOrder = readUint16LE(fileBytes, 28);
  const sectorShift = readUint16LE(fileBytes, 30);
  if (byteOrder !== 0xfffe || (sectorShift !== 9 && sectorShift !== 12)) {
    throw new LocalIngestionError(corruptedMsg, 400);
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatExcelDateCode(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
    return null;
  }
  const yyyy = String(parsed.y).padStart(4, '0');
  const mm = pad2(parsed.m);
  const dd = pad2(parsed.d);
  const hh = pad2(parsed.H || 0);
  const min = pad2(parsed.M || 0);
  const ss = pad2(Math.round(parsed.S || 0));
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

type RawExcelCellValue = string | number | boolean | null;

function extractCellValue(cell: CellObject | undefined): RawExcelCellValue {
  if (!cell || cell.t === 'z' || cell.t === 'e') {
    return null;
  }
  if (cell.v === undefined || cell.v === null || cell.v === '') {
    return null;
  }

  if (cell.t === 'n') {
    const numVal = Number(cell.v);
    if (Number.isNaN(numVal)) return null;

    // Check if cell carries a date/time number format
    const fmt = cell.z != null ? String(cell.z) : '';
    if (fmt && XLSX.SSF.is_date(fmt)) {
      const formattedDate = formatExcelDateCode(numVal);
      if (formattedDate !== null) {
        return formattedDate;
      }
    }
    return numVal;
  }

  if (cell.t === 'd' && cell.v instanceof Date) {
    if (Number.isNaN(cell.v.getTime())) return null;
    const yyyy = String(cell.v.getUTCFullYear()).padStart(4, '0');
    const mm = pad2(cell.v.getUTCMonth() + 1);
    const dd = pad2(cell.v.getUTCDate());
    const hh = pad2(cell.v.getUTCHours());
    const min = pad2(cell.v.getUTCMinutes());
    const ss = pad2(cell.v.getUTCSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  if (cell.t === 'b') {
    return Boolean(cell.v);
  }

  const strVal = String(cell.v);
  if (strVal === '') {
    return null;
  }
  return strVal;
}

/**
 * Deduplicates Excel column headers identically to backend/app/ingestion/excel_parser.py.
 */
function deduplicateExcelHeaders(rawHeaders: (RawExcelCellValue)[]): string[] {
  const rawCols = rawHeaders.map((c, idx) => {
    if (c === null || c === undefined) return `col_${idx + 1}`;
    const s = String(c).trim();
    if (!s || s.startsWith('Unnamed:')) return `col_${idx + 1}`;
    return s;
  });

  const seen = new Map<string, number>();
  const dedupCols: string[] = [];
  for (const c of rawCols) {
    const prev = seen.get(c);
    if (prev !== undefined) {
      const next = prev + 1;
      seen.set(c, next);
      dedupCols.push(`${c}_${next}`);
    } else {
      seen.set(c, 0);
      dedupCols.push(c);
    }
  }
  return dedupCols;
}

/**
 * Builds a `ColumnarFrame` from normalized Excel columns while preserving exact
 * pandas dtype semantics (`int64`, `float64`, `bool`, `str`, and `object` for mixed columns).
 */
function buildExcelColumnarFrame(
  columnNames: string[],
  rawColumns: RawExcelCellValue[][]
): ColumnarFrame {
  const numCols = columnNames.length;
  const rowCount = numCols > 0 ? rawColumns[0].length : 0;

  if (numCols === 0 || rowCount === 0) {
    throw new LocalIngestionError(
      'Excel workbook contains no usable tabular data across any sheets.',
      400
    );
  }

  if (rowCount > MAX_DATASET_ROWS) {
    throw new LocalIngestionError(
      `Dataset contains ${rowCount.toLocaleString()} records, which exceeds the maximum processing limit of ${MAX_DATASET_ROWS.toLocaleString()} rows.`,
      413
    );
  }

  if (numCols > MAX_DATASET_COLUMNS) {
    throw new LocalIngestionError(
      `Dataset contains ${numCols.toLocaleString()} columns, which exceeds the maximum processing limit of ${MAX_DATASET_COLUMNS.toLocaleString()} columns.`,
      413
    );
  }

  const columns: ColumnData[] = new Array(numCols);
  const columnsByName = new Map<string, ColumnData>();
  let totalMemoryBytes = 132;

  for (let c = 0; c < numCols; c++) {
    const colVals = rawColumns[c];
    const name = columnNames[c];

    let nullCount = 0;
    let nonNullCount = 0;
    let numCount = 0;
    let intCount = 0;
    let boolCount = 0;
    let strCount = 0;

    for (let r = 0; r < rowCount; r++) {
      const v = colVals[r];
      if (v === null) {
        nullCount++;
      } else {
        nonNullCount++;
        if (typeof v === 'number') {
          numCount++;
          if (Number.isInteger(v) && Number.isSafeInteger(v)) {
            intCount++;
          }
        } else if (typeof v === 'boolean') {
          boolCount++;
        } else {
          strCount++;
        }
      }
    }

    let dtype: InferredDtype;
    let inferredDtypeOverride: string | undefined;

    if (nonNullCount === 0) {
      dtype = 'float64';
    } else if (boolCount === nonNullCount && nullCount === 0) {
      dtype = 'bool';
    } else if (numCount === nonNullCount) {
      dtype = intCount === nonNullCount && nullCount === 0 ? 'int64' : 'float64';
    } else {
      dtype = 'str';
      // In pandas, a column mixing numbers/booleans and strings has dtype 'object'
      // whereas a pure string column has dtype 'str'.
      if (strCount < nonNullCount) {
        inferredDtypeOverride = 'object';
      }
    }

    if (dtype === 'int64' || dtype === 'float64') {
      const numValues = new Float64Array(rowCount);
      let finiteCount = 0;
      const sampleValues: number[] = [];
      const sampleSeen = new Set<number>();
      let charLenSum100 = 0;
      let charLenCount100 = 0;

      for (let r = 0; r < rowCount; r++) {
        const v = colVals[r];
        if (v === null) {
          numValues[r] = NaN;
        } else {
          const num = v as number;
          numValues[r] = num;
          if (Number.isFinite(num)) {
            finiteCount++;
          }
          if (sampleValues.length < 5 && !sampleSeen.has(num)) {
            sampleSeen.add(num);
            sampleValues.push(dtype === 'int64' ? Math.trunc(num) : num);
          }
          if (charLenCount100 < 100) {
            charLenSum100 += String(num).length;
            charLenCount100++;
          }
        }
      }

      const sortedFinite = new Float64Array(finiteCount);
      let w = 0;
      for (let r = 0; r < rowCount; r++) {
        const num = numValues[r];
        if (Number.isFinite(num)) {
          sortedFinite[w++] = num;
        }
      }
      sortedFinite.sort();

      let uniqueFinite = 0;
      for (let i = 0; i < finiteCount; i++) {
        if (i === 0 || sortedFinite[i] !== sortedFinite[i - 1]) {
          uniqueFinite++;
        }
      }

      const memoryBytes = 132 + rowCount * 8;
      totalMemoryBytes += rowCount * 8;

      const colData: ColumnData = {
        name,
        dtype,
        rowCount,
        nullCount,
        nonNullCount,
        numValues,
        sortedFinite,
        codes: null,
        dict: null,
        counts: null,
        uniqueCount: uniqueFinite,
        sampleValues,
        memoryBytes,
        avgCharLen100: charLenCount100 > 0 ? charLenSum100 / charLenCount100 : 0,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    } else if (dtype === 'bool') {
      const numValues = new Float64Array(rowCount);
      const sampleValues: boolean[] = [];
      let seenTrue = false;
      let seenFalse = false;

      for (let r = 0; r < rowCount; r++) {
        const v = colVals[r] as boolean;
        numValues[r] = v ? 1 : 0;
        if (v && !seenTrue) {
          seenTrue = true;
          sampleValues.push(true);
        } else if (!v && !seenFalse) {
          seenFalse = true;
          sampleValues.push(false);
        }
      }

      const memoryBytes = 132 + rowCount;
      totalMemoryBytes += rowCount;

      const colData: ColumnData = {
        name,
        dtype,
        rowCount,
        nullCount,
        nonNullCount,
        numValues,
        sortedFinite: null,
        codes: null,
        dict: null,
        counts: null,
        uniqueCount: sampleValues.length,
        sampleValues,
        memoryBytes,
        avgCharLen100: 4.5,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    } else {
      // 'str' or mixed 'object'
      const codes = new Int32Array(rowCount);
      const dict: string[] = [''];
      const dictMap = new Map<string, number>();
      const dictCounts: number[] = [nullCount];
      const sampleValues: (string | number | boolean)[] = [];
      const sampleSeen = new Set<string>();
      let charLenSum100 = 0;
      let charLenCount100 = 0;
      let strBytes = 0;

      for (let r = 0; r < rowCount; r++) {
        const rawVal = colVals[r];
        if (rawVal === null) {
          codes[r] = 0;
          continue;
        }
        const strVal = String(rawVal);
        let code = dictMap.get(strVal);
        if (code === undefined) {
          code = dict.length;
          dict.push(strVal);
          dictMap.set(strVal, code);
          dictCounts.push(1);
        } else {
          dictCounts[code]++;
        }
        codes[r] = code;

        if (sampleValues.length < 5) {
          const sampleKey = `${typeof rawVal}:${strVal}`;
          if (!sampleSeen.has(sampleKey)) {
            sampleSeen.add(sampleKey);
            sampleValues.push(rawVal);
          }
        }

        if (charLenCount100 < 100) {
          charLenSum100 += strVal.length;
          charLenCount100++;
        }
        strBytes += 50 + strVal.length;
      }

      const memoryBytes = Math.round(132 + strBytes + nullCount * 32);
      totalMemoryBytes += memoryBytes - 132;

      const colData: ColumnData = {
        name,
        dtype: 'str',
        inferredDtypeOverride,
        rowCount,
        nullCount,
        nonNullCount,
        numValues: null,
        sortedFinite: null,
        codes,
        dict,
        counts: Int32Array.from(dictCounts),
        uniqueCount: dict.length - 1,
        sampleValues,
        memoryBytes,
        avgCharLen100: charLenCount100 > 0 ? charLenSum100 / charLenCount100 : 0,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    }
  }

  return {
    rowCount,
    columnCount: numCols,
    columnNames,
    columns,
    columnsByName,
    totalMemoryBytes: Math.round(totalMemoryBytes),
  };
}

/**
 * Parses an Excel workbook (`.xlsx` or `.xls`) from raw bytes into a `ColumnarFrame`.
 */
export function parseExcelBytes(
  fileBytes: Uint8Array,
  fileType: 'xlsx' | 'xls',
  onProgress?: (fraction: number) => void
): ExcelIngestionResult {
  const corruptedMsg = `Unable to read Excel file (.${fileType}). The workbook may be corrupted, malformed, or password-protected.`;

  if (fileType === 'xlsx') {
    validateXlsxZipArchive(fileBytes, MAX_EXCEL_UNCOMPRESSED_BYTES);
  } else {
    validateXlsOle2Header(fileBytes);
  }

  if (onProgress) onProgress(0.2);

  let wb: WorkBook;
  try {
    wb = XLSX.read(fileBytes, {
      type: 'array',
      cellDates: false,
      cellNF: true,
      cellFormula: true,
      cellText: false,
    });
  } catch {
    throw new LocalIngestionError(corruptedMsg, 400);
  }

  if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) {
    throw new LocalIngestionError(
      'Excel workbook contains no worksheets.',
      400
    );
  }

  if (onProgress) onProgress(0.6);

  const availableSheets = wb.SheetNames.map((s: string) => String(s));

  for (const sheetName of availableSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws || Object.keys(ws).length === 0) {
      throw new LocalIngestionError(corruptedMsg, 400);
    }
    if (!ws['!ref']) continue;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const totalRowsInRange = range.e.r - range.s.r + 1;
    const totalColsInRange = range.e.c - range.s.c + 1;

    // Need at least 1 header row + 1 data row
    if (totalRowsInRange < 2 || totalColsInRange < 1) {
      continue;
    }

    // Extract header row (range.s.r)
    const rawHeaderRow: RawExcelCellValue[] = new Array(totalColsInRange);
    for (let c = 0; c < totalColsInRange; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + c });
      rawHeaderRow[c] = extractCellValue(ws[cellAddr]);
    }

    // Extract data rows and drop rows where all cells are null (`dropna(how="all")`)
    const nonEmptyDataRows: RawExcelCellValue[][] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const rowCells: RawExcelCellValue[] = new Array(totalColsInRange);
      let rowHasValue = false;
      for (let c = 0; c < totalColsInRange; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c: range.s.c + c });
        const val = extractCellValue(ws[cellAddr]);
        rowCells[c] = val;
        if (val !== null) {
          rowHasValue = true;
        }
      }
      if (rowHasValue) {
        nonEmptyDataRows.push(rowCells);
      }
    }

    if (nonEmptyDataRows.length === 0) {
      continue;
    }

    // Drop columns where all data cells are null (`dropna(axis=1, how="all")`)
    const keptColIndices: number[] = [];
    for (let c = 0; c < totalColsInRange; c++) {
      let colHasData = false;
      for (let r = 0; r < nonEmptyDataRows.length; r++) {
        if (nonEmptyDataRows[r][c] !== null) {
          colHasData = true;
          break;
        }
      }
      if (colHasData) {
        keptColIndices.push(c);
      }
    }

    if (keptColIndices.length === 0) {
      continue;
    }

    const keptHeaders = keptColIndices.map((cIdx) => rawHeaderRow[cIdx]);
    const columnNames = deduplicateExcelHeaders(keptHeaders);

    const rawColumns: RawExcelCellValue[][] = keptColIndices.map((cIdx) => {
      const colArr = new Array<RawExcelCellValue>(nonEmptyDataRows.length);
      for (let r = 0; r < nonEmptyDataRows.length; r++) {
        colArr[r] = nonEmptyDataRows[r][cIdx];
      }
      return colArr;
    });

    const frame = buildExcelColumnarFrame(columnNames, rawColumns);
    if (onProgress) onProgress(1.0);

    return {
      frame,
      fileType,
      sheetName,
      availableSheets,
    };
  }

  throw new LocalIngestionError(
    'Excel workbook contains no usable tabular data across any sheets.',
    400
  );
}
