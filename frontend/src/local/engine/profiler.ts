/**
 * INTEGRIS Local Engine — Dataset & Column Profiler
 * Mirrors backend/app/engine/profiler.py with 100% mathematical & heuristic parity.
 */

import type { ColumnProfile, DatasetSummary, SemanticType } from '../../types/integris';
import type { ColumnarFrame, ColumnData } from '../ingestion/csvParser';

const IDENTIFIER_TOKENS = new Set([
  'id',
  'uuid',
  'guid',
  'key',
  'code',
  'token',
  'hash',
  'serial',
  'sku',
  'ssn',
  'isbn',
]);

const BOOLEAN_STR_SET = new Set([
  'true',
  'false',
  '0',
  '1',
  'yes',
  'no',
  't',
  'f',
]);

const DATE_REGEX =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(\s+\d{1,2}:\d{2}(:\d{2})?)?/;

export function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Computes linear-interpolated quantile on a sorted Float64Array, matching
 * pandas.Series.quantile(q, method='linear').
 */
export function quantileSorted(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

export function isIdentifierColumnName(colName: string): boolean {
  const lower = colName.toLowerCase();
  if (lower.endsWith('id')) return true;
  const tokens = lower.split(/[^a-z0-9]+/);
  for (const t of tokens) {
    if (t && IDENTIFIER_TOKENS.has(t)) return true;
  }
  return false;
}

function inferSemanticType(col: ColumnData, totalRows: number): SemanticType {
  if (col.nonNullCount === 0) {
    return 'unknown';
  }

  const validCount = col.nonNullCount;
  const uniqueCount = col.uniqueCount;
  const uniqueRatio = validCount > 0 ? uniqueCount / validCount : 0;
  const nullRatio = totalRows > 0 ? col.nullCount / totalRows : 0;

  // 1. Boolean detection
  if (col.dtype === 'bool') {
    return 'boolean';
  }

  if (uniqueCount <= 2) {
    let allBoolLike = true;
    if (col.dtype === 'str') {
      const dict = col.dict!;
      for (let k = 1; k < dict.length; k++) {
        if (!BOOLEAN_STR_SET.has(dict[k].trim().toLowerCase())) {
          allBoolLike = false;
          break;
        }
      }
    } else {
      for (const sv of col.sampleValues) {
        if (!BOOLEAN_STR_SET.has(String(sv).trim().toLowerCase())) {
          allBoolLike = false;
          break;
        }
      }
    }
    if (allBoolLike && uniqueCount > 0) {
      return 'boolean';
    }
  }

  // 3. Datetime heuristic (on non-numeric columns, first 20 non-null values in row order)
  if (col.dtype === 'str') {
    const codes = col.codes!;
    const dict = col.dict!;
    let sampleChecked = 0;
    let matches = 0;
    for (let r = 0; r < col.rowCount && sampleChecked < 20; r++) {
      const code = codes[r];
      if (code > 0) {
        sampleChecked++;
        if (DATE_REGEX.test(dict[code].trim())) {
          matches++;
        }
      }
    }
    if (
      sampleChecked > 0 &&
      matches >= Math.min(3, sampleChecked) &&
      matches / sampleChecked > 0.6
    ) {
      return 'datetime';
    }
  }

  // 4. Pre-compute string length / prose characteristics on first 200 unique values
  let avgLen = 0.0;
  let isProseLike = false;
  if (col.dtype === 'str') {
    const dict = col.dict!;
    const sampleCount = Math.min(dict.length - 1, 200);
    if (sampleCount > 0) {
      let lenSum = 0;
      let spaceSum = 0;
      for (let k = 1; k <= sampleCount; k++) {
        const s = dict[k];
        lenSum += s.length;
        for (let i = 0; i < s.length; i++) {
          if (s.charCodeAt(i) === 32) spaceSum++;
        }
      }
      avgLen = lenSum / sampleCount;
      const avgSpaces = spaceSum / sampleCount;
      isProseLike = avgLen > 60 || avgSpaces >= 2.0;
    }
  }

  // 5. Identifier heuristic (only strings or integers with near-zero nulls)
  const isFloatDtype = col.dtype === 'float64';
  if (!isFloatDtype && nullRatio <= 0.05) {
    if (
      isIdentifierColumnName(col.name) &&
      (uniqueRatio > 0.9 || uniqueCount === totalRows) &&
      avgLen <= 60
    ) {
      return 'identifier';
    }
    if (
      totalRows >= 5 &&
      uniqueRatio === 1.0 &&
      validCount >= totalRows * 0.95 &&
      !isProseLike
    ) {
      return 'identifier';
    }
  }

  // 6. Numeric types
  if (col.dtype === 'float64') {
    return 'numeric_continuous';
  }
  if (col.dtype === 'int64') {
    if (uniqueCount <= 10 && uniqueRatio < 0.05) {
      return 'categorical';
    }
    if (uniqueCount > 20) {
      return 'numeric_continuous';
    }
    return 'numeric_discrete';
  }

  // 7. Categorical vs Free Text
  if (avgLen > 60 || (isProseLike && uniqueRatio > 0.5)) {
    return 'free_text';
  }
  if (uniqueRatio < 0.2 || uniqueCount <= 50) {
    return 'categorical';
  }
  return 'free_text';
}

function rowsEqual(frame: ColumnarFrame, r1: number, r2: number): boolean {
  const cols = frame.columns;
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    if (col.dtype === 'str') {
      if (col.codes![r1] !== col.codes![r2]) return false;
    } else {
      const v1 = col.numValues![r1];
      const v2 = col.numValues![r2];
      if (v1 !== v2) {
        if (!(Number.isNaN(v1) && Number.isNaN(v2))) return false;
      }
    }
  }
  return true;
}

