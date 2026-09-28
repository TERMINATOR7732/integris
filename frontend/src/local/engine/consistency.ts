/**
 * INTEGRIS Local Engine — Cross-Column & Domain Consistency Analyzer
 * Mirrors backend/app/engine/consistency.py with 100% parity.
 */

import type { ColumnProfile, Finding } from '../../types/integris';
import type { ColumnarFrame, ColumnData } from '../ingestion/csvParser';
import { tokenizeColumnName } from './completeness';
import { roundTo } from './profiler';

const TEMPORAL_PAIRS: [Set<string>, Set<string>, string][] = [
  [
    new Set([
      'hire',
      'hired',
      'join',
      'joined',
      'start',
      'started',
      'entry',
      'onboard',
      'onboarded',
    ]),
    new Set([
      'exit',
      'exited',
      'term',
      'termination',
      'terminated',
      'end',
      'ended',
      'leave',
      'resign',
      'resigned',
      'offboard',
      'offboarded',
    ]),
    'Exit date occurs chronologically prior to hire/start date',
  ],
  [
    new Set(['birth', 'birthdate', 'dob']),
    new Set([
      'hire',
      'hired',
      'join',
      'joined',
      'start',
      'started',
      'graduate',
      'graduated',
      'graduation',
      'enroll',
      'enrolled',
      'enrollment',
    ]),
    'Event date occurs prior to date of birth',
  ],
  [
    new Set(['order', 'ordered', 'booking', 'booked', 'creation', 'created']),
    new Set([
      'ship',
      'shipped',
      'shipping',
      'shipment',
      'deliver',
      'delivered',
      'delivery',
      'dispatch',
      'dispatched',
      'fulfill',
      'fulfilled',
      'fulfillment',
    ]),
    'Fulfillment/delivery date occurs prior to order date',
  ],
  [
    new Set([
      'ship',
      'shipped',
      'shipping',
      'shipment',
      'dispatch',
      'dispatched',
    ]),
    new Set(['deliver', 'delivered', 'delivery']),
    'Delivery date occurs chronologically prior to ship/dispatch date',
  ],
  [
    new Set(['admit', 'admitted', 'admission']),
    new Set(['discharge', 'discharged']),
    'Discharge date occurs chronologically prior to admission date',
  ],
  [
    new Set(['enroll', 'enrolled', 'enrollment']),
    new Set(['graduate', 'graduated', 'graduation']),
    'Graduation date occurs chronologically prior to enrollment date',
  ],
  [
    new Set(['open', 'opened', 'opening']),
    new Set([
      'close',
      'closed',
      'closing',
      'resolve',
      'resolved',
      'resolution',
    ]),
    'Closed/resolution date occurs chronologically prior to opened date',
  ],
  [
    new Set(['pickup', 'picked', 'collection', 'collected']),
    new Set(['deliver', 'delivered', 'delivery', 'dropoff']),
    'Delivery date occurs chronologically prior to pickup date',
  ],
  [
    new Set(['transaction', 'txn', 'trade']),
    new Set(['settle', 'settled', 'settlement', 'clearing', 'cleared']),
    'Settlement date occurs chronologically prior to transaction date',
  ],
];

const TEMPORAL_COLUMN_TOKENS = new Set([
  'date',
  'dates',
  'time',
  'datetime',
  'timestamp',
  'day',
  'dt',
  'dob',
  'hire',
  'hired',
  'exit',
  'exited',
  'term',
  'termination',
  'terminated',
  'join',
  'joined',
  'start',
  'started',
  'end',
  'ended',
  'birth',
  'birthdate',
  'created',
  'updated',
  'order',
  'ordered',
  'booking',
  'booked',
  'creation',
  'ship',
  'shipped',
  'shipping',
  'shipment',
  'deliver',
  'delivered',
  'delivery',
  'dispatch',
  'dispatched',
  'fulfill',
  'fulfilled',
  'fulfillment',
  'leave',
  'resign',
  'resigned',
  'onboard',
  'onboarded',
  'offboard',
  'offboarded',
  'entry',
  'graduate',
  'graduated',
  'graduation',
  'admit',
  'admitted',
  'admission',
  'discharge',
  'discharged',
  'enroll',
  'enrolled',
  'enrollment',
  'open',
  'opened',
  'opening',
  'close',
  'closed',
  'closing',
  'resolve',
  'resolved',
  'resolution',
  'pickup',
  'picked',
  'collection',
  'collected',
  'dropoff',
  'transaction',
  'txn',
  'trade',
  'settle',
  'settled',
  'settlement',
  'clearing',
  'cleared',
]);

