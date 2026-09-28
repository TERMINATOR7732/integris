/**
 * INTEGRIS Local Engine — Completeness & Sentinel Value Analyzer
 * Mirrors backend/app/engine/completeness.py with 100% parity.
 */

import type { ColumnProfile, Finding, Severity } from '../../types/integris';
import type { ColumnarFrame } from '../ingestion/csvParser';
import { roundTo } from './profiler';

const TEXT_SENTINELS = new Set([
  'n/a',
  'na',
  'null',
  'none',
  '?',
  'unknown',
  '-',
  '--',
  'missing',
  'nan',
  '#n/a',
  'nil',
  'undefined',
  'blank',
  'none/specified',
]);

const NUMERIC_SENTINELS = [9999, 99999, 999999, -1, -999, -9999];

const OPTIONAL_LIFECYCLE_TOKENS = new Set([
  'exit',
  'exited',
  'termination',
  'terminated',
  'cancel',
  'cancelled',
  'canceled',
  'cancellation',
  'dropout',
  'resign',
  'resigned',
  'offboard',
  'offboarded',
]);

const DATE_TIMELIKE_TOKENS = new Set([
  'date',
  'dates',
  'dt',
  'time',
  'timestamp',
  'datetime',
]);

export function tokenizeColumnName(colName: string): string[] {
  const step1 = colName.trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  const step2 = step1.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
  return step2
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

function isOptionalLifecycleColumn(colName: string): boolean {
  const tokens = tokenizeColumnName(colName);
  if (tokens.length === 0) return false;
  const tokenSet = new Set(tokens);
  for (const t of tokenSet) {
    if (OPTIONAL_LIFECYCLE_TOKENS.has(t)) return true;
  }
  if (
    (tokenSet.has('term') || tokenSet.has('end') || tokenSet.has('leave')) &&
    tokens.some((t) => DATE_TIMELIKE_TOKENS.has(t))
  ) {
    return true;
  }
  return false;
}

export function analyzeCompleteness(
  frame: ColumnarFrame,
  profiles: ColumnProfile[]
): Finding[] {
  const findings: Finding[] = [];
  const totalRows = frame.rowCount;
  if (totalRows === 0) return findings;

  const minMissingThreshold = Math.max(3, Math.floor(totalRows * 0.05));
  const missingRowLists: { colName: string; rows: Int32Array }[] = [];

  for (const p of profiles) {
    const colName = p.name;
    const col = frame.columnsByName.get(colName);
    if (!col) continue;

    // 1. Standard nulls & whitespace detection
    let emptyStrCount = 0;
    let emptyCodesSet: Set<number> | null = null;
    if (col.dtype === 'str') {
      const dict = col.dict!;
      const counts = col.counts!;
      for (let k = 1; k < dict.length; k++) {
        if (dict[k].trim() === '') {
          emptyStrCount += counts[k];
          if (!emptyCodesSet) emptyCodesSet = new Set<number>();
          emptyCodesSet.add(k);
        }
      }
    }

    const totalMissing = p.null_count + emptyStrCount;
    const missingRatio = totalMissing / totalRows;

    const sampleMissingIndices: number[] = [];
    const sampleMissingVals: string[] = [];

    if (totalMissing >= minMissingThreshold || missingRatio >= 0.05) {
      const needFullList = totalMissing >= minMissingThreshold;
      const missingRows = needFullList ? new Int32Array(totalMissing) : null;
      let w = 0;

      if (col.dtype === 'str') {
        const codes = col.codes!;
        for (let r = 0; r < totalRows; r++) {
          const code = codes[r];
          const isNull = code === 0;
          const isWs =
            !isNull && emptyCodesSet !== null && emptyCodesSet.has(code);
          if (isNull || isWs) {
            if (missingRows) missingRows[w++] = r;
            if (sampleMissingIndices.length < 10) {
              sampleMissingIndices.push(r);
            }
            if (sampleMissingVals.length < 5) {
              sampleMissingVals.push(isNull ? '<NULL>' : '<WHITESPACE>');
            }
            if (!needFullList && sampleMissingIndices.length >= 10) break;
          }
        }
      } else {
        const nums = col.numValues!;
        for (let r = 0; r < totalRows; r++) {
          if (Number.isNaN(nums[r])) {
            if (missingRows) missingRows[w++] = r;
            if (sampleMissingIndices.length < 10) {
              sampleMissingIndices.push(r);
            }
            if (sampleMissingVals.length < 5) {
              sampleMissingVals.push('<NULL>');
            }
            if (!needFullList && sampleMissingIndices.length >= 10) break;
          }
        }
      }

      if (missingRows) {
        missingRowLists.push({ colName, rows: missingRows.subarray(0, w) });
      }
    }

    if (totalMissing > 0 && missingRatio >= 0.05) {
      const isOptional = isOptionalLifecycleColumn(colName);
      let severity: Severity;
      if (p.is_candidate_identifier) {
        severity = missingRatio > 0.05 ? 'critical' : 'high';
      } else if (isOptional) {
        severity = missingRatio >= 0.5 ? 'info' : 'low';
      } else if (missingRatio >= 0.5) {
        severity = 'high';
      } else if (missingRatio >= 0.2) {
        severity = 'medium';
      } else {
        severity = 'low';
      }

      const recAction = p.is_candidate_identifier
        ? 'Verify identifier generation pipeline; primary keys must never contain missing values.'
        : `Investigate root cause of missing entries in '${colName}' before training models or running aggregations.`;

      findings.push({
        id: `FND-CMP-MISS-${colName}`,
        category: 'completeness',
        severity,
        title: `Significant missingness in '${colName}' (${(missingRatio * 100).toFixed(1)}%)`,
        description: `Column '${colName}' is missing ${totalMissing} of ${totalRows} records. Pervasive missingness weakens downstream statistical reliability and induces estimation bias.`,
        affected_columns: [colName],
        affected_row_count: totalMissing,
        affected_row_ratio: roundTo(missingRatio, 4),
        evidence: [
          {
            metric_name: 'missing_ratio',
            observed_value: roundTo(missingRatio, 4),
            threshold_or_expected: 0.05,
            sample_row_indices: sampleMissingIndices,
            sample_values: sampleMissingVals,
            details: `Column '${colName}' has ${totalMissing} missing records out of ${totalRows} total (${(missingRatio * 100).toFixed(1)}%).`,
          },
        ],
        recommendations: [
          {
            finding_id: `FND-CMP-MISS-${colName}`,
            action: recAction,
            reason:
              'Unmanaged missing data distorts summary statistics and breaks deterministic joins.',
            priority: severity,
          },
        ],
      });
    }

    // 2. Disguised Text Sentinels
    if (col.dtype === 'str') {
      const dict = col.dict!;
      const counts = col.counts!;
      const codes = col.codes!;
      let sentinelCount = 0;
      const matchedTokens: string[] = [];
      const sentinelCodeSet = new Set<number>();

      for (let k = 1; k < dict.length; k++) {
        const trimmed = dict[k].trim();
        if (trimmed !== '' && TEXT_SENTINELS.has(trimmed.toLowerCase())) {
          sentinelCount += counts[k];
          sentinelCodeSet.add(k);
          if (matchedTokens.length < 5) {
            matchedTokens.push(dict[k]);
          }
        }
      }

      if (sentinelCount > 0) {
        const sentinelRatio = sentinelCount / totalRows;
        const severity: Severity = sentinelRatio >= 0.1 ? 'high' : 'medium';
        const sampleSentinelIndices: number[] = [];
        for (
          let r = 0;
          r < totalRows && sampleSentinelIndices.length < 10;
          r++
        ) {
          if (sentinelCodeSet.has(codes[r])) {
            sampleSentinelIndices.push(r);
          }
        }

        findings.push({
          id: `FND-CMP-SENT-TXT-${colName}`,
          category: 'completeness',
          severity,
          title: `Disguised text missing values detected in '${colName}'`,
          description: `Column '${colName}' contains ${sentinelCount} records (${(sentinelRatio * 100).toFixed(1)}%) with placeholder text tokens like [${matchedTokens.map((t) => `'${t}'`).join(', ')}] masquerading as valid data entries.`,
          affected_columns: [colName],
          affected_row_count: sentinelCount,
          affected_row_ratio: roundTo(sentinelRatio, 4),
          evidence: [
            {
              metric_name: 'disguised_text_token_count',
              observed_value: sentinelCount,
              threshold_or_expected: 0,
              sample_row_indices: sampleSentinelIndices,
              sample_values: matchedTokens,
              details: `Observed placeholder tokens: ${matchedTokens.join(', ')}.`,
            },
          ],
          recommendations: [
            {
              finding_id: `FND-CMP-SENT-TXT-${colName}`,
              action: `Normalize sentinel tokens [${matchedTokens.map((t) => `'${t}'`).join(', ')}] to standard null representations.`,
              reason:
                'Downstream tools will treat disguised strings as genuine categorical categories.',
              priority: severity,
            },
          ],
        });
      }
    }

    // 3. Disguised Numeric Sentinels
    if (
      (col.dtype === 'int64' || col.dtype === 'float64') &&
      col.sortedFinite &&
      col.sortedFinite.length >= 10
    ) {
      const sorted = col.sortedFinite;
      const n = sorted.length;

      for (const sentinel of NUMERIC_SENTINELS) {
        let firstIdx = -1;
        let lastIdx = -1;
        for (let i = 0; i < n; i++) {
          if (sorted[i] === sentinel) {
            if (firstIdx === -1) firstIdx = i;
            lastIdx = i;
          } else if (sorted[i] > sentinel) {
            break;
          }
        }
        if (firstIdx === -1) continue;

        const hitCount = lastIdx - firstIdx + 1;
        const otherLen = n - hitCount;
        if (otherLen < 5) continue;

        const getOther = (idx: number): number =>
          idx < firstIdx ? sorted[idx] : sorted[idx + hitCount];

        const pos25 = 0.25 * (otherLen - 1);
        const lo25 = Math.floor(pos25);
        const hi25 = Math.ceil(pos25);
        const q25 =
          getOther(lo25) + (pos25 - lo25) * (getOther(hi25) - getOther(lo25));

        const pos75 = 0.75 * (otherLen - 1);
        const lo75 = Math.floor(pos75);
        const hi75 = Math.ceil(pos75);
        const q75 =
          getOther(lo75) + (pos75 - lo75) * (getOther(hi75) - getOther(lo75));

        const iqr = q75 - q25;
        let isSuspicious = false;

        if (sentinel < 0) {
          let nonNegCount = 0;
          for (let i = 0; i < otherLen; i++) {
            if (getOther(i) >= 0) nonNegCount++;
          }
          if (nonNegCount / otherLen > 0.95) {
            isSuspicious = true;
          }
        }

        if (
          !isSuspicious &&
          iqr > 0 &&
          (sentinel < q25 - 3 * iqr || sentinel > q75 + 3 * iqr)
        ) {
          isSuspicious = true;
        }

        if (isSuspicious) {
          const sentinelRatio = hitCount / totalRows;
          const severity: Severity = sentinelRatio > 0.05 ? 'high' : 'medium';
          const otherMin = getOther(0);
          const otherMax = getOther(otherLen - 1);

          const sampleIndices: number[] = [];
          const nums = col.numValues!;
          for (let r = 0; r < totalRows && sampleIndices.length < 10; r++) {
            if (nums[r] === sentinel) {
              sampleIndices.push(r);
            }
          }

          findings.push({
            id: `FND-CMP-SENT-NUM-${colName}-${sentinel}`,
            category: 'completeness',
            severity,
            title: `Disguised numeric sentinel (${sentinel}) in '${colName}'`,
            description: `Column '${colName}' contains ${hitCount} instances of '${sentinel}'. The remainder of the distribution is strictly within [${otherMin}, ${otherMax}], indicating '${sentinel}' is a sentinel missing value code rather than an organic observation.`,
            affected_columns: [colName],
            affected_row_count: hitCount,
            affected_row_ratio: roundTo(sentinelRatio, 4),
            evidence: [
              {
                metric_name: 'numeric_sentinel_outlier',
                observed_value: sentinel,
                threshold_or_expected: `Distribution range: [${otherMin}, ${otherMax}]`,
                sample_row_indices: sampleIndices,
                sample_values: [sentinel],
                details: `Sentinel occurs ${hitCount} times while 95%+ of column is bounded in [${otherMin}, ${otherMax}].`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-CMP-SENT-NUM-${colName}-${sentinel}`,
                action: `Recode sentinel numeric value ${sentinel} to NaN/null prior to statistical modeling.`,
                reason:
                  'Treating sentinels as literal values creates severe arithmetic distortion in means and regressions.',
                priority: severity,
              },
            ],
          });
        }
      }
    }
  }

  // 4. Cross-Column Co-Missingness Patterns
  for (let i = 0; i < missingRowLists.length; i++) {
    const a = missingRowLists[i];
    for (let j = i + 1; j < missingRowLists.length; j++) {
      const b = missingRowLists[j];
      const rowsA = a.rows;
      const rowsB = b.rows;
      let pA = 0;
      let pB = 0;
      let overlapCount = 0;
      const sampleOverlap: number[] = [];

      while (pA < rowsA.length && pB < rowsB.length) {
        const vA = rowsA[pA];
        const vB = rowsB[pB];
        if (vA === vB) {
          overlapCount++;
          if (sampleOverlap.length < 10) sampleOverlap.push(vA);
          pA++;
          pB++;
        } else if (vA < vB) {
          pA++;
        } else {
          pB++;
        }
      }

      const unionLen = rowsA.length + rowsB.length - overlapCount;
      const jaccard = unionLen > 0 ? overlapCount / unionLen : 0.0;

      if (jaccard >= 0.9 && overlapCount >= 5) {
        findings.push({
          id: `FND-CMP-COMISS-${a.colName}-${b.colName}`,
          category: 'completeness',
          severity: 'medium',
          title: `Systematic co-missingness between '${a.colName}' and '${b.colName}'`,
          description: `Columns '${a.colName}' and '${b.colName}' share an almost identical pattern of missingness (Jaccard index ${jaccard.toFixed(2)}, ${overlapCount} identical missing rows). This strongly suggests a systemic collection or upstream extraction failure rather than random omission.`,
          affected_columns: [a.colName, b.colName],
          affected_row_count: overlapCount,
          affected_row_ratio: roundTo(overlapCount / totalRows, 4),
          evidence: [
            {
              metric_name: 'missingness_jaccard_similarity',
              observed_value: roundTo(jaccard, 4),
              threshold_or_expected: 0.9,
              sample_row_indices: sampleOverlap,
              sample_values: [],
              details: `${overlapCount} records are concurrently missing in both columns.`,
            },
          ],
          recommendations: [
            {
              finding_id: `FND-CMP-COMISS-${a.colName}-${b.colName}`,
              action: `Investigate data ingestion pipeline to determine why '${a.colName}' and '${b.colName}' drop out in lockstep.`,
              reason:
                'Coupled missingness indicates structural failure in data logging.',
              priority: 'medium',
            },
          ],
        });
      }
    }
  }

  return findings;
}
