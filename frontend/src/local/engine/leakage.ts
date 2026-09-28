/**
 * INTEGRIS Local Engine — Target Leakage & Proxy Feature Analyzer
 * Mirrors backend/app/engine/leakage.py with 100% mathematical parity.
 */

import type { ColumnProfile, Finding, Severity } from '../../types/integris';
import type { ColumnarFrame, ColumnData } from '../ingestion/csvParser';
import { roundTo } from './profiler';

function getCellString(col: ColumnData, r: number): string | null {
  if (col.dtype === 'str') {
    const code = col.codes![r];
    return code === 0 ? null : col.dict![code];
  }
  const v = col.numValues![r];
  if (Number.isNaN(v)) return null;
  if (col.dtype === 'bool') return v === 1 ? 'True' : 'False';
  if (col.dtype === 'int64') return String(Math.trunc(v));
  return String(v);
}

function computePearson(x: Float64Array, y: Float64Array): number | null {
  const n = x.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX <= 0 || denY <= 0) return null;
  const r = num / Math.sqrt(denX * denY);
  return Number.isFinite(r) ? r : null;
}

function computeAverageRanks(arr: Float64Array): Float64Array {
  const n = arr.length;
  const indices = new Int32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  indices.sort((a, b) => arr[a] - arr[b]);

  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && arr[indices[j]] === arr[indices[i]]) j++;
    const avgRank = (i + 1 + j) / 2.0;
    for (let k = i; k < j; k++) {
      ranks[indices[k]] = avgRank;
    }
    i = j;
  }
  return ranks;
}

function computeSpearman(x: Float64Array, y: Float64Array): number | null {
  const rankX = computeAverageRanks(x);
  const rankY = computeAverageRanks(y);
  return computePearson(rankX, rankY);
}

function computeCramersV(
  aVals: string[],
  bVals: string[]
): { cramerV: number; shape: [number, number] } {
  const n = aVals.length;
  if (n === 0) return { cramerV: 0, shape: [0, 0] };

  const rowIndexMap = new Map<string, number>();
  const colIndexMap = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const a = aVals[i];
    const b = bVals[i];
    if (!rowIndexMap.has(a)) rowIndexMap.set(a, rowIndexMap.size);
    if (!colIndexMap.has(b)) colIndexMap.set(b, colIndexMap.size);
  }

  const R = rowIndexMap.size;
  const C = colIndexMap.size;
  if (R <= 1 || C <= 1) return { cramerV: 0, shape: [R, C] };

  const table = new Float64Array(R * C);
  const rowSums = new Float64Array(R);
  const colSums = new Float64Array(C);

  for (let i = 0; i < n; i++) {
    const rIdx = rowIndexMap.get(aVals[i])!;
    const cIdx = colIndexMap.get(bVals[i])!;
    table[rIdx * C + cIdx]++;
    rowSums[rIdx]++;
    colSums[cIdx]++;
  }

  let chi2 = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const expected = (rowSums[r] * colSums[c]) / n;
      if (expected > 0) {
        const diff = table[r * C + c] - expected;
        chi2 += (diff * diff) / expected;
      }
    }
  }

  const denom = n * Math.min(R - 1, C - 1);
  if (denom <= 0) return { cramerV: 0, shape: [R, C] };
  return { cramerV: Math.sqrt(chi2 / denom), shape: [R, C] };
}