const NON_NEGATIVE_TOKENS = new Set([
  'count',
  'quantity',
  'qty',
  'items',
  'age',
  'days',
  'hours',
  'units',
  'visits',
  'clicks',
]);

interface ParsedDateDict {
  dayMs: Float64Array;
  fullMs: Float64Array;
  hasTime: Uint8Array;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const maxDays = [
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
  return day <= maxDays[month - 1];
}

function parseMixedDateString(raw: string): {
  dayMs: number;
  fullMs: number;
  hasTime: boolean;
} | null {
  const s = raw.trim();
  if (s === '') return null;

  const ymdMatch =
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      s
    );
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (!isValidYmd(year, month, day)) return null;
    const hr = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const ms = ymdMatch[7]
      ? parseInt(ymdMatch[7].slice(0, 3).padEnd(3, '0'), 10)
      : 0;
    if (hr > 23 || min > 59 || sec > 59) return null;
    const dayMs = Date.UTC(year, month - 1, day);
    const timeOffset = ((hr * 60 + min) * 60 + sec) * 1000 + ms;
    return {
      dayMs,
      fullMs: dayMs + timeOffset,
      hasTime: timeOffset > 0,
    };
  }

  const dmyMatch =
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s
    );
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    let month: number;
    let day: number;
    if (p1 > 12) {
      day = p1;
      month = p2;
    } else {
      month = p1;
      day = p2;
    }
    if (!isValidYmd(year, month, day)) return null;
    const hr = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    if (hr > 23 || min > 59 || sec > 59) return null;
    const dayMs = Date.UTC(year, month - 1, day);
    const timeOffset = ((hr * 60 + min) * 60 + sec) * 1000;
    return {
      dayMs,
      fullMs: dayMs + timeOffset,
      hasTime: timeOffset > 0,
    };
  }

  return null;
}

function buildParsedDateDict(col: ColumnData): ParsedDateDict | null {
  if (col.dtype !== 'str') return null;
  const dict = col.dict!;
  const len = dict.length;
  const dayMs = new Float64Array(len);
  const fullMs = new Float64Array(len);
  const hasTime = new Uint8Array(len);
  dayMs[0] = NaN;
  fullMs[0] = NaN;

  let validCount = 0;
  for (let k = 1; k < len; k++) {
    const parsed = parseMixedDateString(dict[k]);
    if (parsed) {
      dayMs[k] = parsed.dayMs;
      fullMs[k] = parsed.fullMs;
      hasTime[k] = parsed.hasTime ? 1 : 0;
      validCount++;
    } else {
      dayMs[k] = NaN;
      fullMs[k] = NaN;
    }
  }

  return validCount > 0 ? { dayMs, fullMs, hasTime } : null;
}

