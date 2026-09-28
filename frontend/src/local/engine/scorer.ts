/**
 * INTEGRIS Local Engine — Deterministic Trust Score Calculator
 * Mirrors backend/app/engine/scorer.py with 100% mathematical & schema parity.
 */

import type {
  ExecutiveVerdict,
  Finding,
  PenaltyItem,
  Severity,
  TrustScore,
} from '../../types/integris';
import { roundTo } from './profiler';

const BASE_PENALTIES: Record<Severity, number> = {
  critical: 20.0,
  high: 12.0,
  medium: 6.0,
  low: 2.0,
  info: 0.0,
};

const MAX_PER_COLUMN_PENALTY = 35.0;

export function calculateTrustScore(findings: Finding[]): TrustScore {
  if (!findings || findings.length === 0) {
    return {
      overall_score: 100.0,
      verdict: 'reliable',
      grade: 'A+',
      total_deductions: 0.0,
      penalties: [],
      rationale:
        'No integrity flaws or forensic anomalies detected. Dataset demonstrates pristine structural reliability.',
    };
  }

  const penalties: PenaltyItem[] = [];
  const columnAccPenalties = new Map<string, number>();
  let totalDeductions = 0.0;

  for (const fnd of findings) {
    const baseDeduction = BASE_PENALTIES[fnd.severity] ?? 0.0;
    if (baseDeduction <= 0.0) continue;

    let rawDeduction: number;
    if (fnd.severity === 'critical') {
      rawDeduction = baseDeduction;
    } else if (fnd.affected_row_ratio > 0) {
      const scaleFactor =
        0.6 + 0.4 * Math.min(1.0, fnd.affected_row_ratio * 2.0);
      rawDeduction = baseDeduction * scaleFactor;
    } else {
      rawDeduction = baseDeduction;
    }

    rawDeduction = roundTo(rawDeduction, 2);

    let effectiveDeduction = rawDeduction;
    if (fnd.affected_columns && fnd.affected_columns.length > 0) {
      let maxColAllowed = rawDeduction;
      for (const col of fnd.affected_columns) {
        const currentAcc = columnAccPenalties.get(col) ?? 0.0;
        const remaining = Math.max(0.0, MAX_PER_COLUMN_PENALTY - currentAcc);
        maxColAllowed = Math.min(maxColAllowed, remaining);
      }

      effectiveDeduction = Math.min(rawDeduction, maxColAllowed);
      for (const col of fnd.affected_columns) {
        columnAccPenalties.set(
          col,
          (columnAccPenalties.get(col) ?? 0.0) + effectiveDeduction
        );
      }
    }

    if (effectiveDeduction > 0.1) {
      totalDeductions += effectiveDeduction;
      penalties.push({
        finding_id: fnd.id,
        category: fnd.category,
        deduction: roundTo(effectiveDeduction, 2),
        reason: `${fnd.title} (${fnd.severity.toUpperCase()})`,
      });
    }
  }

  const overallScore = roundTo(
    Math.max(0.0, Math.min(100.0, 100.0 - totalDeductions)),
    1
  );

  let grade: string;
  let verdict: ExecutiveVerdict;
  let rationale: string;

  if (overallScore >= 90.0) {
    grade = overallScore < 97.0 ? 'A' : 'A+';
    verdict = 'reliable';
    rationale =
      'Dataset exhibits high structural integrity and can reasonably be trusted for downstream analytics.';
  } else if (overallScore >= 75.0) {
    grade = 'B';
    verdict = 'reliable';
    rationale =
      'Dataset is generally reliable with minor, remediable integrity issues identified.';
  } else if (overallScore >= 50.0) {
    grade = 'C';
    verdict = 'caution';
    rationale =
      'Moderate data-quality risks detected. Remediation is advised before high-stakes reporting or machine learning.';
  } else if (overallScore >= 30.0) {
    grade = 'D';
    verdict = 'caution';
    rationale =
      'Substantial integrity flaws present. Significant risk of biased inferences or modeling errors.';
  } else {
    grade = 'F';
    verdict = 'compromised';
    rationale =
      'Critical integrity failures detected. Dataset should NOT be trusted for production use without fundamental remediation.';
  }

  return {
    overall_score: overallScore,
    verdict,
    grade,
    total_deductions: roundTo(totalDeductions, 2),
    penalties,
    rationale,
  };
}
