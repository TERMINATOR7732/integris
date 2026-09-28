/**
 * INTEGRIS Local Engine — Statistical Distribution, Outlier & Benford's Law Analyzer
 * Mirrors backend/app/engine/distribution.py with 100% mathematical parity.
 */

import type { ColumnProfile, Finding, Severity } from '../../types/integris';
import type { ColumnarFrame } from '../ingestion/csvParser';
import { quantileSorted, roundTo } from './profiler';

const FINANCIAL_TOKENS = [
  'salary',
  'revenue',
  'amount',
  'cost',
  'price',
  'sales',
  'transaction',
  'payment',
  'expense',
  'balance',
];

const BENFORD_EXPECTED: Record<number, number> = {
  1: Math.log10(1 + 1 / 1),
  2: Math.log10(1 + 1 / 2),
  3: Math.log10(1 + 1 / 3),
  4: Math.log10(1 + 1 / 4),
  5: Math.log10(1 + 1 / 5),
  6: Math.log10(1 + 1 / 6),
  7: Math.log10(1 + 1 / 7),
  8: Math.log10(1 + 1 / 8),
  9: Math.log10(1 + 1 / 9),
};

function getLeadingDigit(val: number): number {
  let v = Math.abs(val);
  if (v <= 0 || !Number.isFinite(v)) return 0;
  while (v >= 10) {
    if (v >= 1e8) v /= 1e8;
    else if (v >= 1e4) v /= 1e4;
    else if (v >= 100) v /= 100;
    else v /= 10;
  }
  while (v > 0 && v < 1) {
    v *= 10;
  }
  const d = Math.floor(v + 1e-12);
  return d >= 1 && d <= 9 ? d : 0;
}

