/**
 * INTEGRIS Local Engine — Uniqueness, Duplicate & Primary Key Integrity Analyzer
 * Mirrors backend/app/engine/uniqueness.py with 100% parity.
 */

import type { ColumnProfile, Finding, Severity } from '../../types/integris';
import type { ColumnarFrame, ColumnData } from '../ingestion/csvParser';
import { tokenizeColumnName } from './completeness';
import { countExactDuplicateRows, roundTo } from './profiler';

const STRONG_ID_TOKENS = new Set([
  'id',
  'uuid',
  'guid',
  'pk',
  'identifier',
  'ident',
]);

const NON_IDENTIFIER_KEY_MODIFIERS = new Set([
  'foreign',
  'fk',
  'sort',
  'partition',
  'group',
  'routing',
  'cache',
  'meta',
  'encryption',
  'public',
  'private',
  'secret',
  'license',
  'config',
  'setting',
]);

const ENTITY_CODE_QUALIFIERS = new Set([
  'customer',
  'user',
  'employee',
  'emp',
  'record',
  'account',
  'client',
  'vendor',
  'member',
  'order',
  'invoice',
  'transaction',
  'txn',
  'entity',
  'person',
  'patient',
  'student',
  'supplier',
  'merchant',
  'asset',
  'serial',
  'tracking',
  'unique',
  'primary',
  'lookup',
]);

const FOREIGN_KEY_ROLE_TOKENS = new Set([
  'manager',
  'supervisor',
  'parent',
  'agent',
  'physician',
  'doctor',
  'attending',
  'reviewer',
  'approver',
  'assigned',
  'assignee',
  'creator',
  'author',
  'owner',
  'referrer',
  'sponsor',
  'broker',
]);

export function isNamedIdentifierColumn(colName: string): boolean {
  const tokens = tokenizeColumnName(colName);
  if (tokens.length === 0) return false;
  const tokenSet = new Set(tokens);

  for (const t of tokenSet) {
    if (STRONG_ID_TOKENS.has(t)) return true;
  }

  if (tokenSet.has('key')) {
    let hasMod = false;
    for (const t of tokenSet) {
      if (NON_IDENTIFIER_KEY_MODIFIERS.has(t)) {
        hasMod = true;
        break;
      }
    }
    if (!hasMod) return true;
  }

  if (tokenSet.has('code')) {
    for (const t of tokenSet) {
      if (ENTITY_CODE_QUALIFIERS.has(t)) return true;
    }
  }

  if (
    (tokenSet.has('no') || tokenSet.has('num') || tokenSet.has('number')) &&
    !tokenSet.has('of')
  ) {
    for (const t of tokenSet) {
      if (ENTITY_CODE_QUALIFIERS.has(t)) return true;
    }
  }

  return false;
}

function getCollisionDetails(col: ColumnData): {
  collisionIndices: number[];
  collidingValues: (string | number | boolean)[];
} {
  const collisionIndices: number[] = [];
  const collidingValues: (string | number | boolean)[] = [];
  const totalRows = col.rowCount;

  if (col.dtype === 'str') {
    const codes = col.codes!;
    const counts = col.counts!;
    const dict = col.dict!;
    const seenDupCodes = new Set<number>();

    for (let r = 0; r < totalRows; r++) {
      const code = codes[r];
      if (code > 0 && counts[code] > 1) {
        collisionIndices.push(r);
        if (collidingValues.length < 5 && !seenDupCodes.has(code)) {
          seenDupCodes.add(code);
          collidingValues.push(dict[code]);
        }
      }
    }
    return { collisionIndices, collidingValues };
  }

  // Numeric column
  const sorted = col.sortedFinite;
  const nums = col.numValues!;
  if (!sorted || sorted.length === 0) {
    return { collisionIndices, collidingValues };
  }

  const dupNums = new Set<number>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) {
      dupNums.add(sorted[i]);
    }
  }

  const seenVals = new Set<number>();
  for (let r = 0; r < totalRows; r++) {
    const v = nums[r];
    if (!Number.isNaN(v) && dupNums.has(v)) {
      collisionIndices.push(r);
      if (collidingValues.length < 5 && !seenVals.has(v)) {
        seenVals.add(v);
        collidingValues.push(col.dtype === 'int64' ? Math.trunc(v) : v);
      }
    }
  }

  return { collisionIndices, collidingValues };
}

