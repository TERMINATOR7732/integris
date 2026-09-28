/**
 * INTEGRIS Local Ingestion — Browser-Local PDF Tabular Extractor
 *
 * Mirrors backend/app/ingestion/pdf_parser.py for browser Web Worker execution:
 * - Uses `pdfjs-dist` with an embedded fake-worker (`LoopbackPort`) so it runs
 *   100% locally inside the Web Worker (or Node.js) with zero network requests.
 * - Reconstructs ruled table grids from PDF vector operators (`OPS.constructPath`)
 *   and assigns positioned text runs (`page.getTextContent()`) into table cells.
 * - Applies exact `pdf_parser.py` primary table selection, prose/certificate filtering,
 *   multi-page header deduplication, 1-row continuation page coalescing, and
 *   column-level numeric type inference (`_infer_pdf_column_dtype`).
 * - Rejects scanned/image-only PDFs (< 20 chars) with an explicit OCR unavailable message.
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-expect-error pdf.worker.mjs does not ship standalone TypeScript definitions
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import type { ColumnarFrame, ColumnData, InferredDtype } from './csvParser';
import {
  LocalIngestionError,
  MAX_DATASET_COLUMNS,
  MAX_DATASET_ROWS,
} from './detector';
import { isIdentifierColumnName } from '../engine/profiler';

function ensurePdfjsFakeWorker(): void {
  if (
    typeof globalThis !== 'undefined' &&
    !(globalThis as Record<string, unknown>).pdfjsWorker
  ) {
    (globalThis as Record<string, unknown>).pdfjsWorker = {
      WorkerMessageHandler,
    };
  }
}

export interface PdfIngestionResult {
  frame: ColumnarFrame;
  fileType: 'pdf';
  pageCount: number;
  tableIndex: number;
}

const NUMERIC_LITERAL_PATTERN =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const LEADING_ZERO_ID_PATTERN = /^[+-]?0\d+$/;

interface HSeg {
  y: number;
  xMin: number;
  xMax: number;
}

interface VSeg {
  x: number;
  yMin: number;
  yMax: number;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function multiplyMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function clusterCoords(coords: number[], tol: number = 2.0): number[] {
  if (coords.length === 0) return [];
  const sorted = [...coords].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    const last = clusters[clusters.length - 1];
    if (Math.abs(v - last[last.length - 1]) <= tol) {
      last.push(v);
    } else {
      clusters.push([v]);
    }
  }
  return clusters.map((c) => c.reduce((s, x) => s + x, 0) / c.length);
}

/**
 * Groups horizontal and vertical ruled line segments into connected components
 * so multiple disjoint tables on the same PDF page are extracted separately.
 */
