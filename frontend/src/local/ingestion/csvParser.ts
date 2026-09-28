/**
 * INTEGRIS Local Ingestion — High-Performance RFC 4180 Columnar CSV/TSV/TXT Parser
 *
 * Designed to process 45+ MB datasets (~160k–190k rows × 26–37 columns) inside a
 * browser Web Worker in ~1–2 seconds with minimal heap overhead:
 * - Pass 1 scans raw UTF-8 bytes to validate structure, count rows, and infer exact
 *   pandas-equivalent dtypes ('int64' | 'float64' | 'bool' | 'str') without allocating strings.
 * - Pass 2 populates compact typed arrays (`Float64Array` for numeric/bool columns,
 *   dictionary-encoded `Int32Array` + `string[]` for string columns).
 */

import { LocalIngestionError, type SupportedLocalFileType } from './detector';

export type InferredDtype = 'int64' | 'float64' | 'bool' | 'str';

export interface ColumnData {
  name: string;
  dtype: InferredDtype;
  rowCount: number;
  nullCount: number;
  nonNullCount: number;
  /**
   * Present for 'int64', 'float64', and 'bool' columns.
   * Length === rowCount. Missing values are stored as NaN.
   * For 'bool', False is 0 and True is 1.
   */
  numValues: Float64Array | null;
  /**
   * Sorted finite values for 'int64' and 'float64' columns (ascending).
   */
  sortedFinite: Float64Array | null;
  /**
   * Present for 'str' columns.
   * Length === rowCount. Code 0 represents null/NA; k >= 1 indexes into `dict[k]`.
   */
  codes: Int32Array | null;
  /**
   * Present for 'str' columns.
   * `dict[0] = ""`, `dict[1..M]` are unique non-NA strings in order of first appearance.
   */
  dict: string[] | null;
  /**
   * Present for 'str' columns.
   * `counts[k]` is the number of rows with dictionary code `k` (`counts[0] === nullCount`).
   */
  counts: Int32Array | null;
  /**
   * Number of unique non-null values in the column.
   */
  uniqueCount: number;
  /**
   * Up to 5 first unique non-null sample values in order of appearance.
   */
  sampleValues: (string | number | boolean)[];
  /**
   * Estimated in-memory footprint in bytes (matching pandas deep memory usage scale).
   */
  memoryBytes: number;
  /**
   * Average string character length of the first 100 non-null values (used by profiler).
   */
  avgCharLen100: number;
}

export interface ColumnarFrame {
  rowCount: number;
  columnCount: number;
  columnNames: string[];
  columns: ColumnData[];
  columnsByName: Map<string, ColumnData>;
  totalMemoryBytes: number;
}

const PANDAS_DEFAULT_NA = new Set<string>([
  '',
  '#N/A',
  '#N/A N/A',
  '#NA',
  '-1.#IND',
  '-1.#QNAN',
  '-NaN',
  '-nan',
  '1.#IND',
  '1.#QNAN',
  '<NA>',
  'N/A',
  'NA',
  'NULL',
  'NaN',
  'None',
  'n/a',
  'nan',
  'null',
]);

const POW10 = new Float64Array([
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10,
  1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20,
]);

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Deduplicates and normalizes column headers identically to backend/app/engine/profiler.py.
 */
export function deduplicateColumnNames(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  const newCols: string[] = [];

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    const colStr = (rawHeaders[idx] ?? '').trim() || `unnamed_col_${idx}`;
    const prevCount = seen.get(colStr);
    if (prevCount !== undefined) {
      const nextCount = prevCount + 1;
      seen.set(colStr, nextCount);
      newCols.push(`${colStr}_${nextCount}`);
    } else {
      seen.set(colStr, 0);
      newCols.push(colStr);
    }
  }
  return newCols;
}

/**
 * Fast ASCII-to-string helper for short slices without UTF-8 multi-byte sequences.
 */
