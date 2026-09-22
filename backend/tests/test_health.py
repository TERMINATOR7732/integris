"""Verification tests for health endpoint and forensic contract models."""

from fastapi.testclient import TestClient

from app.main import app
from app.models.report import (
    ColumnProfile,
    DatasetSummary,
    Evidence,
    ExecutiveVerdict,
    Finding,
    FindingCategory,
    ForensicDossier,
    HealthResponse,
    InvestigationMetadata,
    PenaltyItem,
    Recommendation,
    SemanticType,
    Severity,
    TrustScore,
)

client = TestClient(app)


def test_root_endpoint() -> None:
    """Ensure root endpoint responds with platform metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "INTEGRIS"
    assert "tagline" in data
    assert data["version"] == "0.1.0"


def test_health_endpoint() -> None:
    """Ensure /api/v1/health conforms to HealthResponse schema."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    # Validate against Pydantic schema
    health = HealthResponse.model_validate(data)
    assert health.status == "healthy"
    assert health.service == "INTEGRIS Forensic Engine"
    assert health.version == "0.1.0"
    assert health.engine_status == "ready"
    assert health.timestamp is not None


def test_forensic_dossier_contract_serialization() -> None:
    """Verify end-to-end serialization of the complete ForensicDossier contract."""
    mock_dossier = ForensicDossier(
        metadata=InvestigationMetadata(
            file_name="benchmark_audit.csv",
            file_size_bytes=10240,
            row_count=200,
            column_count=5,
            analyzed_at="2026-09-21T15:00:00Z",
            execution_time_ms=42.5,
            engine_version="0.1.0",
        ),
        summary=DatasetSummary(
            total_cells=1000,
            missing_cells=12,
            missing_cell_ratio=0.012,
            duplicate_rows=0,
            duplicate_row_ratio=0.0,
            memory_usage_bytes=8192,
        ),
        trust_score=TrustScore(
            overall_score=88.5,
            verdict=ExecutiveVerdict.RELIABLE,
            grade="B+",
            total_deductions=11.5,
            penalties=[
                PenaltyItem(
                    finding_id="FND-CMP-001",
                    category=FindingCategory.COMPLETENESS,
                    deduction=11.5,
                    reason="Disguised null tokens detected in critical column",
                )
            ],
            rationale="Dataset is structurally sound with minor missingness.",
        ),
        findings=[
            Finding(
                id="FND-CMP-001",
                category=FindingCategory.COMPLETENESS,
                severity=Severity.MEDIUM,
                title="Disguised null tokens present",
                description="Column 'age' contains '-999' values representing missing entries.",
                affected_columns=["age"],
                affected_row_count=12,
                affected_row_ratio=0.06,
                evidence=[
                    Evidence(
                        metric_name="disguised_token_match",
                        observed_value="-999",
                        sample_row_indices=[4, 18, 29],
                        sample_values=[-999],
                        details="Matches standard sentinel token pattern for missing numeric data.",
                    )
                ],
                recommendations=[
                    Recommendation(
                        finding_id="FND-CMP-001",
                        action="Impute or filter sentinel -999 values prior to statistical modeling.",
                        reason="Downstream numerical estimators will treat -999 as literal age values.",
                        priority=Severity.MEDIUM,
                    )
                ],
            )
        ],
        columns=[
            ColumnProfile(
                name="age",
                inferred_dtype="int64",
                semantic_type=SemanticType.NUMERIC_DISCRETE,
                non_null_count=188,
                null_count=12,
                null_ratio=0.06,
                unique_count=45,
                unique_ratio=0.225,
                sample_values=[25, 30, 42, -999],
                anomalies_detected=1,
            )
        ],
        recommendations=[
            Recommendation(
                finding_id="FND-CMP-001",
                action="Impute or filter sentinel -999 values prior to statistical modeling.",
                reason="Downstream numerical estimators will treat -999 as literal age values.",
                priority=Severity.MEDIUM,
            )
        ],
    )

    # Serialize to JSON and validate roundtrip
    json_data = mock_dossier.model_dump_json()
    assert isinstance(json_data, str)
    reconstructed = ForensicDossier.model_validate_json(json_data)
    assert reconstructed.trust_score.overall_score == 88.5
    assert reconstructed.findings[0].id == "FND-CMP-001"
    assert reconstructed.columns[0].semantic_type == SemanticType.NUMERIC_DISCRETE