export function analyzeConsistency(
  frame: ColumnarFrame,
  profiles: ColumnProfile[]
): Finding[] {
  const findings: Finding[] = [];
  const totalRows = frame.rowCount;
  if (totalRows === 0) return findings;

  const colProfileMap = new Map<string, ColumnProfile>();
  for (const p of profiles) colProfileMap.set(p.name, p);

  const dateLikeCols: string[] = [];
  for (const colName of frame.columnNames) {
    const col = frame.columnsByName.get(colName);
    const prof = colProfileMap.get(colName);
    if (!col || col.dtype !== 'str') continue;
    if (
      prof &&
      (prof.semantic_type === 'identifier' || prof.semantic_type === 'boolean')
    ) {
      continue;
    }
    const tokens = tokenizeColumnName(colName);
    const hasTemporalTok = tokens.some((t) => TEMPORAL_COLUMN_TOKENS.has(t));
    if (prof?.semantic_type === 'datetime' || hasTemporalTok) {
      const dict = col.dict!;
      let anyValid = false;
      for (let k = 1; k < Math.min(dict.length, 15); k++) {
        if (parseMixedDateString(dict[k]) !== null) {
          anyValid = true;
          break;
        }
      }
      if (anyValid) {
        dateLikeCols.push(colName);
      }
    }
  }

  const dateDictCache = new Map<string, ParsedDateDict | null>();
  const getDateDict = (colName: string): ParsedDateDict | null => {
    if (dateDictCache.has(colName)) return dateDictCache.get(colName)!;
    const col = frame.columnsByName.get(colName);
    const parsed = col ? buildParsedDateDict(col) : null;
    dateDictCache.set(colName, parsed);
    return parsed;
  };

  // 1. Temporal Ordering Contradictions
  const seenPairs = new Set<string>();
  for (const [startTokens, endTokens, ruleDesc] of TEMPORAL_PAIRS) {
    const matchedStarts = dateLikeCols.filter((c) =>
      tokenizeColumnName(c).some((t) => startTokens.has(t))
    );
    const matchedEnds = dateLikeCols.filter((c) =>
      tokenizeColumnName(c).some((t) => endTokens.has(t))
    );

    for (const sColName of matchedStarts) {
      for (const eColName of matchedEnds) {
        const pairKey = `${sColName}\0${eColName}`;
        if (sColName === eColName || seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const sCol = frame.columnsByName.get(sColName);
        const eCol = frame.columnsByName.get(eColName);
        if (!sCol || !eCol) continue;

        const sParsed = getDateDict(sColName);
        const eParsed = getDateDict(eColName);
        if (!sParsed || !eParsed) continue;

        const sCodes = sCol.codes!;
        const eCodes = eCol.codes!;
        const sDict = sCol.dict!;
        const eDict = eCol.dict!;

        let validPairCount = 0;
        let sHasTime = false;
        let eHasTime = false;

        for (let r = 0; r < totalRows; r++) {
          const sc = sCodes[r];
          const ec = eCodes[r];
          if (sc === 0 || ec === 0) continue;
          const sFull = sParsed.fullMs[sc];
          const eFull = eParsed.fullMs[ec];
          if (Number.isNaN(sFull) || Number.isNaN(eFull)) continue;
          validPairCount++;
          if (sParsed.hasTime[sc]) sHasTime = true;
          if (eParsed.hasTime[ec]) eHasTime = true;
        }

        if (validPairCount === 0) continue;

        const useDayFloorForStart = sHasTime && !eHasTime;
        let inversionCount = 0;
        const affectedIndices: number[] = [];
        const sampleEvidence: Record<string, string>[] = [];

        for (let r = 0; r < totalRows; r++) {
          const sc = sCodes[r];
          const ec = eCodes[r];
          if (sc === 0 || ec === 0) continue;
          const sComp = useDayFloorForStart
            ? sParsed.dayMs[sc]
            : sParsed.fullMs[sc];
          const eComp = eParsed.fullMs[ec];
          if (Number.isNaN(sComp) || Number.isNaN(eComp)) continue;

          if (eComp < sComp) {
            inversionCount++;
            if (affectedIndices.length < 10) affectedIndices.push(r);
            if (sampleEvidence.length < 5) {
              sampleEvidence.push({
                [sColName]: sDict[sc],
                [eColName]: eDict[ec],
              });
            }
          }
        }

        if (inversionCount > 0) {
          const inversionRatio = inversionCount / totalRows;
          findings.push({
            id: `FND-CNS-TEMP-${sColName}-${eColName}`,
            category: 'consistency',
            severity: 'critical',
            title: `Temporal inversion: '${eColName}' precedes '${sColName}' (${inversionCount} records)`,
            description: `Found ${inversionCount} record(s) where ${eColName} is chronologically earlier than ${sColName}. Temporal causality requires start dates to precede completion/exit dates.`,
            affected_columns: [sColName, eColName],
            affected_row_count: inversionCount,
            affected_row_ratio: roundTo(inversionRatio, 4),
            evidence: [
              {
                metric_name: 'chronological_inversion_count',
                observed_value: inversionCount,
                threshold_or_expected: 0,
                sample_row_indices: affectedIndices,
                sample_values: sampleEvidence,
                details: `Rule violated: ${ruleDesc}.`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-CNS-TEMP-${sColName}-${eColName}`,
                action: `Correct chronologically inverted timestamps between '${sColName}' and '${eColName}'.`,
                reason:
                  'Inverted dates corrupt duration calculations and destroy time-series integrity.',
                priority: 'critical',
              },
            ],
          });
        }
      }
    }
  }

  // 2. Defensible Non-Negative Columns with Negative Values
  for (const colName of frame.columnNames) {
    const tokens = tokenizeColumnName(colName);
    if (!tokens.some((t) => NON_NEGATIVE_TOKENS.has(t))) continue;

    const col = frame.columnsByName.get(colName);
    if (!col) continue;

    let negCount = 0;
    const negIndices: number[] = [];
    const sampleNegs: number[] = [];
    const seenNegs = new Set<number>();

    if (col.dtype === 'int64' || col.dtype === 'float64') {
      if (
        !col.sortedFinite ||
        col.sortedFinite.length === 0 ||
        col.sortedFinite[0] >= 0
      ) {
        continue;
      }
      const nums = col.numValues!;
      for (let r = 0; r < totalRows; r++) {
        const v = nums[r];
        if (v < 0) {
          negCount++;
          if (negIndices.length < 10) negIndices.push(r);
          const rv = roundTo(v, 4);
          if (sampleNegs.length < 5 && !seenNegs.has(rv)) {
            seenNegs.add(rv);
            sampleNegs.push(rv);
          }
        }
      }
    } else if (col.dtype === 'str') {
      // Handle string column coerced via pd.to_numeric(..., errors="coerce")
      const dict = col.dict!;
      const counts = col.counts!;
      const negCodeMap = new Map<number, number>();
      for (let k = 1; k < dict.length; k++) {
        const n = Number(dict[k].trim());
        if (Number.isFinite(n) && n < 0) {
          negCount += counts[k];
          negCodeMap.set(k, roundTo(n, 4));
        }
      }
      if (negCount > 0) {
        const codes = col.codes!;
        for (let r = 0; r < totalRows; r++) {
          const rv = negCodeMap.get(codes[r]);
          if (rv !== undefined) {
            if (negIndices.length < 10) negIndices.push(r);
            if (sampleNegs.length < 5 && !seenNegs.has(rv)) {
              seenNegs.add(rv);
              sampleNegs.push(rv);
            }
          }
        }
      }
    }

    if (negCount > 0) {
      const negRatio = negCount / totalRows;
      findings.push({
        id: `FND-CNS-NEG-${colName}`,
        category: 'consistency',
        severity: 'high',
        title: `Impossible negative values in non-negative domain '${colName}'`,
        description: `Column '${colName}' is semantically defined as a count/quantity field, but contains ${negCount} negative value(s) like [${sampleNegs.join(', ')}].`,
        affected_columns: [colName],
        affected_row_count: negCount,
        affected_row_ratio: roundTo(negRatio, 4),
        evidence: [
          {
            metric_name: 'negative_count_violation',
            observed_value: sampleNegs,
            threshold_or_expected: '>= 0',
            sample_row_indices: negIndices,
            sample_values: sampleNegs,
            details: 'Count metrics cannot physically take negative values.',
          },
        ],
        recommendations: [
          {
            finding_id: `FND-CNS-NEG-${colName}`,
            action: `Investigate negative values in '${colName}'; filter or recode invalid entries.`,
            reason:
              'Negative quantities break probability distributions and summary sums.',
            priority: 'high',
          },
        ],
      });
    }
  }

  // 3. Contradictory Min/Max Pairs
  for (const colA of frame.columnNames) {
    if (!tokenizeColumnName(colA).includes('min')) continue;
    const baseA = colA.toLowerCase().replace('min', '');
    for (const colB of frame.columnNames) {
      if (colA === colB || !tokenizeColumnName(colB).includes('max')) continue;
      if (baseA === colB.toLowerCase().replace('max', '')) {
        const cA = frame.columnsByName.get(colA);
        const cB = frame.columnsByName.get(colB);
        if (!cA || !cB || cA.dtype === 'str' || cB.dtype === 'str') continue;

        const numsA = cA.numValues!;
        const numsB = cB.numValues!;
        let invCount = 0;
        const invIndices: number[] = [];
        for (let r = 0; r < totalRows; r++) {
          const vA = numsA[r];
          const vB = numsB[r];
          if (!Number.isNaN(vA) && !Number.isNaN(vB) && vA > vB) {
            invCount++;
            if (invIndices.length < 10) invIndices.push(r);
          }
        }
        if (invCount > 0) {
          findings.push({
            id: `FND-CNS-MINMAX-${colA}-${colB}`,
            category: 'consistency',
            severity: 'high',
            title: `Inverted boundary values: '${colA}' exceeds '${colB}' (${invCount} records)`,
            description: `Found ${invCount} record(s) where minimum column '${colA}' is strictly greater than maximum column '${colB}'.`,
            affected_columns: [colA, colB],
            affected_row_count: invCount,
            affected_row_ratio: roundTo(invCount / totalRows, 4),
            evidence: [
              {
                metric_name: 'min_exceeds_max_count',
                observed_value: invCount,
                threshold_or_expected: 0,
                sample_row_indices: invIndices,
                sample_values: [],
                details: `'${colA}' > '${colB}' in ${invCount} rows.`,
              },
            ],
            recommendations: [
              {
                finding_id: `FND-CNS-MINMAX-${colA}-${colB}`,
                action: `Swap or correct inverted boundary values between '${colA}' and '${colB}'.`,
                reason:
                  'Inverted min/max ranges cause interval logic failures.',
                priority: 'high',
              },
            ],
          });
        }
      }
    }
  }

  return findings;
}