/**
 * Counts exact duplicate rows across all columns (`df.duplicated(keep='first').sum()`).
 * Uses cardinality short-circuiting and 32-bit FNV-1a row hashing for O(N) execution.
 */
export function countExactDuplicateRows(frame: ColumnarFrame): number {
  const { rowCount, columns } = frame;
  if (rowCount <= 1 || columns.length === 0) return 0;

  // Short-circuit 1: If any column has 0 nulls and 100% unique values, no duplicate rows can exist
  let bestStrCol: ColumnData | null = null;
  for (const col of columns) {
    if (col.nullCount === 0 && col.uniqueCount === rowCount) {
      return 0;
    }
    if (
      col.dtype === 'str' &&
      (!bestStrCol || col.uniqueCount > bestStrCol.uniqueCount)
    ) {
      bestStrCol = col;
    }
  }

  // Hash buckets mapping 32-bit row hash -> list of first-seen distinct row indices
  const buckets = new Map<number, number[]>();
  let dupCount = 0;

  const filterCodes = bestStrCol ? bestStrCol.codes! : null;
  const filterCounts = bestStrCol ? bestStrCol.counts! : null;

  for (let r = 0; r < rowCount; r++) {
    // Short-circuit 2: If row `r` has a unique string value in `bestStrCol` (count === 1),
    // it cannot possibly match any other row!
    if (filterCodes && filterCounts) {
      const code = filterCodes[r];
      if (code > 0 && filterCounts[code] === 1) {
        continue;
      }
    }

    // Compute 32-bit FNV-1a hash of row `r`
    let h = 2166136261;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      let valHash = 0;
      if (col.dtype === 'str') {
        valHash = col.codes![r];
      } else {
        const v = col.numValues![r];
        valHash = Number.isNaN(v) ? -999999937 : (v * 2654435761) | 0;
      }
      h ^= valHash;
      h = Math.imul(h, 16777619);
    }

    const bucket = buckets.get(h);
    if (!bucket) {
      buckets.set(h, [r]);
    } else {
      let matched = false;
      for (let i = 0; i < bucket.length; i++) {
        if (rowsEqual(frame, r, bucket[i])) {
          matched = true;
          break;
        }
      }
      if (matched) {
        dupCount++;
      } else {
        bucket.push(r);
      }
    }
  }

  return dupCount;
}

/**
 * Generates DatasetSummary and ColumnProfile[] matching backend/app/engine/profiler.py.
 */