function decodeSlice(buf: Uint8Array, start: number, end: number): string {
  const len = end - start;
  if (len <= 0) return '';
  if (len <= 48) {
    let isAscii = true;
    for (let i = start; i < end; i++) {
      if (buf[i] >= 0x80) {
        isAscii = false;
        break;
      }
    }
    if (isAscii) {
      let s = '';
      for (let i = start; i < end; i++) {
        s += String.fromCharCode(buf[i]);
      }
      return s;
    }
  }
  return utf8Decoder.decode(buf.subarray(start, end));
}

/**
 * Checks if `buf[start..end]` is one of pandas' 19 default NA strings without
 * allocating a string for 99% of cells.
 */
function isPandasNABytes(buf: Uint8Array, start: number, end: number): boolean {
  const len = end - start;
  if (len === 0) return true;
  if (len > 8) return false;
  const b0 = buf[start];
  // First byte of any non-empty PANDAS_DEFAULT_NA is one of: '#', '-', '1', '<', 'N', 'n'
  if (
    b0 !== 35 && // '#'
    b0 !== 45 && // '-'
    b0 !== 49 && // '1'
    b0 !== 60 && // '<'
    b0 !== 78 && // 'N'
    b0 !== 110   // 'n'
  ) {
    return false;
  }
  let s = '';
  for (let i = start; i < end; i++) {
    const c = buf[i];
    if (c >= 0x80) return false;
    s += String.fromCharCode(c);
  }
  return PANDAS_DEFAULT_NA.has(s);
}

/**
 * Checks if `buf[start..end]` is ASCII "true" or "false" (case-insensitive).
 * Returns 1 for true, 0 for false, -1 otherwise.
 */
function parseAsciiBool(buf: Uint8Array, start: number, end: number): number {
  const len = end - start;
  if (len === 4) {
    if (
      (buf[start] | 32) === 116 &&     // 't'
      (buf[start + 1] | 32) === 114 && // 'r'
      (buf[start + 2] | 32) === 117 && // 'u'
      (buf[start + 3] | 32) === 101    // 'e'
    ) {
      return 1;
    }
  } else if (len === 5) {
    if (
      (buf[start] | 32) === 102 &&     // 'f'
      (buf[start + 1] | 32) === 97 &&  // 'a'
      (buf[start + 2] | 32) === 108 && // 'l'
      (buf[start + 3] | 32) === 115 && // 's'
      (buf[start + 4] | 32) === 101    // 'e'
    ) {
      return 0;
    }
  }
  return -1;
}

/**
 * Classifies numeric capability of `buf[start..end]`:
 * Returns:
 *   2 if valid safe integer (and float)
 *   1 if valid float (non-integer)
 *   0 if not a number
 */
function classifyNumericBytes(buf: Uint8Array, start: number, end: number): number {
  let s = start;
  let e = end;
  while (s < e && (buf[s] === 32 || buf[s] === 9)) s++;
  while (e > s && (buf[e - 1] === 32 || buf[e - 1] === 9)) e--;
  const len = e - s;
  if (len === 0 || len > 36) return 0;

  let p = s;
  if (buf[p] === 43 || buf[p] === 45) {
    p++;
    if (p === e) return 0;
  }

  let intDigits = 0;
  while (p < e && buf[p] >= 48 && buf[p] <= 57) {
    intDigits++;
    p++;
  }

  // Fast path: pure integer
  if (p === e && intDigits > 0) {
    if (intDigits <= 15) return 2;
    const numVal = Number(decodeSlice(buf, s, e));
    return Number.isSafeInteger(numVal) ? 2 : 1;
  }

  // Check decimal point
  let fracDigits = 0;
  if (p < e && buf[p] === 46) {
    p++;
    while (p < e && buf[p] >= 48 && buf[p] <= 57) {
      fracDigits++;
      p++;
    }
  }

  if (intDigits === 0 && fracDigits === 0) {
    // Check +/-inf or +/-Infinity
    const str = decodeSlice(buf, s, e);
    if (/^[+-]?inf(?:inity)?$/i.test(str)) {
      return 1;
    }
    return 0;
  }

  if (p === e) {
    return 1;
  }

  // Check scientific notation [eE][+-]?\d+
  if (p < e && (buf[p] === 101 || buf[p] === 69)) {
    p++;
    if (p < e && (buf[p] === 43 || buf[p] === 45)) p++;
    let expDigits = 0;
    while (p < e && buf[p] >= 48 && buf[p] <= 57) {
      expDigits++;
      p++;
    }
    if (expDigits > 0 && p === e) {
      return 1;
    }
  }

  return 0;
}

