"""Unit tests for the Integris Trust Score engine."""

from app.engine.scorer import calculate_trust_score
from app.models.report import (
    Evidence,
    ExecutiveVerdict,
    Finding,
    FindingCategory,
    Recommendation,
    Severity,
)


def _make_dummy_finding(fnd_id: str, severity: Severity, col: str = "col1") -> Finding:
    return Finding(
        id=fnd_id,
        category=FindingCategory.COMPLETENESS,
        severity=severity,
        title=f"Sample issue {fnd_id}",
        description="Sample description",
        affected_columns=[col],
        affected_row_count=10,
        affected_row_ratio=0.10,
        evidence=[],
        recommendations=[],
    )


def test_trust_score_pristine_dataset() -> None:
    """Zero findings must produce a 100.0 Trust Score with Grade A+ and RELIABLE verdict."""
    score = calculate_trust_score([])
    assert score.overall_score == 100.0
    assert score.grade == "A+"
    assert score.verdict == ExecutiveVerdict.RELIABLE
    assert score.total_deductions == 0.0
    assert len(score.penalties) == 0


def test_trust_score_critical_deduction() -> None:
    """Critical findings must deduct significant points and include penalty attribution."""
    findings = [
        _make_dummy_finding("FND-CRIT-1", Severity.CRITICAL, "id_col"),
    ]
    score = calculate_trust_score(findings)

    assert score.overall_score < 90.0
    assert len(score.penalties) == 1
    assert score.penalties[0].finding_id == "FND-CRIT-1"
    assert score.penalties[0].deduction > 10.0


def test_trust_score_column_cap_prevents_total_destruction() -> None:
    """A single pathological column with multiple anomalies should be capped at 35 points max."""
    findings = [
        _make_dummy_finding("FND-1", Severity.CRITICAL, "bad_col"),
        _make_dummy_finding("FND-2", Severity.CRITICAL, "bad_col"),
        _make_dummy_finding("FND-3", Severity.CRITICAL, "bad_col"),
        _make_dummy_finding("FND-4", Severity.CRITICAL, "bad_col"),
    ]
    score = calculate_trust_score(findings)

    # Without cap, 4 CRITICAL would be > 60 points deducted. With 35 cap, score remains >= 65.0
    assert score.overall_score >= 65.0
    assert score.total_deductions <= 35.0


def test_trust_score_verdicts() -> None:
    """Severe accumulated penalties should map to COMPROMISED verdict."""
    findings = [
        _make_dummy_finding(f"FND-CRIT-{i}", Severity.CRITICAL, f"col_{i}")
        for i in range(5)
    ]
    score = calculate_trust_score(findings)

    assert score.overall_score < 30.0
    assert score.verdict == ExecutiveVerdict.COMPROMISED
    assert score.grade == "F"