function groupGridComponents(
  hSegs: HSeg[],
  vSegs: VSeg[],
  tol: number = 3.0
): { hSegs: HSeg[]; vSegs: VSeg[]; topY: number }[] {
  const nH = hSegs.length;
  const nV = vSegs.length;
  if (nH === 0 || nV === 0) return [];

  const totalNodes = nH + nV;
  const parent = new Int32Array(totalNodes);
  for (let i = 0; i < totalNodes; i++) parent[i] = i;

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let cur = x;
    while (cur !== root) {
      const nxt = parent[cur];
      parent[cur] = root;
      cur = nxt;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Connect intersecting H and V segments
  for (let i = 0; i < nH; i++) {
    const h = hSegs[i];
    for (let j = 0; j < nV; j++) {
      const v = vSegs[j];
      if (
        v.x >= h.xMin - tol &&
        v.x <= h.xMax + tol &&
        h.y >= v.yMin - tol &&
        h.y <= v.yMax + tol
      ) {
        union(i, nH + j);
      }
    }
  }

  // Connect collinear/touching V segments (e.g., stacked row boxes)
  for (let j1 = 0; j1 < nV; j1++) {
    const v1 = vSegs[j1];
    for (let j2 = j1 + 1; j2 < nV; j2++) {
      const v2 = vSegs[j2];
      if (
        Math.abs(v1.x - v2.x) <= 2.0 &&
        v1.yMin <= v2.yMax + tol &&
        v2.yMin <= v1.yMax + tol
      ) {
        union(nH + j1, nH + j2);
      }
    }
  }

  // Connect collinear/touching H segments (e.g., adjacent cell boxes)
  for (let i1 = 0; i1 < nH; i1++) {
    const h1 = hSegs[i1];
    for (let i2 = i1 + 1; i2 < nH; i2++) {
      const h2 = hSegs[i2];
      if (
        Math.abs(h1.y - h2.y) <= 2.0 &&
        h1.xMin <= h2.xMax + tol &&
        h2.xMin <= h1.xMax + tol
      ) {
        union(i1, i2);
      }
    }
  }

  const compMap = new Map<
    number,
    { hSegs: HSeg[]; vSegs: VSeg[]; topY: number }
  >();

  for (let i = 0; i < nH; i++) {
    const r = find(i);
    let comp = compMap.get(r);
    if (!comp) {
      comp = { hSegs: [], vSegs: [], topY: -Infinity };
      compMap.set(r, comp);
    }
    comp.hSegs.push(hSegs[i]);
    if (hSegs[i].y > comp.topY) comp.topY = hSegs[i].y;
  }

  for (let j = 0; j < nV; j++) {
    const r = find(nH + j);
    const comp = compMap.get(r);
    if (comp) {
      comp.vSegs.push(vSegs[j]);
      if (vSegs[j].yMax > comp.topY) comp.topY = vSegs[j].yMax;
    }
  }

  const components = Array.from(compMap.values()).filter(
    (c) => c.hSegs.length >= 2 && c.vSegs.length >= 2
  );
  // Order top-to-bottom on the page (higher PDF y = higher on page)
  components.sort((a, b) => b.topY - a.topY);
  return components;
}

/**
 * Extracts ruled tables and total character count from a single PDF page.
 */
async function extractPageTablesAndCharCount(
  page: pdfjs.PDFPageProxy
): Promise<{ tables: string[][][]; pageCharCount: number }> {
  const opList = await page.getOperatorList();
  const textContent = await page.getTextContent();

  const OPS = pdfjs.OPS;
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];
  const hSegs: HSeg[] = [];
  const vSegs: VSeg[] = [];

  const addLineSegment = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void => {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dy <= 1.0 && dx >= 5.0) {
      hSegs.push({
        y: (y1 + y2) / 2,
        xMin: Math.min(x1, x2),
        xMax: Math.max(x1, x2),
      });
    } else if (dx <= 1.0 && dy >= 5.0) {
      vSegs.push({
        x: (x1 + x2) / 2,
        yMin: Math.min(y1, y2),
        yMax: Math.max(y1, y2),
      });
    }
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      ctmStack.push([...ctm]);
    } else if (fn === OPS.restore) {
      if (ctmStack.length > 0) {
        ctm = ctmStack.pop()!;
      }
    } else if (fn === OPS.transform) {
      ctm = multiplyMatrix(ctm, args as number[]);
    } else if (fn === OPS.constructPath) {
      const drawingOp = args[0] as number;
      // Ignore clipping-only paths (OPS.endPath = 28)
      if (drawingOp === OPS.endPath) continue;

      const opsBuf = (args[1] as ArrayLike<number>[])?.[0];
      if (!opsBuf) continue;

      let p = 0;
      let curX = 0;
      let curY = 0;
      let startX = 0;
      let startY = 0;

      while (p < opsBuf.length) {
        const segOp = opsBuf[p++];
        if (segOp === 0) {
          // moveTo
          const [tx, ty] = applyMatrix(ctm, opsBuf[p++], opsBuf[p++]);
          curX = tx;
          curY = ty;
          startX = tx;
          startY = ty;
        } else if (segOp === 1) {
          // lineTo
          const [tx, ty] = applyMatrix(ctm, opsBuf[p++], opsBuf[p++]);
          addLineSegment(curX, curY, tx, ty);
          curX = tx;
          curY = ty;
        } else if (segOp === 2) {
          // curveTo (6 args)
          p += 4;
          const [tx, ty] = applyMatrix(ctm, opsBuf[p++], opsBuf[p++]);
          curX = tx;
          curY = ty;
        } else if (segOp === 3) {
          // closePath
          addLineSegment(curX, curY, startX, startY);
          curX = startX;
          curY = startY;
        } else if (segOp === 4) {
          // rectangle (x, y, w, h)
          const rx = opsBuf[p++];
          const ry = opsBuf[p++];
          const rw = opsBuf[p++];
          const rh = opsBuf[p++];
          const [p1x, p1y] = applyMatrix(ctm, rx, ry);
          const [p2x, p2y] = applyMatrix(ctm, rx + rw, ry);
          const [p3x, p3y] = applyMatrix(ctm, rx + rw, ry + rh);
          const [p4x, p4y] = applyMatrix(ctm, rx, ry + rh);
          addLineSegment(p1x, p1y, p2x, p2y);
          addLineSegment(p2x, p2y, p3x, p3y);
          addLineSegment(p3x, p3y, p4x, p4y);
          addLineSegment(p4x, p4y, p1x, p1y);
        } else {
          break;
        }
      }
    }
  }

  let pageCharCount = 0;
  const textItems: PositionedTextItem[] = [];
  for (const rawItem of textContent.items) {
    if (!('str' in rawItem)) continue;
    const str = rawItem.str;
    pageCharCount += str.trim().length;
    if (str.length === 0) continue;

    const tr = rawItem.transform as number[];
    const x = tr[4];
    const y = tr[5];
    const w = rawItem.width || 0;
    const h = rawItem.height || Math.abs(tr[3]) || 10;
    textItems.push({ str, x, y, w, h });
  }

  const components = groupGridComponents(hSegs, vSegs, 3.0);
  const tables: string[][][] = [];

  for (const comp of components) {
    const xCoords = clusterCoords(
      comp.vSegs.map((v) => v.x),
      2.0
    );
    const yCoords = clusterCoords(
      comp.hSegs.map((h) => h.y),
      2.0
    ).reverse(); // Top-to-bottom (descending PDF Y)

    if (xCoords.length < 3 || yCoords.length < 2) {
      continue;
    }

    const numRows = yCoords.length - 1;
    const numCols = xCoords.length - 1;
    const cellItems: PositionedTextItem[][][] = Array.from(
      { length: numRows },
      () => Array.from({ length: numCols }, () => [])
    );

    for (const item of textItems) {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h * 0.35;

      let cIdx = -1;
      for (let c = 0; c < numCols; c++) {
        if (cx >= xCoords[c] - 2.0 && cx <= xCoords[c + 1] + 2.0) {
          cIdx = c;
          break;
        }
      }

      let rIdx = -1;
      for (let r = 0; r < numRows; r++) {
        if (cy <= yCoords[r] + 2.0 && cy >= yCoords[r + 1] - 2.0) {
          rIdx = r;
          break;
        }
      }

      if (rIdx >= 0 && cIdx >= 0) {
        cellItems[rIdx][cIdx].push(item);
      }
    }

    const table: string[][] = Array.from({ length: numRows }, (_, r) =>
      Array.from({ length: numCols }, (__, c) => {
        const items = cellItems[r][c];
        if (items.length === 0) return '';
        items.sort((a, b) => {
          if (Math.abs(a.y - b.y) > 3.0) return b.y - a.y;
          return a.x - b.x;
        });

        let text = items[0].str;
        for (let k = 1; k < items.length; k++) {
          const prev = items[k - 1];
          const cur = items[k];
          if (Math.abs(cur.y - prev.y) > 3.0) {
            text += '\n' + cur.str;
          } else {
            const gap = cur.x - (prev.x + prev.w);
            if (gap > 2.0 && !text.endsWith(' ') && !cur.str.startsWith(' ')) {
              text += ' ' + cur.str;
            } else {
              text += cur.str;
            }
          }
        }
        return text.trim();
      })
    );

    tables.push(table);
  }

  return { tables, pageCharCount };
}