/**
 * Parses a guaranteed valid numeric byte slice `buf[start..end]` to a JS number (`float64`)
 * without allocating a string for standard integers and decimals.
 */
function parseAsciiNumber(buf: Uint8Array, start: number, end: number): number {
  let s = start;
  let e = end;
  while (s < e && (buf[s] === 32 || buf[s] === 9)) s++;
  while (e > s && (buf[e - 1] === 32 || buf[e - 1] === 9)) e--;

  let p = s;
  let sign = 1;
  if (buf[p] === 45) {
    sign = -1;
    p++;
  } else if (buf[p] === 43) {
    p++;
  }

  let whole = 0;
  let totalDigits = 0;
  while (p < e && buf[p] >= 48 && buf[p] <= 57) {
    whole = whole * 10 + (buf[p] - 48);
    totalDigits++;
    p++;
  }

  if (p === e) {
    if (totalDigits <= 15) {
      return sign < 0 ? (whole === 0 ? 0 : -whole) : whole;
    }
    return Number(decodeSlice(buf, s, e));
  }

  if (buf[p] === 46) {
    p++;
    let fracDigits = 0;
    while (p < e && buf[p] >= 48 && buf[p] <= 57) {
      whole = whole * 10 + (buf[p] - 48);
      fracDigits++;
      totalDigits++;
      p++;
    }
    if (p === e && totalDigits <= 15 && fracDigits <= 20) {
      const val = whole / POW10[fracDigits];
      return sign < 0 ? (val === 0 ? 0 : -val) : val;
    }
  }

  const str = decodeSlice(buf, s, e);
  if (/^[+-]?inf(?:inity)?$/i.test(str)) {
    return str.startsWith('-') ? -Infinity : Infinity;
  }
  return Number(str);
}

/**
 * Sniffs delimiter (',', '\t', ';', '|') from the first 50 non-empty lines.
 * Mirrors backend/app/ingestion/csv_parser.py and text_parser.py.
 */
function sniffDelimiter(
  buf: Uint8Array,
  startOffset: number,
  fileType: SupportedLocalFileType
): number {
  const sampleEnd = Math.min(buf.length, startOffset + 65536);
  const sampleText = utf8Decoder.decode(buf.subarray(startOffset, sampleEnd));
  const rawLines = sampleText.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length && lines.length < 50; i++) {
    if (rawLines[i].trim().length > 0) {
      lines.push(rawLines[i]);
    }
  }

  if (lines.length === 0) {
    throw new LocalIngestionError('Dataset contains no non-empty lines to parse.', 422);
  }

  const candidates: { char: string; code: number }[] =
    fileType === 'tsv'
      ? [
          { char: '\t', code: 9 },
          { char: ',', code: 44 },
          { char: ';', code: 59 },
          { char: '|', code: 124 },
        ]
      : [
          { char: ',', code: 44 },
          { char: '\t', code: 9 },
          { char: ';', code: 59 },
          { char: '|', code: 124 },
        ];

  let bestCode = fileType === 'tsv' ? 9 : 44;
  let bestScore = -1;

  for (const cand of candidates) {
    // Count delimiter occurrences outside quotes on each sample line
    const counts: number[] = [];
    for (const line of lines) {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === cand.char) {
          count++;
        }
      }
      counts.push(count);
    }

    const firstCount = counts[0];
    if (firstCount <= 0) continue;

    // Measure consistency across lines
    let matchingLines = 0;
    for (const c of counts) {
      if (c === firstCount) matchingLines++;
    }
    const consistency = matchingLines / counts.length;
    if (consistency >= 0.8) {
      const score = consistency * 1000 + Math.min(firstCount, 100);
      if (score > bestScore) {
        bestScore = score;
        bestCode = cand.code;
      }
    }
  }

  // For .txt files, if no consistent delimiter with >= 2 columns was found, check if prose
  if (fileType === 'txt' && bestScore < 0) {
    // Check if whitespace-aligned table (2+ spaces or tabs) with consistent column count >= 2
    const wsCounts = lines.map((l) => l.trim().split(/\s{2,}|\t+/).length);
    const firstWs = wsCounts[0] ?? 0;
    const wsConsistent =
      firstWs >= 2 &&
      wsCounts.filter((c) => c === firstWs).length / wsCounts.length >= 0.8;
    if (!wsConsistent) {
      throw new LocalIngestionError(
        'Unstructured prose text cannot be analyzed as a tabular dataset. Please provide structured CSV, TSV, or fixed-width tabular data.',
        422
      );
    }
    return -1; // Signal whitespace-aligned .txt table
  }

  return bestCode;
}

