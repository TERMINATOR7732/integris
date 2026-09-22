"""Integris Trust Score Engine.

Calculates a deterministic, explainable 0–100 composite integrity score
with itemized penalty attribution and column-level safeguards.
"""

from app.models.report import (
    ExecutiveVerdict,
    Finding,
    FindingCategory,
    PenaltyItem,
    Severity,
    TrustScore,
)

# Standard base deductions by severity tier
BASE_PENALTIES: dict[Severity, float] = {
    Severity.CRITICAL: 20.0,
    Severity.HIGH: 12.0,
    Severity.MEDIUM: 6.0,
    Severity.LOW: 2.0,
    Severity.INFO: 0.0,
}

# Maximum penalty that a single column can contribute across all findings
MAX_PER_COLUMN_PENALTY: float = 35.0


def calculate_trust_score(findings: list[Finding]) -> TrustScore:
    """Compute the deterministic Integris Trust Score (0-100) from findings.
    
    Methodology:
        1. Base score starts at 100.0 (pristine integrity).
        2. Each finding deducts points based on its severity tier and affected proportion.
        3. A column penalty cap (35 pts max) prevents a single noisy feature from destroying the overall score.
        4. Deductions are itemized into transparent, explainable PenaltyItem records.
        5. Final score maps to an ExecutiveVerdict and letter grade.
        
    Args:
        findings: List of all forensic findings detected by the pipeline.
        
    Returns:
        Structured TrustScore with full penalty audit trail.
    """
    if not findings:
        return TrustScore(
            overall_score=100.0,
            verdict=ExecutiveVerdict.RELIABLE,
            grade="A+",
            total_deductions=0.0,
            penalties=[],
            rationale="No integrity flaws or forensic anomalies detected. Dataset demonstrates pristine structural reliability.",
        )

    penalties: list[PenaltyItem] = []
    column_acc_penalties: dict[str, float] = {}
    total_deductions = 0.0

    for fnd in findings:
        base_deduction = BASE_PENALTIES.get(fnd.severity, 0.0)
        if base_deduction <= 0.0:
            continue

        # Scale penalty moderately by proportion of compromised records if applicable
        if fnd.severity == Severity.CRITICAL:
            raw_deduction = base_deduction
        elif fnd.affected_row_ratio > 0:
            scale_factor = 0.60 + (0.40 * min(1.0, fnd.affected_row_ratio * 2.0))
            raw_deduction = base_deduction * scale_factor
        else:
            raw_deduction = base_deduction

        raw_deduction = round(raw_deduction, 2)

        # Apply column-level penalty cap to avoid pathological single-column destruction
        effective_deduction = raw_deduction
        if fnd.affected_columns:
            # Distribute / evaluate cap against affected columns
            max_col_allowed = raw_deduction
            for col in fnd.affected_columns:
                current_acc = column_acc_penalties.get(col, 0.0)
                remaining = max(0.0, MAX_PER_COLUMN_PENALTY - current_acc)
                max_col_allowed = min(max_col_allowed, remaining)

            effective_deduction = min(raw_deduction, max_col_allowed)
            # Update accumulator for each column
            for col in fnd.affected_columns:
                column_acc_penalties[col] = column_acc_penalties.get(col, 0.0) + effective_deduction

        if effective_deduction > 0.1:
            total_deductions += effective_deduction
            penalties.append(
                PenaltyItem(
                    finding_id=fnd.id,
                    category=fnd.category,
                    deduction=round(effective_deduction, 2),
                    reason=f"{fnd.title} ({fnd.severity.value.upper()})",
                )
            )

    # Compute clamped score
    overall_score = round(max(0.0, min(100.0, 100.0 - total_deductions)), 1)

    # Assign Grade and Executive Verdict
    if overall_score >= 90.0:
        grade = "A" if overall_score < 97.0 else "A+"
        verdict = ExecutiveVerdict.RELIABLE
        rationale = "Dataset exhibits high structural integrity and can reasonably be trusted for downstream analytics."
    elif overall_score >= 75.0:
        grade = "B"
        verdict = ExecutiveVerdict.RELIABLE
        rationale = "Dataset is generally reliable with minor, remediable integrity issues identified."
    elif overall_score >= 50.0:
        grade = "C"
        verdict = ExecutiveVerdict.CAUTION
        rationale = "Moderate data-quality risks detected. Remediation is advised before high-stakes reporting or machine learning."
    elif overall_score >= 30.0:
        grade = "D"
        verdict = ExecutiveVerdict.CAUTION
        rationale = "Substantial integrity flaws present. Significant risk of biased inferences or modeling errors."
    else:
        grade = "F"
        verdict = ExecutiveVerdict.COMPROMISED
        rationale = "Critical integrity failures detected. Dataset should NOT be trusted for production use without fundamental remediation."

    return TrustScore(
        overall_score=overall_score,
        verdict=verdict,
        grade=grade,
        total_deductions=round(total_deductions, 2),
        penalties=penalties,
        rationale=rationale,
    )