export function profileDataset(frame: ColumnarFrame): {
  summary: DatasetSummary;
  profiles: ColumnProfile[];
} {
  const totalRows = frame.rowCount;
  const totalCols = frame.columnCount;
  const totalCells = totalRows * totalCols;

  let totalMissing = 0;
  const profiles: ColumnProfile[] = [];

  for (const col of frame.columns) {
    const nullCount = col.nullCount;
    const nonNullCount = col.nonNullCount;
    totalMissing += nullCount;

    const nullRatio = totalRows > 0 ? roundTo(nullCount / totalRows, 6) : 0.0;
    const uniqueCount = col.uniqueCount;
    const uniqueRatio =
      nonNullCount > 0 ? roundTo(uniqueCount / nonNullCount, 6) : 0.0;

    const semanticType = inferSemanticType(col, totalRows);
    const isCandidateId = semanticType === 'identifier';
    const isConstant =
      nonNullCount > 0 && (uniqueCount <= 1 || uniqueRatio < 0.001);

    let minVal: string | number | boolean | null = null;
    let maxVal: string | number | boolean | null = null;
    let meanVal: number | null = null;
    let medianVal: number | null = null;
    let stdVal: number | null = null;

    if (col.dtype === 'bool' && nonNullCount > 0) {
      const nums = col.numValues!;
      let sum = 0;
      for (let r = 0; r < totalRows; r++) {
        sum += nums[r];
      }
      minVal = sum === nonNullCount ? true : false;
      maxVal = sum > 0 ? true : false;
      const rawMean = sum / nonNullCount;
      meanVal = roundTo(rawMean, 4);
      const rawMedian =
        sum > nonNullCount / 2
          ? 1.0
          : sum * 2 === nonNullCount
          ? 0.5
          : 0.0;
      medianVal = roundTo(rawMedian, 4);
      if (nonNullCount > 1) {
        const variance =
          (sum * Math.pow(1 - rawMean, 2) +
            (nonNullCount - sum) * Math.pow(0 - rawMean, 2)) /
          (nonNullCount - 1);
        stdVal = roundTo(Math.sqrt(variance), 4);
      }
    } else if (
      (col.dtype === 'int64' || col.dtype === 'float64') &&
      col.sortedFinite &&
      col.sortedFinite.length > 0
    ) {
      const sorted = col.sortedFinite;
      const n = sorted.length;
      const rawMin = sorted[0];
      const rawMax = sorted[n - 1];
      minVal = col.dtype === 'int64' ? Math.trunc(rawMin) : roundTo(rawMin, 4);
      maxVal = col.dtype === 'int64' ? Math.trunc(rawMax) : roundTo(rawMax, 4);

      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += sorted[i];
      }
      const rawMean = sum / n;
      meanVal = roundTo(rawMean, 4);
      medianVal = roundTo(quantileSorted(sorted, 0.5), 4);

      if (n > 1) {
        let sqDiffSum = 0;
        for (let i = 0; i < n; i++) {
          const d = sorted[i] - rawMean;
          sqDiffSum += d * d;
        }
        stdVal = roundTo(Math.sqrt(sqDiffSum / (n - 1)), 4);
      }
    }

    profiles.push({
      name: col.name,
      inferred_dtype: col.inferredDtypeOverride ?? col.dtype,
      semantic_type: semanticType,
      non_null_count: nonNullCount,
      null_count: nullCount,
      null_ratio: nullRatio,
      unique_count: uniqueCount,
      unique_ratio: uniqueRatio,
      sample_values: col.sampleValues,
      anomalies_detected: 0,
      min_value: minVal,
      max_value: maxVal,
      mean: meanVal,
      median: medianVal,
      std_dev: stdVal,
      memory_bytes: col.memoryBytes,
      is_candidate_identifier: isCandidateId,
      is_constant_or_near_constant: isConstant,
    });
  }

  const duplicateRows = countExactDuplicateRows(frame);
  const dupRatio = totalRows > 0 ? roundTo(duplicateRows / totalRows, 6) : 0.0;
  const missingRatio =
    totalCells > 0 ? roundTo(totalMissing / totalCells, 6) : 0.0;

  const summary: DatasetSummary = {
    total_cells: totalCells,
    missing_cells: totalMissing,
    missing_cell_ratio: missingRatio,
    duplicate_rows: duplicateRows,
    duplicate_row_ratio: dupRatio,
    memory_usage_bytes: frame.totalMemoryBytes,
  };

  return { summary, profiles };
}