/**
 * Fallback parser for whitespace-aligned .txt tables (where columns are separated by 2+ spaces).
 */
function parseWhitespaceTxtTable(buf: Uint8Array, startOffset: number): ColumnarFrame {
  const text = utf8Decoder.decode(buf.subarray(startOffset));
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new LocalIngestionError(
      'Dataset contains headers but 0 data rows.',
      422
    );
  }

  const rawHeaders = lines[0].split(/\s{2,}|\t+/);
  if (rawHeaders.length < 2) {
    throw new LocalIngestionError(
      'Unstructured prose text cannot be analyzed as a tabular dataset. Please provide structured CSV, TSV, or fixed-width tabular data.',
      422
    );
  }

  // Re-encode as standard TSV and parse through the main columnar pipeline
  const tsvLines = lines.map((l) => l.split(/\s{2,}|\t+/).join('\t')).join('\n');
  const tsvBytes = new TextEncoder().encode(tsvLines);
  return parseColumnarCsvBytes(tsvBytes, 'csv');
}

/**
 * Parses a CSV/TSV/TXT `Uint8Array` into a `ColumnarFrame`.
 */
export function parseColumnarCsvBytes(
  rawBytes: Uint8Array,
  fileType: SupportedLocalFileType = 'csv',
  onProgress?: (fraction: number) => void
): ColumnarFrame {
  if (!rawBytes || rawBytes.byteLength === 0) {
    throw new LocalIngestionError('Uploaded file is completely empty (0 bytes).', 400);
  }

  // Strip UTF-8 BOM if present (\xEF\xBB\xBF)
  let startOffset = 0;
  if (
    rawBytes.length >= 3 &&
    rawBytes[0] === 0xef &&
    rawBytes[1] === 0xbb &&
    rawBytes[2] === 0xbf
  ) {
    startOffset = 3;
  }

  // Skip leading completely blank lines
  const totalLen = rawBytes.length;
  while (
    startOffset < totalLen &&
    (rawBytes[startOffset] === 10 || rawBytes[startOffset] === 13)
  ) {
    startOffset++;
  }

  if (startOffset >= totalLen) {
    throw new LocalIngestionError(
      'File could not be parsed as CSV: no columns found in file.',
      422
    );
  }

  const delimCode = sniffDelimiter(rawBytes, startOffset, fileType);
  if (delimCode === -1) {
    return parseWhitespaceTxtTable(rawBytes, startOffset);
  }

  //Scratch buffer for unquoting fields that contain quotes
  let unquoteScratch = new Uint8Array(4096);
  const ensureScratch = (needed: number) => {
    if (needed > unquoteScratch.length) {
      let nextCap = unquoteScratch.length;
      while (nextCap < needed) nextCap *= 2;
      unquoteScratch = new Uint8Array(nextCap);
    }
  };

  /**
   * Reads a single RFC 4180 record starting at `pos`.
   * Calls `onField(colIdx, fieldBuf, fieldStart, fieldEnd)` for each field.
   * Returns `{ nextPos, fieldCount, isBlankLine }`.
   */
  const readRecord = (
    pos: number,
    onField: (colIdx: number, fBuf: Uint8Array, fStart: number, fEnd: number) => void
  ): { nextPos: number; fieldCount: number; isBlankLine: boolean } => {
    let p = pos;
    let colIdx = 0;
    const recordStart = pos;

    while (p < totalLen) {
      const b = rawBytes[p];

      if (b === 34) {
        // Quoted field
        p++; // skip opening quote
        let fStart = p;
        let hasEscapedQuotes = false;

        while (p < totalLen) {
          if (rawBytes[p] === 34) {
            if (p + 1 < totalLen && rawBytes[p + 1] === 34) {
              hasEscapedQuotes = true;
              p += 2;
            } else {
              break; // closing quote at p
            }
          } else {
            p++;
          }
        }

        const fEnd = p;
        if (p < totalLen && rawBytes[p] === 34) {
          p++; // skip closing quote
        }

        // Consume any trailing characters until delimiter or newline
        while (
          p < totalLen &&
          rawBytes[p] !== delimCode &&
          rawBytes[p] !== 10 &&
          rawBytes[p] !== 13
        ) {
          p++;
        }

        if (!hasEscapedQuotes) {
          onField(colIdx, rawBytes, fStart, fEnd);
        } else {
          const maxLen = fEnd - fStart;
          ensureScratch(maxLen);
          let outIdx = 0;
          for (let k = fStart; k < fEnd; k++) {
            const ch = rawBytes[k];
            unquoteScratch[outIdx++] = ch;
            if (ch === 34 && k + 1 < fEnd && rawBytes[k + 1] === 34) {
              k++;
            }
          }
          onField(colIdx, unquoteScratch, 0, outIdx);
        }
        colIdx++;

        if (p < totalLen && rawBytes[p] === delimCode) {
          p++;
          if (p === totalLen || rawBytes[p] === 10 || rawBytes[p] === 13) {
            // Trailing delimiter at end of line produces an empty final field
            onField(colIdx, rawBytes, p, p);
            colIdx++;
            if (p < totalLen && rawBytes[p] === 13) p++;
            if (p < totalLen && rawBytes[p] === 10) p++;
            break;
          }
        } else {
          if (p < totalLen && rawBytes[p] === 13) p++;
          if (p < totalLen && rawBytes[p] === 10) p++;
          break;
        }
      } else {
        // Unquoted field
        const fStart = p;
        while (
          p < totalLen &&
          rawBytes[p] !== delimCode &&
          rawBytes[p] !== 10 &&
          rawBytes[p] !== 13
        ) {
          p++;
        }
        const fEnd = p;

        // Check if completely blank line (single empty unquoted field at line end)
        if (
          colIdx === 0 &&
          fStart === fEnd &&
          (p === totalLen || rawBytes[p] === 10 || rawBytes[p] === 13)
        ) {
          if (p < totalLen && rawBytes[p] === 13) p++;
          if (p < totalLen && rawBytes[p] === 10) p++;
          return { nextPos: p, fieldCount: 0, isBlankLine: true };
        }

        onField(colIdx, rawBytes, fStart, fEnd);
        colIdx++;

        if (p < totalLen && rawBytes[p] === delimCode) {
          p++;
          if (p === totalLen || rawBytes[p] === 10 || rawBytes[p] === 13) {
            onField(colIdx, rawBytes, p, p);
            colIdx++;
            if (p < totalLen && rawBytes[p] === 13) p++;
            if (p < totalLen && rawBytes[p] === 10) p++;
            break;
          }
        } else {
          if (p < totalLen && rawBytes[p] === 13) p++;
          if (p < totalLen && rawBytes[p] === 10) p++;
          break;
        }
      }
    }

    if (p === recordStart) {
      return { nextPos: totalLen, fieldCount: 0, isBlankLine: true };
    }
    return { nextPos: p, fieldCount: colIdx, isBlankLine: false };
  };

  // 1. Parse header row
  const rawHeaderList: string[] = [];
  const headerRes = readRecord(startOffset, (_colIdx, fBuf, fStart, fEnd) => {
    rawHeaderList.push(decodeSlice(fBuf, fStart, fEnd));
  });

  const numCols = rawHeaderList.length;
  if (numCols === 0) {
    throw new LocalIngestionError(
      'File could not be parsed as CSV: no columns found in file.',
      422
    );
  }

  const columnNames = deduplicateColumnNames(rawHeaderList);
  const dataStartPos = headerRes.nextPos;

  // 2. Pass 1: Scan rows to determine exact rowCount and column dtypes
  const canBeBool = new Uint8Array(numCols).fill(1);
  const canBeInt = new Uint8Array(numCols).fill(1);
  const canBeFloat = new Uint8Array(numCols).fill(1);
  const nullCounts = new Int32Array(numCols);
  const nonNullCounts = new Int32Array(numCols);

  let validRowCount = 0;
  let pos = dataStartPos;
  let tempFieldCount = 0;

  // Temporary per-row buffer for Pass 1 so we only commit stats if the row is valid (fieldCount <= numCols)
  const rowFStarts = new Int32Array(numCols);
  const rowFEnds = new Int32Array(numCols);
  const rowFBufs: Uint8Array[] = new Array(numCols);

  while (pos < totalLen) {
    tempFieldCount = 0;
    const rec = readRecord(pos, (cIdx, fBuf, fStart, fEnd) => {
      if (cIdx < numCols) {
        rowFBufs[cIdx] = fBuf === unquoteScratch ? fBuf.slice(fStart, fEnd) : fBuf;
        rowFStarts[cIdx] = fBuf === unquoteScratch ? 0 : fStart;
        rowFEnds[cIdx] = fBuf === unquoteScratch ? fEnd - fStart : fEnd;
      }
      tempFieldCount = cIdx + 1;
    });
    pos = rec.nextPos;

    if (rec.isBlankLine) continue;
    // Pandas on_bad_lines="warn" skips lines with more fields than header
    if (tempFieldCount > numCols) continue;

    validRowCount++;
    for (let c = 0; c < numCols; c++) {
      if (c >= tempFieldCount) {
        // Missing trailing field -> NA
        nullCounts[c]++;
        continue;
      }
      const fBuf = rowFBufs[c];
      const fStart = rowFStarts[c];
      const fEnd = rowFEnds[c];

      if (isPandasNABytes(fBuf, fStart, fEnd)) {
        nullCounts[c]++;
        continue;
      }

      nonNullCounts[c]++;

      if (canBeBool[c]) {
        if (parseAsciiBool(fBuf, fStart, fEnd) < 0) {
          canBeBool[c] = 0;
        }
      }

      if (canBeInt[c] || canBeFloat[c]) {
        const numKind = classifyNumericBytes(fBuf, fStart, fEnd);
        if (numKind === 0) {
          canBeInt[c] = 0;
          canBeFloat[c] = 0;
        } else if (numKind === 1) {
          canBeInt[c] = 0;
        }
      }
    }
  }

  if (validRowCount === 0) {
    throw new LocalIngestionError(
      'Dataset contains column headers but 0 data rows.',
      422
    );
  }

  if (onProgress) onProgress(0.5);

  // 3. Determine exact dtype per column and allocate exact-sized typed arrays
  const dtypes: InferredDtype[] = new Array(numCols);
  const numArrays: (Float64Array | null)[] = new Array(numCols).fill(null);
  const codeArrays: (Int32Array | null)[] = new Array(numCols).fill(null);
  const dicts: (string[] | null)[] = new Array(numCols).fill(null);
  const dictMaps: (Map<string, number> | null)[] = new Array(numCols).fill(null);
  const dictCounts: (number[] | null)[] = new Array(numCols).fill(null);
  const charLenSum100 = new Float64Array(numCols);
  const charLenCount100 = new Int32Array(numCols);
  const totalStringBytes = new Float64Array(numCols);

  for (let c = 0; c < numCols; c++) {
    const nn = nonNullCounts[c];
    const nulls = nullCounts[c];
    if (nn === 0) {
      dtypes[c] = 'float64';
      const arr = new Float64Array(validRowCount);
      arr.fill(NaN);
      numArrays[c] = arr;
    } else if (canBeBool[c] && nulls === 0) {
      dtypes[c] = 'bool';
      numArrays[c] = new Float64Array(validRowCount);
    } else if (canBeInt[c] && nulls === 0) {
      dtypes[c] = 'int64';
      numArrays[c] = new Float64Array(validRowCount);
    } else if (canBeFloat[c]) {
      dtypes[c] = 'float64';
      numArrays[c] = new Float64Array(validRowCount);
    } else {
      dtypes[c] = 'str';
      codeArrays[c] = new Int32Array(validRowCount);
      dicts[c] = [''];
      dictMaps[c] = new Map<string, number>();
      dictCounts[c] = [nulls];
    }
  }

  // 4. Pass 2: Populate typed column arrays
  pos = dataStartPos;
  let rowIdx = 0;

  while (pos < totalLen) {
    tempFieldCount = 0;
    const rec = readRecord(pos, (cIdx, fBuf, fStart, fEnd) => {
      if (cIdx < numCols) {
        rowFBufs[cIdx] = fBuf === unquoteScratch ? fBuf.slice(fStart, fEnd) : fBuf;
        rowFStarts[cIdx] = fBuf === unquoteScratch ? 0 : fStart;
        rowFEnds[cIdx] = fBuf === unquoteScratch ? fEnd - fStart : fEnd;
      }
      tempFieldCount = cIdx + 1;
    });
    pos = rec.nextPos;

    if (rec.isBlankLine || tempFieldCount > numCols) continue;

    for (let c = 0; c < numCols; c++) {
      const dtype = dtypes[c];
      if (c >= tempFieldCount) {
        if (dtype !== 'str') {
          numArrays[c]![rowIdx] = NaN;
        } else {
          codeArrays[c]![rowIdx] = 0;
        }
        continue;
      }

      const fBuf = rowFBufs[c];
      const fStart = rowFStarts[c];
      const fEnd = rowFEnds[c];

      if (isPandasNABytes(fBuf, fStart, fEnd)) {
        if (dtype !== 'str') {
          numArrays[c]![rowIdx] = NaN;
        } else {
          codeArrays[c]![rowIdx] = 0;
        }
        continue;
      }

      const byteLen = fEnd - fStart;
      if (charLenCount100[c] < 100) {
        charLenSum100[c] += byteLen;
        charLenCount100[c]++;
      }

      if (dtype === 'bool') {
        numArrays[c]![rowIdx] = parseAsciiBool(fBuf, fStart, fEnd) === 1 ? 1 : 0;
      } else if (dtype === 'int64' || dtype === 'float64') {
        numArrays[c]![rowIdx] = parseAsciiNumber(fBuf, fStart, fEnd);
      } else {
        const strVal = decodeSlice(fBuf, fStart, fEnd);
        totalStringBytes[c] += 50 + strVal.length;
        const dMap = dictMaps[c]!;
        let code = dMap.get(strVal);
        if (code === undefined) {
          const dArr = dicts[c]!;
          code = dArr.length;
          dArr.push(strVal);
          dMap.set(strVal, code);
          dictCounts[c]!.push(1);
        } else {
          dictCounts[c]![code]++;
        }
        codeArrays[c]![rowIdx] = code;
      }
    }

    rowIdx++;
  }

  // 5. Finalize ColumnData objects
  const columns: ColumnData[] = new Array(numCols);
  const columnsByName = new Map<string, ColumnData>();
  let totalMemoryBytes = 132; // DataFrame index overhead

  for (let c = 0; c < numCols; c++) {
    const dtype = dtypes[c];
    const name = columnNames[c];
    const nullCount = nullCounts[c];
    const nonNullCount = nonNullCounts[c];
    const avgCharLen100 =
      charLenCount100[c] > 0 ? charLenSum100[c] / charLenCount100[c] : 0;

    if (dtype === 'str') {
      const dict = dicts[c]!;
      const counts = Int32Array.from(dictCounts[c]!);
      const uniqueCount = dict.length - 1;
      const sampleValues: string[] = [];
      for (let k = 1; k < dict.length && sampleValues.length < 5; k++) {
        sampleValues.push(dict[k]);
      }
      const memoryBytes = Math.round(
        132 + totalStringBytes[c] + nullCount * 32
      );
      totalMemoryBytes += memoryBytes - 132;

      const colData: ColumnData = {
        name,
        dtype,
        rowCount: validRowCount,
        nullCount,
        nonNullCount,
        numValues: null,
        sortedFinite: null,
        codes: codeArrays[c]!,
        dict,
        counts,
        uniqueCount,
        sampleValues,
        memoryBytes,
        avgCharLen100,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    } else if (dtype === 'bool') {
      const numValues = numArrays[c]!;
      const sampleValues: boolean[] = [];
      let seenTrue = false;
      let seenFalse = false;
      for (let r = 0; r < validRowCount && sampleValues.length < 2; r++) {
        const v = numValues[r];
        if (v === 1 && !seenTrue) {
          seenTrue = true;
          sampleValues.push(true);
        } else if (v === 0 && !seenFalse) {
          seenFalse = true;
          sampleValues.push(false);
        }
      }
      const uniqueCount = sampleValues.length;
      const memoryBytes = 132 + validRowCount;
      totalMemoryBytes += validRowCount;

      const colData: ColumnData = {
        name,
        dtype,
        rowCount: validRowCount,
        nullCount,
        nonNullCount,
        numValues,
        sortedFinite: null,
        codes: null,
        dict: null,
        counts: null,
        uniqueCount,
        sampleValues,
        memoryBytes,
        avgCharLen100,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    } else {
      // 'int64' or 'float64'
      const numValues = numArrays[c]!;
      // Collect finite values and first 5 unique sample values
      let finiteCount = 0;
      const sampleValues: number[] = [];
      const sampleSeen = new Set<number>();
      let hasPosInf = false;
      let hasNegInf = false;

      for (let r = 0; r < validRowCount; r++) {
        const v = numValues[r];
        if (!Number.isNaN(v)) {
          if (Number.isFinite(v)) {
            finiteCount++;
          } else if (v > 0) {
            hasPosInf = true;
          } else {
            hasNegInf = true;
          }
          if (sampleValues.length < 5 && !sampleSeen.has(v)) {
            sampleSeen.add(v);
            sampleValues.push(dtype === 'int64' ? Math.trunc(v) : v);
          }
        }
      }

      const sortedFinite = new Float64Array(finiteCount);
      let w = 0;
      for (let r = 0; r < validRowCount; r++) {
        const v = numValues[r];
        if (Number.isFinite(v)) {
          sortedFinite[w++] = v;
        }
      }
      sortedFinite.sort();

      // Count unique finite values in O(N) from sortedFinite
      let uniqueFinite = 0;
      for (let i = 0; i < finiteCount; i++) {
        if (i === 0 || sortedFinite[i] !== sortedFinite[i - 1]) {
          uniqueFinite++;
        }
      }
      const uniqueCount =
        uniqueFinite + (hasPosInf ? 1 : 0) + (hasNegInf ? 1 : 0);

      const memoryBytes = 132 + validRowCount * 8;
      totalMemoryBytes += validRowCount * 8;

      const colData: ColumnData = {
        name,
        dtype,
        rowCount: validRowCount,
        nullCount,
        nonNullCount,
        numValues,
        sortedFinite,
        codes: null,
        dict: null,
        counts: null,
        uniqueCount,
        sampleValues,
        memoryBytes,
        avgCharLen100,
      };
      columns[c] = colData;
      columnsByName.set(name, colData);
    }
  }

  if (onProgress) onProgress(1.0);

  return {
    rowCount: validRowCount,
    columnCount: numCols,
    columnNames,
    columns,
    columnsByName,
    totalMemoryBytes: Math.round(totalMemoryBytes),
  };
}