export function analyzeDistribution(
  frame: ColumnarFrame,
  profiles: ColumnProfile[]
): Finding[] {
  const findings: Finding[] = [];
  const totalRows = frame.rowCount;
  if (totalRows < 5) return findings;

  for (const p of profiles) {
    const colName = p.name;
    const col = frame.columnsByName.get(colName);
    if (!col || (col.dtype !== 'int64' && col.dtype !== 'float64')) {
      continue;
    }

    const sorted = col.sortedFinite;
    if (!sorted || sorted.length < 8) continue;

    const nFinite = sorted.length;
    if (col.uniqueCount <= 2) continue;

    // 1. Extreme Outlier Detection (Tukey 3x IQR)
    const q25 = quantileSorted(sorted, 0.25);
    const q75 = quantileSorted(sorted, 0.75);
    const iqr = q75 - q25;
    const median = quantileSorted(sorted, 0.5);

    let extremeUpperBound: number;
    let extremeLowerBound: number;
    if (iqr > 0) {
      extremeUpperBound = q75 + 3.0 * iqr;
      extremeLowerBound = q25 - 3.0 * iqr;
    } else {
      const absDevs = new Float64Array(nFinite);
      for (let i = 0; i < nFinite; i++) {
        absDevs[i] = Math.abs(sorted[i] - median);
      }
      absDevs.sort();
      const mad = quantileSorted(absDevs, 0.5);
      const offset = mad > 0 ? 5.0 * mad : 1.0;
      extremeUpperBound = median + offset;
      extremeLowerBound = median - offset;
    }

    let extremeCount = 0;
    for (let i = 0; i < nFinite; i++) {
      const v = sorted[i];
      if (v > extremeUpperBound || v < extremeLowerBound) {
        extremeCount++;
      }
    }

    if (
      extremeCount > 0 &&
      (extremeCount / nFinite <= 0.1 || extremeCount <= 2)
    ) {
      const outlierIndices: number[] = [];
      const outlierValues: number[] = [];
      const rawNums = col.numValues!;
      for (let r = 0; r < totalRows; r++) {
        const v = rawNums[r];
        if (
          Number.isFinite(v) &&
          (v > extremeUpperBound || v < extremeLowerBound)
        ) {
          if (outlierIndices.length < 10) outlierIndices.push(r);
          if (outlierValues.length < 5) outlierValues.push(roundTo(v, 4));
          if (outlierIndices.length >= 10 && outlierValues.length >= 5) break;
        }
      }

      const maxVal = sorted[nFinite - 1];
      const distanceRatio = iqr > 0 ? (maxVal - q75) / iqr : 0;
      const severity: Severity = distanceRatio > 10.0 ? 'high' : 'medium';

      findings.push({
        id: `FND-DST-OUTLIER-${colName}`,
        category: 'distribution',
        severity,
        title: `Severe statistical outliers in '${colName}' (${extremeCount} extreme records)`,
        description: `Column '${colName}' contains ${extremeCount} observation(s) beyond 3×IQR threshold [${extremeLowerBound.toFixed(2)}, ${extremeUpperBound.toFixed(2)}]. Values like [${outlierValues.join(', ')}] lie at an extreme distance from the bulk distribution (median: ${median.toFixed(2)}).`,
        affected_columns: [colName],
        affected_row_count: extremeCount,
        affected_row_ratio: roundTo(extremeCount / totalRows, 4),
        evidence: [
          {
            metric_name: 'tukey_3x_iqr_violation',
            observed_value: outlierValues,
            threshold_or_expected: `[${extremeLowerBound.toFixed(2)}, ${extremeUpperBound.toFixed(2)}]`,
            sample_row_indices: outlierIndices,
            sample_values: outlierValues,
            details: `Q25=${q25.toFixed(2)}, Q75=${q75.toFixed(2)}, IQR=${iqr.toFixed(2)}, Median=${median.toFixed(2)}.`,
          },
        ],
        recommendations: [
          {
            finding_id: `FND-DST-OUTLIER-${colName}`,
            action: `Verify provenance of extreme records in '${colName}'; consider winsorization or robust scaling.`,
            reason:
              'Extreme outliers exert disproportionate leverage on linear models and variance estimators.',
            priority: severity,
          },
        ],
      });
    }

    // 2. Distribution Shape: Extreme Skewness / Kurtosis (matching scipy.stats.skew / kurtosis bias=True)
    if (extremeCount === 0) {
      let sum = 0;
      for (let i = 0; i < nFinite; i++) sum += sorted[i];
      const mean = sum / nFinite;

      let m2 = 0;
      let m3 = 0;
      let m4 = 0;
      for (let i = 0; i < nFinite; i++) {
        const d = sorted[i] - mean;
        const d2 = d * d;
        m2 += d2;
        m3 += d2 * d;
        m4 += d2 * d2;
      }
      m2 /= nFinite;
      m3 /= nFinite;
      m4 /= nFinite;

      if (m2 > 0) {
        const skewVal = m3 / Math.pow(m2, 1.5);
        const kurtVal = m4 / (m2 * m2) - 3.0;
        if (Number.isFinite(skewVal) && Math.abs(skewVal) > 4.0) {
          const kurtStr = Number.isFinite(kurtVal)
            ? kurtVal.toFixed(2)
            : 'N/A';
          findings.push({
            id: `FND-DST-SKEW-${colName}`,
            category: 'distribution',
            severity: 'low',
            title: `Substantial distributional asymmetry in '${colName}' (skewness: ${skewVal.toFixed(2)})`,
            description: `Column '${colName}' has high skewness (${skewVal.toFixed(2)}) and kurtosis (${kurtStr}), indicating a heavily asymmetric or heavy-tailed distribution.`,
            affected_columns: [colName],
            affected_row_count: 0,
            affected_row_ratio: 0.0,
            evidence: [
              {
                metric_name: 'fisher_pearson_skewness',
                observed_value: roundTo(skewVal, 3),
                threshold_or_expected: '[-2.0, 2.0] for symmetric distributions',
                sample_row_indices: [],
                sample_values: [],
                details: `Kurtosis=${kurtStr}.`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-DST-SKEW-${colName}`,
                action:
                  'Apply non-linear log or Yeo-Johnson transformations if using parametric estimators.',
                reason:
                  'Heavy skewness violates ordinary least squares normality assumptions.',
                priority: 'low',
              },
            ],
          });
        }
      }
    }

    // 3. Benford's Law Conformity Analysis
    const isId = Boolean(p.is_candidate_identifier);
    const colLower = colName.toLowerCase();
    const isFinancial = FINANCIAL_TOKENS.some((k) => colLower.includes(k));
    const minFinite = sorted[0];
    const maxFinite = sorted[nFinite - 1];
    const spanRatio = minFinite > 0 ? maxFinite / (minFinite + 1e-9) : 0.0;

    if (
      nFinite >= 40 &&
      minFinite > 0 &&
      !isId &&
      isFinancial &&
      spanRatio >= 50
    ) {
      const digitCounts = new Int32Array(10);
      let totalDigits = 0;
      for (let i = 0; i < nFinite; i++) {
        const d = getLeadingDigit(sorted[i]);
        if (d >= 1 && d <= 9) {
          digitCounts[d]++;
          totalDigits++;
        }
      }

      if (totalDigits >= 40) {
        let madSum = 0;
        const sampleBreakdown = [];
        for (let d = 1; d <= 9; d++) {
          const obsProb = digitCounts[d] / totalDigits;
          const expProb = BENFORD_EXPECTED[d];
          madSum += Math.abs(obsProb - expProb);
          sampleBreakdown.push({
            digit: d,
            observed: roundTo(obsProb, 3),
            expected: roundTo(expProb, 3),
          });
        }
        const madBenford = madSum / 9.0;

        if (Number.isFinite(madBenford) && madBenford > 0.025) {
          findings.push({
            id: `FND-DST-BENFORD-${colName}`,
            category: 'distribution',
            severity: 'medium',
            title: `Benford conformity anomaly detected in '${colName}'; further investigation recommended`,
            description: `Leading digit distribution in '${colName}' deviates from Benford's Law expectations (Mean Absolute Deviation: ${madBenford.toFixed(4)}, expected < 0.015 for organic multi-decade data). NOTE: Benford's Law is an investigative signal and does NOT establish fraud or intentional manipulation; deviations often arise from regulatory caps, psychological pricing thresholds, or synthetic sampling.`,
            affected_columns: [colName],
            affected_row_count: 0,
            affected_row_ratio: 0.0,
            evidence: [
              {
                metric_name: 'benford_mad_divergence',
                observed_value: roundTo(madBenford, 4),
                threshold_or_expected: '< 0.015 (Conformity Threshold)',
                sample_row_indices: [],
                sample_values: sampleBreakdown,
                details:
                  'Empirical leading digit frequencies diverge from natural logarithmic decay curve.',
              },
            ],
            recommendations: [
              {
                finding_id: `FND-DST-BENFORD-${colName}`,
                action: `Inspect domain business logic in '${colName}' for rounding rules, cluster caps, or artificial constraints.`,
                reason:
                  'Benford non-conformity warrants review of numerical generation mechanisms.',
                priority: 'medium',
              },
            ],
          });
        }
      }
    }
  }

  return findings;
}