export function analyzeLeakage(
  frame: ColumnarFrame,
  profiles: ColumnProfile[],
  targetColumn?: string | null
): Finding[] {
  const findings: Finding[] = [];
  if (!targetColumn) return findings;

  const targetCol = frame.columnsByName.get(targetColumn);
  if (!targetCol) return findings;

  const totalRows = frame.rowCount;
  if (totalRows < 5) return findings;

  const isTargetNumeric = targetCol.dtype !== 'str';
  const colProfileMap = new Map<string, ColumnProfile>();
  for (const p of profiles) colProfileMap.set(p.name, p);

  for (const colName of frame.columnNames) {
    if (colName === targetColumn) continue;
    const col = frame.columnsByName.get(colName);
    const profile = colProfileMap.get(colName);
    if (!col) continue;

    const isId = Boolean(profile?.is_candidate_identifier);

    // Collect paired non-null rows
    const pairedColStrs: string[] = [];
    const pairedTargetStrs: string[] = [];
    const pairedRows: number[] = [];

    for (let r = 0; r < totalRows; r++) {
      const sCol = getCellString(col, r);
      const sTgt = getCellString(targetCol, r);
      if (sCol !== null && sTgt !== null) {
        pairedColStrs.push(sCol);
        pairedTargetStrs.push(sTgt);
        pairedRows.push(r);
      }
    }

    const nPaired = pairedRows.length;

    // 1. Exact or Near-Duplicate Target Proxy
    if (nPaired >= 10) {
      let matchCount = 0;
      for (let i = 0; i < nPaired; i++) {
        if (
          pairedColStrs[i].trim().toLowerCase() ===
          pairedTargetStrs[i].trim().toLowerCase()
        ) {
          matchCount++;
        }
      }
      const matchRate = matchCount / nPaired;
      if (matchRate >= 0.95) {
        findings.push({
          id: `FND-LKG-PROXY-${colName}`,
          category: 'data_leakage',
          severity: 'critical',
          title: `Potential target leakage indicator: Near-identical target proxy in '${colName}' (${(matchRate * 100).toFixed(1)}% identity)`,
          description: `Column '${colName}' matches target column '${targetColumn}' in ${(matchRate * 100).toFixed(1)}% of observed records. Features that duplicate or directly mirror the prediction target create artificial near-perfect evaluation metrics in development but produce catastrophic generalization failure in production.`,
          affected_columns: [colName, targetColumn],
          affected_row_count: Math.floor(matchRate * nPaired),
          affected_row_ratio: roundTo(matchRate, 4),
          evidence: [
            {
              metric_name: 'target_identity_ratio',
              observed_value: roundTo(matchRate, 4),
              threshold_or_expected: '< 0.90',
              sample_row_indices: pairedRows.slice(0, 10),
              sample_values: pairedRows
                .slice(0, 5)
                .map((_, i) => ({
                  feature: pairedColStrs[i],
                  target: pairedTargetStrs[i],
                })),
              details:
                'Extreme value alignment indicates feature was likely derived from or recorded concurrently with the target.',
            },
          ],
          recommendations: [
            {
              finding_id: `FND-LKG-PROXY-${colName}`,
              action: `Exclude '${colName}' from model feature sets unless its operational availability at inference time is guaranteed.`,
              reason: 'Target proxies induce severe training-serving skew.',
              priority: 'critical',
            },
          ],
        });
        continue;
      }
    }

    // 2. Extreme Numeric Correlation (Pearson & Spearman)
    if (isTargetNumeric && col.dtype !== 'str') {
      const colNums = col.numValues!;
      const tgtNums = targetCol.numValues!;
      const validX: number[] = [];
      const validY: number[] = [];

      for (const r of pairedRows) {
        const vx = colNums[r];
        const vy = tgtNums[r];
        if (Number.isFinite(vx) && Number.isFinite(vy)) {
          validX.push(vx);
          validY.push(vy);
        }
      }

      if (validX.length >= 10 && !isId) {
        const arrX = Float64Array.from(validX);
        const arrY = Float64Array.from(validY);
        const rPearson = computePearson(arrX, arrY);
        const rSpearman = computeSpearman(arrX, arrY);
        const corrs = [rPearson, rSpearman]
          .filter((c): c is number => c !== null)
          .map((c) => Math.abs(c));
        const maxCorr = corrs.length > 0 ? Math.max(...corrs) : null;

        if (maxCorr !== null && maxCorr >= 0.95) {
          const severity: Severity = maxCorr >= 0.98 ? 'critical' : 'high';
          const pStr = rPearson !== null ? rPearson.toFixed(3) : 'N/A';
          const sStr = rSpearman !== null ? rSpearman.toFixed(3) : 'N/A';
          const pDetail = rPearson !== null ? rPearson.toFixed(4) : 'N/A';
          const sDetail = rSpearman !== null ? rSpearman.toFixed(4) : 'N/A';

          findings.push({
            id: `FND-LKG-CORR-${colName}`,
            category: 'data_leakage',
            severity,
            title: `Potential target leakage indicator: Extreme correlation with target in '${colName}' (r = ${maxCorr.toFixed(3)})`,
            description: `Column '${colName}' exhibits an extraordinarily high statistical association with target '${targetColumn}' (Pearson: ${pStr}, Spearman: ${sStr}). While strong signals exist naturally, near-perfect linear relationships often indicate reverse causality or post-outcome feature capture.`,
            affected_columns: [colName, targetColumn],
            affected_row_count: validX.length,
            affected_row_ratio: roundTo(validX.length / totalRows, 4),
            evidence: [
              {
                metric_name: 'maximum_correlation_coefficient',
                observed_value: roundTo(maxCorr, 4),
                threshold_or_expected: '< 0.95',
                sample_row_indices: [],
                sample_values: [],
                details: `Pearson r=${pDetail}, Spearman r=${sDetail}.`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-LKG-CORR-${colName}`,
                action: `Verify timestamp provenance of '${colName}' to ensure it is collected strictly prior to '${targetColumn}'.`,
                reason:
                  'Predicting with post-outcome signals results in useless predictive models.',
                priority: severity,
              },
            ],
          });
        }
      }
    }

    // 3. Deterministic Categorical Association (Cramér's V)
    if (!isTargetNumeric && col.dtype === 'str' && !isId && nPaired >= 15) {
      const { cramerV, shape } = computeCramersV(
        pairedColStrs,
        pairedTargetStrs
      );
      if (
        shape[0] > 1 &&
        shape[1] > 1 &&
        Number.isFinite(cramerV) &&
        cramerV >= 0.95
      ) {
        findings.push({
          id: `FND-LKG-CRAMER-${colName}`,
          category: 'data_leakage',
          severity: 'high',
          title: `Potential target leakage indicator: Deterministic association with target in '${colName}' (Cramér's V: ${cramerV.toFixed(3)})`,
          description: `Column '${colName}' has near-deterministic categorical association with target '${targetColumn}' (Cramér's V = ${cramerV.toFixed(3)}). This indicates the feature almost perfectly partitions the target classes.`,
          affected_columns: [colName, targetColumn],
          affected_row_count: nPaired,
          affected_row_ratio: roundTo(nPaired / totalRows, 4),
          evidence: [
            {
              metric_name: 'cramers_v_association',
              observed_value: roundTo(cramerV, 4),
              threshold_or_expected: '< 0.90',
              sample_row_indices: pairedRows.slice(0, 10),
              sample_values: [],
              details: `Crosstab shape (${shape[0]}, ${shape[1]}), Cramér's V=${cramerV.toFixed(4)}.`,
            },
          ],
          recommendations: [
            {
              finding_id: `FND-LKG-CRAMER-${colName}`,
              action: `Inspect whether categories in '${colName}' encode outcome information.`,
              reason:
                'High categorical mutual information often flags leaked post-decision data.',
              priority: 'high',
            },
          ],
        });
      }
    }
  }

  return findings;
}