/**
 * Builds a `ColumnarFrame` from extracted PDF string columns, applying
 * `_infer_pdf_column_dtype` from `backend/app/ingestion/pdf_parser.py`.
 */
function buildPdfColumnarFrame(
  columnNames: string[],
  rawStringColumns: string[][]
): ColumnarFrame {
  const numCols = columnNames.length;
  const rowCount = numCols > 0 ? rawStringColumns[0].length : 0;

  if (numCols === 0 || rowCount === 0) {
    throw new LocalIngestionError(
      'Extracted PDF table contains no usable rows or columns after cleaning.',
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
    const name = columnNames[c];
    const colStrs = rawStringColumns[c];

    // Check if column qualifies for numeric coercion (`_infer_pdf_column_dtype`)
    let canCoerceNumeric = !isIdentifierColumnName(name);
    let nonEmptyCount = 0;
    let hasDecimalOrExp = false;

    if (canCoerceNumeric) {
      for (let r = 0; r < rowCount; r++) {
        const s = colStrs[r].trim();
        if (s === '') continue;
        nonEmptyCount++;
        if (LEADING_ZERO_ID_PATTERN.test(s) || !NUMERIC_LITERAL_PATTERN.test(s)) {
          canCoerceNumeric = false;
          break;
        }
        if (s.includes('.') || s.includes('e') || s.includes('E')) {
          hasDecimalOrExp = true;
        }
      }
      if (nonEmptyCount === 0) {
        canCoerceNumeric = false;
      }
    }

    if (canCoerceNumeric) {
      const hasEmpty = nonEmptyCount < rowCount;
      const dtype: InferredDtype =
        !hasEmpty && !hasDecimalOrExp ? 'int64' : 'float64';
      const numValues = new Float64Array(rowCount);
      let nullCount = 0;
      let nonNullCount = 0;
      let finiteCount = 0;
      const sampleValues: number[] = [];
      const sampleSeen = new Set<number>();
      let charLenSum100 = 0;
      let charLenCount100 = 0;

      for (let r = 0; r < rowCount; r++) {
        const s = colStrs[r].trim();
        if (s === '') {
          numValues[r] = NaN;
          nullCount++;
        } else {
          const num = Number(s);
          numValues[r] = num;
          nonNullCount++;
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
    } else {
      // String column: in `pdf_parser.py`, empty cells remain `""` (not NaN),
      // so `null_count = 0` and `completeness.py` detects `""` via `empty_str_count`.
      const codes = new Int32Array(rowCount);
      const dict: string[] = ['']; // dict[0] reserved for null (unused when nullCount === 0)
      const dictMap = new Map<string, number>();
      const dictCounts: number[] = [0];
      const sampleValues: string[] = [];
      let charLenSum100 = 0;
      let charLenCount100 = 0;
      let strBytes = 0;

      for (let r = 0; r < rowCount; r++) {
        const strVal = colStrs[r];
        let code = dictMap.get(strVal);
        if (code === undefined) {
          code = dict.length;
          dict.push(strVal);
          dictMap.set(strVal, code);
          dictCounts.push(1);
          if (sampleValues.length < 5) {
            sampleValues.push(strVal);
          }
        } else {
          dictCounts[code]++;
        }
        codes[r] = code;

        if (charLenCount100 < 100) {
          charLenSum100 += strVal.length;
          charLenCount100++;
        }
        strBytes += 50 + strVal.length;
      }

      const memoryBytes = Math.round(132 + strBytes);
      totalMemoryBytes += memoryBytes - 132;

      const colData: ColumnData = {
        name,
        dtype: 'str',
        rowCount,
        nullCount: 0,
        nonNullCount: rowCount,
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
 * Extracts structured tabular data from PDF bytes inside a browser Web Worker or Node.js.
 */
export async function parsePdfBytes(
  fileBytes: Uint8Array,
  onProgress?: (fraction: number) => void
): Promise<PdfIngestionResult> {
  ensurePdfjsFakeWorker();
  let loadingTask: pdfjs.PDFDocumentLoadingTask | null = null;
  let doc: pdfjs.PDFDocumentProxy;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fileBytes),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    doc = await loadingTask.promise;
  } catch {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // ignore cleanup error on failed load
      }
    }
    throw new LocalIngestionError(
      'Unable to read PDF document. The file may be corrupted, malformed, or encrypted.',
      400
    );
  }

  try {
    const pageCount = doc.numPages;
    if (pageCount === 0) {
      throw new LocalIngestionError('PDF document contains 0 pages.', 400);
    }

    const allTables: [number, string[][]][] = [];
    let totalExtractedChars = 0;

    for (let pIdx = 0; pIdx < pageCount; pIdx++) {
      const page = await doc.getPage(pIdx + 1);
      const { tables, pageCharCount } = await extractPageTablesAndCharCount(page);
      totalExtractedChars += pageCharCount;
      for (const tbl of tables) {
        allTables.push([pIdx, tbl]);
      }
      if (onProgress) {
        onProgress((pIdx + 1) / pageCount);
      }
    }

    if (allTables.length === 0) {
      if (totalExtractedChars < 20) {
        throw new LocalIngestionError(
          'This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document.',
          400
        );
      }
      throw new LocalIngestionError(
        'No valid structured data tables were detected in the PDF document.',
        400
      );
    }

    // Select primary table (matching `pdf_parser.py` lines 60-85)
    let primaryTable: string[][] | null = null;
    let primaryPageIdx = -1;

    for (const [pageIdx, tbl] of allTables) {
      if (!tbl || tbl.length < 2) continue;
      if (!tbl[0] || tbl[0].length < 2) continue;

      let nonEmptyCells = 0;
      let totalCellChars = 0;
      let totalCellNewlines = 0;

      for (const row of tbl) {
        if (!row) continue;
        for (const cell of row) {
          const trimmed = cell ? cell.trim() : '';
          if (trimmed.length > 0) {
            nonEmptyCells++;
            totalCellChars += trimmed.length;
            for (let k = 0; k < trimmed.length; k++) {
              if (trimmed[k] === '\n') totalCellNewlines++;
            }
          }
        }
      }

      if (nonEmptyCells < 4) continue;

      const avgLen = totalCellChars / Math.max(1, nonEmptyCells);
      const avgNewlines = totalCellNewlines / Math.max(1, nonEmptyCells);
      if (avgNewlines > 2 || (avgLen > 80 && tbl.length < 5)) {
        continue;
      }

      primaryTable = tbl;
      primaryPageIdx = pageIdx;
      break;
    }

    if (!primaryTable) {
      throw new LocalIngestionError(
        'PDF tables detected were empty or lacked sufficient rows and columns.',
        400
      );
    }

    // Normalize and deduplicate headers (matching `pdf_parser.py` lines 108-128)
    const colCount = primaryTable[0].length;
    const rawHeaders = primaryTable[0];
    const normPrimary = rawHeaders.map((h) => (h ? h.trim() : ''));
    const cleanHeaders = rawHeaders.map((h, i) =>
      h && h.trim() ? h.trim() : `col_${i + 1}`
    );

    const seen = new Map<string, number>();
    const dedupHeaders: string[] = [];
    for (const h of cleanHeaders) {
      const prev = seen.get(h);
      if (prev !== undefined) {
        const next = prev + 1;
        seen.set(h, next);
        dedupHeaders.push(`${h}_${next}`);
      } else {
        seen.set(h, 0);
        dedupHeaders.push(h);
      }
    }

    // Coalesce rows across continuation tables on subsequent pages (`pdf_parser.py` lines 129-166)
    const coalescedRows: string[][] = [];
    let foundPrimary = false;

    for (const [pageIdx, tbl] of allTables) {
      if (!tbl || tbl.length < 1 || !tbl[0] || tbl[0].length !== colCount) {
        continue;
      }

      if (!foundPrimary && tbl === primaryTable) {
        foundPrimary = true;
        for (let r = 1; r < tbl.length; r++) {
          const row = tbl[r];
          if (row && row.some((cell) => cell && cell.trim().length > 0)) {
            coalescedRows.push(
              Array.from({ length: colCount }, (_, c) =>
                row[c] ? row[c].trim() : ''
              )
            );
          }
        }
        continue;
      }

      if (foundPrimary) {
        let nonEmptyCells = 0;
        let totalCellChars = 0;
        let totalCellNewlines = 0;

        for (const row of tbl) {
          if (!row) continue;
          for (const cell of row) {
            const trimmed = cell ? cell.trim() : '';
            if (trimmed.length > 0) {
              nonEmptyCells++;
              totalCellChars += trimmed.length;
              for (let k = 0; k < trimmed.length; k++) {
                if (trimmed[k] === '\n') totalCellNewlines++;
              }
            }
          }
        }

        if (nonEmptyCells === 0) continue;

        const avgLen = totalCellChars / nonEmptyCells;
        const avgNewlines = totalCellNewlines / nonEmptyCells;
        const tblHeaders = tbl[0].map((h) => (h ? h.trim() : ''));
        const headersMatch =
          tblHeaders.length === normPrimary.length &&
          tblHeaders.every((val, idx) => val === normPrimary[idx]);

        if (tbl.length >= 2) {
          if (nonEmptyCells < 4) continue;
          if (avgNewlines > 2 || (avgLen > 80 && tbl.length < 5)) continue;
          const startIdx = headersMatch ? 1 : 0;
          for (let r = startIdx; r < tbl.length; r++) {
            const row = tbl[r];
            if (row && row.some((cell) => cell && cell.trim().length > 0)) {
              coalescedRows.push(
                Array.from({ length: colCount }, (_, c) =>
                  row[c] ? row[c].trim() : ''
                )
              );
            }
          }
        } else if (tbl.length === 1 && pageIdx > primaryPageIdx) {
          if (headersMatch) continue;
          if (nonEmptyCells < 2 || avgNewlines > 2 || avgLen > 80) continue;
          const row = tbl[0];
          if (row && row.some((cell) => cell && cell.trim().length > 0)) {
            coalescedRows.push(
              Array.from({ length: colCount }, (_, c) =>
                row[c] ? row[c].trim() : ''
              )
            );
          }
        }
      }
    }

    if (coalescedRows.length === 0) {
      throw new LocalIngestionError(
        'This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document.',
        400
      );
    }

    const rawStringColumns = dedupHeaders.map((__, cIdx) =>
      coalescedRows.map((row) => row[cIdx] ?? '')
    );

    const frame = buildPdfColumnarFrame(dedupHeaders, rawStringColumns);
    return {
      frame,
      fileType: 'pdf',
      pageCount,
      tableIndex: 1,
    };
  } finally {
    try {
      await doc.cleanup();
      await loadingTask.destroy();
    } catch {
      // ignore cleanup error
    }
  }
}