export function analyzeUniqueness(
  frame: ColumnarFrame,
  profiles: ColumnProfile[],
  precomputedDuplicateRows?: number
): Finding[] {
  const findings: Finding[] = [];
  const totalRows = frame.rowCount;
  if (totalRows <= 1) return findings;

  // 1. Exact Duplicate Rows
  const dupRowsCount =
    precomputedDuplicateRows !== undefined
      ? precomputedDuplicateRows
      : countExactDuplicateRows(frame);

  if (dupRowsCount > 0) {
    const dupRatio = dupRowsCount / totalRows;
    const severity: Severity =
      dupRatio >= 0.1 ? 'critical' : dupRatio >= 0.02 ? 'high' : 'medium';

    findings.push({
      id: 'FND-UNQ-EXACT-DUPS',
      category: 'uniqueness',
      severity,
      title: `Exact duplicate records detected (${dupRowsCount} rows, ${(dupRatio * 100).toFixed(1)}%)`,
      description: `The dataset contains ${dupRowsCount} redundant duplicate records across all columns. Duplication skews aggregate statistics, produces false variance deflation, and risks double-counting in business reports.`,
      affected_columns: frame.columnNames.slice(0, 50),
      affected_row_count: dupRowsCount,
      affected_row_ratio: roundTo(dupRatio, 4),
      evidence: [
        {
          metric_name: 'exact_duplicate_rows',
          observed_value: dupRowsCount,
          threshold_or_expected: 0,
          sample_row_indices: [],
          sample_values: [],
          details: `${dupRowsCount} excess rows are completely identical to prior records.`,
        },
      ],
      recommendations: [
        {
          finding_id: 'FND-UNQ-EXACT-DUPS',
          action:
            'Deduplicate records using primary keys or business timestamps before downstream consumption.',
          reason:
            'Duplicate records inflate sample sizes and compromise statistical independence assumptions.',
          priority: severity,
        },
      ],
    });
  }

  // 2. Candidate Primary-Key Collisions & Nulls
  const colProfileMap = new Map<string, ColumnProfile>();
  for (const p of profiles) {
    colProfileMap.set(p.name, p);
  }

  const namedIdRatios = new Map<string, number>();
  let hasIntactPrimaryId = false;

  for (const colName of frame.columnNames) {
    if (isNamedIdentifierColumn(colName)) {
      const prof = colProfileMap.get(colName);
      if (prof) {
        const uRatio =
          prof.non_null_count > 0
            ? prof.unique_count / prof.non_null_count
            : 0.0;
        namedIdRatios.set(colName, uRatio);
        if (
          prof.unique_count === totalRows &&
          prof.null_count === 0 &&
          totalRows > 1
        ) {
          hasIntactPrimaryId = true;
        }
      }
    }
  }

  let maxNamedIdRatio = 0.0;
  for (const r of namedIdRatios.values()) {
    if (r > maxNamedIdRatio) maxNamedIdRatio = r;
  }

  const primaryCollisionIndexSets: Set<number>[] = [];

  for (const colName of frame.columnNames) {
    const profile = colProfileMap.get(colName);
    const col = frame.columnsByName.get(colName);
    if (!col || !profile) continue;

    const isNamedId = isNamedIdentifierColumn(colName);
    const isCandidate =
      Boolean(profile.is_candidate_identifier) &&
      (isNamedId || profile.unique_count === totalRows);

    if (!isNamedId && !isCandidate) continue;

    const nullCount = profile.null_count;
    const nonNullCount = profile.non_null_count;
    const uniqueCount = profile.unique_count;
    const uniqueRatio = nonNullCount > 0 ? uniqueCount / nonNullCount : 0.0;
    // Note: in backend/app/engine/uniqueness.py line 193:
    // collision_count = int(non_null_series.duplicated(keep="first").sum()) === nonNullCount - uniqueCount
    const collisionCount =
      nonNullCount > 0 ? nonNullCount - uniqueCount : 0;

    const colTokens = new Set(tokenizeColumnName(colName));
    let hasFkRoleToken = false;
    for (const t of colTokens) {
      if (FOREIGN_KEY_ROLE_TOKENS.has(t)) {
        hasFkRoleToken = true;
        break;
      }
    }

    let isForeignKey = false;
    if (hasFkRoleToken && maxNamedIdRatio > uniqueRatio) {
      isForeignKey = true;
    } else if (
      uniqueRatio < 0.8 &&
      (totalRows >= 5 || collisionCount > 1 || maxNamedIdRatio > uniqueRatio)
    ) {
      isForeignKey = true;
    } else if (hasIntactPrimaryId && uniqueRatio < 0.95) {
      isForeignKey = true;
    }

    if (isForeignKey) continue;

    if (nonNullCount > 0 && collisionCount > 0) {
      const { collisionIndices, collidingValues } = getCollisionDetails(col);
      const collisionIdxSet = new Set<number>(collisionIndices);

      const isSubsetOfPrior = primaryCollisionIndexSets.some((prevSet) => {
        for (const idx of collisionIdxSet) {
          if (!prevSet.has(idx)) return false;
        }
        return true;
      });

      if (!isSubsetOfPrior) {
        primaryCollisionIndexSets.push(collisionIdxSet);
        const collisionRatio = collisionCount / totalRows;

        findings.push({
          id: `FND-UNQ-PK-COLLISION-${colName}`,
          category: 'uniqueness',
          severity: 'critical',
          title: `Primary key collision in candidate identifier '${colName}'`,
          description: `Column '${colName}' appears to be an entity identifier but contains ${collisionCount} colliding records (${(collisionRatio * 100).toFixed(1)}%). Repeating values like [${collidingValues.map((v) => `'${v}'`).join(', ')}] destroy entity uniqueness.`,
          affected_columns: [colName],
          affected_row_count: collisionCount,
          affected_row_ratio: roundTo(collisionRatio, 4),
          evidence: [
            {
              metric_name: 'identifier_collision_count',
              observed_value: collisionCount,
              threshold_or_expected: 0,
              sample_row_indices: collisionIndices.slice(0, 10),
              sample_values: collidingValues,
              details: `Conflicting identical keys detected in multiple separate records: [${collidingValues.map((v) => `'${v}'`).join(', ')}].`,
            },
          ],
          recommendations: [
            {
              finding_id: `FND-UNQ-PK-COLLISION-${colName}`,
              action: `Resolve identifier collision in '${colName}' before attempting database joins or entity mapping.`,
              reason:
                'Non-unique identifiers cause exponential cartesian explosions during relational joins.',
              priority: 'critical',
            },
          ],
        });
      }
    }

    if (nullCount > 0 && isNamedId) {
      const nullRatio = nullCount / totalRows;
      const severity: Severity = nullRatio > 0.05 ? 'critical' : 'high';
      const sampleNullIndices: number[] = [];
      if (col.dtype === 'str') {
        const codes = col.codes!;
        for (let r = 0; r < totalRows && sampleNullIndices.length < 10; r++) {
          if (codes[r] === 0) sampleNullIndices.push(r);
        }
      } else {
        const nums = col.numValues!;
        for (let r = 0; r < totalRows && sampleNullIndices.length < 10; r++) {
          if (Number.isNaN(nums[r])) sampleNullIndices.push(r);
        }
      }

      findings.push({
        id: `FND-UNQ-PK-NULL-${colName}`,
        category: 'uniqueness',
        severity,
        title: `Null entries present in candidate identifier '${colName}'`,
        description: `Candidate identifier column '${colName}' contains ${nullCount} null entries (${(nullRatio * 100).toFixed(1)}%). Entity identifiers must be strictly non-nullable.`,
        affected_columns: [colName],
        affected_row_count: nullCount,
        affected_row_ratio: roundTo(nullRatio, 4),
        evidence: [
          {
            metric_name: 'identifier_null_count',
            observed_value: nullCount,
            threshold_or_expected: 0,
            sample_row_indices: sampleNullIndices,
            sample_values: ['<NULL>'],
            details: `${nullCount} records lack an entity identifier.`,
          },
        ],
        recommendations: [
          {
            finding_id: `FND-UNQ-PK-NULL-${colName}`,
            action: `Impute or assign unique keys to orphaned records in '${colName}'.`,
            reason:
              'Null identifiers lead to untrackable records and join failures.',
            priority: 'high',
          },
        ],
      });
    }
  }

  // 3. Composite Uniqueness Diagnostic (INFO signal if found)
  const hasSingleUnique = profiles.some(
    (p) => p.unique_count === totalRows && p.null_count === 0
  );
  if (!hasSingleUnique && profiles.length >= 2 && totalRows >= 10) {
    const candidateCols = profiles
      .filter(
        (p) =>
          p.null_count === 0 && p.unique_ratio > 0.1 && p.unique_ratio < 1.0
      )
      .slice(0, 6)
      .map((p) => p.name);

    for (let i = 0; i < candidateCols.length; i++) {
      const colAName = candidateCols[i];
      const colA = frame.columnsByName.get(colAName);
      if (!colA) continue;

      for (let j = i + 1; j < candidateCols.length; j++) {
        const colBName = candidateCols[j];
        const colB = frame.columnsByName.get(colBName);
        if (!colB) continue;

        const seenPairs = new Set<string>();
        let allUnique = true;
        for (let r = 0; r < totalRows; r++) {
          const vA =
            colA.dtype === 'str' ? colA.codes![r] : colA.numValues![r];
          const vB =
            colB.dtype === 'str' ? colB.codes![r] : colB.numValues![r];
          const key = `${vA}\0${vB}`;
          if (seenPairs.has(key)) {
            allUnique = false;
            break;
          }
          seenPairs.add(key);
        }

        if (allUnique) {
          findings.push({
            id: `FND-UNQ-COMPOSITE-${colAName}-${colBName}`,
            category: 'uniqueness',
            severity: 'info',
            title: `Composite key candidate discovered: ('${colAName}', '${colBName}')`,
            description: `While no single column uniquely identifies every record, the composite combination of ('${colAName}', '${colBName}') is 100% unique across all ${totalRows} rows.`,
            affected_columns: [colAName, colBName],
            affected_row_count: 0,
            affected_row_ratio: 0.0,
            evidence: [
              {
                metric_name: 'composite_uniqueness_ratio',
                observed_value: 1.0,
                threshold_or_expected: 1.0,
                sample_row_indices: [],
                sample_values: [`(${colAName}, ${colBName})`],
                details:
                  'Composite pair uniquely identifies all records without nulls.',
              },
            ],
            recommendations: [
              {
                finding_id: `FND-UNQ-COMPOSITE-${colAName}-${colBName}`,
                action: `Enforce a composite unique constraint on ('${colAName}', '${colBName}') in target schemas.`,
                reason:
                  'Formalizing the natural composite key prevents future duplicate insertion.',
                priority: 'info',
              },
            ],
          });
          return findings;
        }
      }
    }
  }

  return findings;
}
