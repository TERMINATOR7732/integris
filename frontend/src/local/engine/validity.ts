/**
 * INTEGRIS Local Engine — Validity, Type Drift & Format Consistency Analyzer
 * Mirrors backend/app/engine/validity.py with 100% parity.
 */

import type { ColumnProfile, Finding } from '../../types/integris';
import type { ColumnarFrame } from '../ingestion/csvParser';
import { tokenizeColumnName } from './completeness';
import { roundTo } from './profiler';

const DATE_NAME_TOKENS = new Set([
  'date',
  'dates',
  'time',
  'datetime',
  'timestamp',
  'dt',
  'hire',
  'hired',
  'exit',
  'exited',
  'birth',
  'birthdate',
  'dob',
  'created',
  'updated',
  'termination',
  'promotion',
]);

const DATE_PATTERNS: [string, RegExp][] = [
  [
    'ISO_8601',
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?)?$/,
  ],
  ['SLASH_YMD', /^\d{4}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])$/],
  ['SLASH_DMY', /^(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/\d{4}$/],
  ['SLASH_MDY', /^(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{2}$/],
  ['DOT_DMY', /^(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.\d{4}$/],
];

function isFiniteNumericString(trimmed: string): boolean {
  if (trimmed === '') return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
}

function isValidYmdCalendarDate(ymd10: string): boolean {
  const year = Number(ymd10.slice(0, 4));
  const month = Number(ymd10.slice(5, 7));
  const day = Number(ymd10.slice(8, 10));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonths = [
    31,
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonths[month - 1];
}

function matchesDatePattern(
  trimmed: string,
  patName: string,
  patRegex: RegExp
): boolean {
  if (!patRegex.test(trimmed)) return false;
  if (patName === 'ISO_8601' || patName === 'SLASH_YMD') {
    return isValidYmdCalendarDate(trimmed.slice(0, 10));
  }
  return true;
}

export function analyzeValidity(
  frame: ColumnarFrame,
  profiles: ColumnProfile[]
): Finding[] {
  const findings: Finding[] = [];
  const totalRows = frame.rowCount;
  if (totalRows === 0) return findings;

  for (const p of profiles) {
    const colName = p.name;
    const col = frame.columnsByName.get(colName);
    if (!col || col.dtype !== 'str' || p.non_null_count < 3) {
      continue;
    }

    const nonNullCount = p.non_null_count;
    const dict = col.dict!;
    const counts = col.counts!;
    const codes = col.codes!;

    // 1. Type Drift in String/Object Columns
    let numericCount = 0;
    const sampleCorrupted: string[] = [];
    const nonNumericCodeSet = new Set<number>();

    for (let k = 1; k < dict.length; k++) {
      const trimmed = dict[k].trim();
      if (isFiniteNumericString(trimmed)) {
        numericCount += counts[k];
      } else {
        nonNumericCodeSet.add(k);
        if (sampleCorrupted.length < 5) {
          sampleCorrupted.push(dict[k]);
        }
      }
    }

    const numericRatio = numericCount / nonNullCount;
    if (numericRatio >= 0.6 && numericRatio < 1.0) {
      const driftCount = nonNullCount - numericCount;
      const driftIndices: number[] = [];
      for (let r = 0; r < totalRows && driftIndices.length < 10; r++) {
        if (nonNumericCodeSet.has(codes[r])) {
          driftIndices.push(r);
        }
      }

      findings.push({
        id: `FND-VAL-TYPEDRIFT-${colName}`,
        category: 'validity',
        severity: 'high',
        title: `Type drift detected in '${colName}' (${(numericRatio * 100).toFixed(1)}% numeric, ${driftCount} contaminated strings)`,
        description: `Column '${colName}' appears to be a numeric field (${numericCount} of ${nonNullCount} valid numbers), but contains ${driftCount} non-numeric textual entries like [${sampleCorrupted.map((s) => `'${s}'`).join(', ')}]. This forces the entire column to be treated as untyped text, preventing mathematical and statistical computation.`,
        affected_columns: [colName],
        affected_row_count: driftCount,
        affected_row_ratio: roundTo(driftCount / totalRows, 4),
        evidence: [
          {
            metric_name: 'non_numeric_contaminants',
            observed_value: driftCount,
            threshold_or_expected: 0,
            sample_row_indices: driftIndices,
            sample_values: sampleCorrupted,
            details: `Contaminating non-numeric text values found: [${sampleCorrupted.map((s) => `'${s}'`).join(', ')}].`,
          },
        ],
        recommendations: [
          {
            finding_id: `FND-VAL-TYPEDRIFT-${colName}`,
            action: `Sanitize or extract numeric values from contaminated records in '${colName}' and cast column to float/int.`,
            reason:
              'Mixed-type columns fail downstream schema validation and break ML pipelines.',
            priority: 'high',
          },
        ],
      });
    }

    // 2. Date Format Inconsistencies
    const tokens = tokenizeColumnName(colName);
    const isDateNamed =
      tokens.some((t) => DATE_NAME_TOKENS.has(t)) ||
      p.semantic_type === 'datetime';

    if (isDateNamed) {
      const patternCounts: Record<string, number> = {};
      const patternCodeSets: Record<string, Set<number>> = {};

      for (const [patName, patRegex] of DATE_PATTERNS) {
        let count = 0;
        const codeSet = new Set<number>();
        for (let k = 1; k < dict.length; k++) {
          const trimmed = dict[k].trim();
          if (matchesDatePattern(trimmed, patName, patRegex)) {
            count += counts[k];
            codeSet.add(k);
          }
        }
        if (count > 0) {
          patternCounts[patName] = count;
          patternCodeSets[patName] = codeSet;
        }
      }

      const patternEntries = Object.entries(patternCounts);
      const totalDateMatches = patternEntries.reduce((s, [, c]) => s + c, 0);

      if (
        (patternEntries.length > 1 ||
          (patternEntries.length === 1 && totalDateMatches < nonNullCount)) &&
        (totalDateMatches >= 2 || totalDateMatches / nonNullCount >= 0.2)
      ) {
        patternEntries.sort((a, b) => b[1] - a[1]);
        const [dominantPattern, dominantCount] =
          patternEntries.length > 0 ? patternEntries[0] : ['UNKNOWN', 0];
        const anomalyCount = nonNullCount - dominantCount;

        if (anomalyCount > 0 && anomalyCount / nonNullCount >= 0.02) {
          const domCodeSet = patternCodeSets[dominantPattern] ?? new Set();
          const sampleDeviant: string[] = [];
          for (
            let k = 1;
            k < dict.length && sampleDeviant.length < 5;
            k++
          ) {
            if (!domCodeSet.has(k)) {
              sampleDeviant.push(dict[k].trim());
            }
          }

          const deviantIndices: number[] = [];
          for (let r = 0; r < totalRows && deviantIndices.length < 10; r++) {
            const c = codes[r];
            if (c > 0 && !domCodeSet.has(c)) {
              deviantIndices.push(r);
            }
          }

          findings.push({
            id: `FND-VAL-DATE-FORMAT-${colName}`,
            category: 'validity',
            severity: 'medium',
            title: `Inconsistent date formats in '${colName}' (dominant: ${dominantPattern})`,
            description: `Column '${colName}' exhibits mixed date formatting. While ${dominantCount} entries follow ${dominantPattern}, ${anomalyCount} entries exhibit competing formats or unparseable text (e.g. [${sampleDeviant.map((s) => `'${s}'`).join(', ')}]).`,
            affected_columns: [colName],
            affected_row_count: anomalyCount,
            affected_row_ratio: roundTo(anomalyCount / totalRows, 4),
            evidence: [
              {
                metric_name: 'format_breakdown',
                observed_value: patternCounts,
                threshold_or_expected: `100% ${dominantPattern}`,
                sample_row_indices: deviantIndices,
                sample_values: sampleDeviant,
                details: `Deviant values include: [${sampleDeviant.map((s) => `'${s}'`).join(', ')}].`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-VAL-DATE-FORMAT-${colName}`,
                action: `Standardize all date entries in '${colName}' to ISO 8601 (YYYY-MM-DD).`,
                reason:
                  'Inconsistent date parsing causes silent timezone and day/month swapping errors.',
                priority: 'medium',
              },
            ],
          });
        }
      }
    }

    // 3. Categorical Casing and Variation Inconsistency
    const uniqueRawCount = dict.length - 1;
    if (uniqueRawCount > 1 && uniqueRawCount <= 50) {
      const canonicalGroups = new Map<string, Set<string>>();
      for (let k = 1; k < dict.length; k++) {
        const valStr = dict[k].trim();
        const normKey = valStr.toLowerCase();
        let set = canonicalGroups.get(normKey);
        if (!set) {
          set = new Set<string>();
          canonicalGroups.set(normKey, set);
        }
        set.add(valStr);
      }

      const casingAnomalies: [string, string[]][] = [];
      for (const [normKey, variantsSet] of canonicalGroups.entries()) {
        if (variantsSet.size > 1) {
          casingAnomalies.push([normKey, Array.from(variantsSet).sort()]);
        }
      }

      if (casingAnomalies.length > 0) {
        let totalAffectedRows = 0;
        const allVariantsFlat: string[] = [];
        const variantStrSet = new Set<string>();

        for (const [, variants] of casingAnomalies) {
          for (const v of variants) {
            allVariantsFlat.push(v);
            variantStrSet.add(v);
          }
        }

        // In validity.py line 249: mask = non_null_series.isin(variants)
        const matchingCodes = new Set<number>();
        for (let k = 1; k < dict.length; k++) {
          if (variantStrSet.has(dict[k])) {
            totalAffectedRows += counts[k];
            matchingCodes.add(k);
          }
        }

        const affectedIndices: number[] = [];
        for (let r = 0; r < totalRows && affectedIndices.length < 10; r++) {
          if (matchingCodes.has(codes[r])) {
            affectedIndices.push(r);
          }
        }

        findings.push({
          id: `FND-VAL-CAT-CASING-${colName}`,
          category: 'validity',
          severity: 'medium',
          title: `Categorical casing drift in '${colName}'`,
          description: `Column '${colName}' contains identical semantic categories represented with conflicting casing styles: ${JSON.stringify(casingAnomalies.map(([, v]) => v))}. This will fragment SQL GROUP BY queries and feature encoding.`,
          affected_columns: [colName],
          affected_row_count: totalAffectedRows,
          affected_row_ratio: roundTo(totalAffectedRows / totalRows, 4),
          evidence: [
            {
              metric_name: 'conflicting_category_variants',
              observed_value: casingAnomalies.map(([, v]) => v),
              threshold_or_expected: 'Uniform casing per categorical entity',
              sample_row_indices: affectedIndices,
              sample_values: allVariantsFlat.slice(0, 8),
              details:
                'Inconsistent casing causes duplicate category buckets in downstream analytics.',
            },
          ],
          recommendations: [
            {
              finding_id: `FND-VAL-CAT-CASING-${colName}`,
              action: `Normalize column '${colName}' using consistent title or upper casing.`,
              reason:
                'Casing variations create artificial cardinality expansion in one-hot encoders.',
              priority: 'medium',
            },
          ],
        });
      }
    }
  }

  return findings;
}
