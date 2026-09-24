"""Forensic data contract and Pydantic models for INTEGRIS.

Defines schemas for investigation metadata, dataset profiling, forensic findings,
quantified evidence chains, Trust Score attribution, and the complete Forensic Dossier.
"""

import math
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Severity(str, Enum):
    """Forensic finding severity classification."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ExecutiveVerdict(str, Enum):
    """Executive dataset trustworthiness verdict."""

    RELIABLE = "reliable"
    CAUTION = "caution"
    COMPROMISED = "compromised"


class FindingCategory(str, Enum):
    """Classification of forensic anomalies."""

    COMPLETENESS = "completeness"
    UNIQUENESS = "uniqueness"
    VALIDITY = "validity"
    DISTRIBUTION = "distribution"
    CONSISTENCY = "consistency"
    DATA_LEAKAGE = "data_leakage"
    SCHEMA = "schema"


class SemanticType(str, Enum):
    """Inferred semantic role of a column."""

    NUMERIC_CONTINUOUS = "numeric_continuous"
    NUMERIC_DISCRETE = "numeric_discrete"
    CATEGORICAL = "categorical"
    DATETIME = "datetime"
    IDENTIFIER = "identifier"
    FREE_TEXT = "free_text"
    BOOLEAN = "boolean"
    UNKNOWN = "unknown"


class InvestigationMetadata(BaseModel):
    """Execution context and dataset physical properties."""

    model_config = ConfigDict(frozen=True)

    file_name: str = Field(description="Original name of the ingested dataset")
    file_size_bytes: int = Field(ge=0, description="Size of the raw file in bytes")
    row_count: int = Field(ge=0, description="Total number of physical rows parsed")
    column_count: int = Field(ge=0, description="Total number of columns parsed")
    analyzed_at: str = Field(description="ISO 8601 UTC timestamp of the investigation")
    execution_time_ms: float = Field(ge=0.0, description="Forensic pipeline runtime in milliseconds")
    engine_version: str = Field(default="0.1.0", description="Version of the INTEGRIS forensic engine")
    file_type: str = Field(default="csv", description="Ingested file format extension/type")
    sheet_name: str | None = Field(default=None, description="Analyzed spreadsheet sheet name if applicable")
    available_sheets: list[str] | None = Field(default=None, description="All sheet names found in workbook")
    table_index: int | None = Field(default=None, description="Table index extracted from document")
    page_count: int | None = Field(default=None, description="Total page count if document format")


class DatasetSummary(BaseModel):
    """High-level structural metrics of the investigated dataset."""

    model_config = ConfigDict(frozen=True)

    total_cells: int = Field(ge=0, description="row_count * column_count")
    missing_cells: int = Field(ge=0, description="Count of empty, null, or disguised null cells")
    missing_cell_ratio: float = Field(ge=0.0, le=1.0, description="Fraction of missing cells")
    duplicate_rows: int = Field(ge=0, description="Exact duplicate row count")
    duplicate_row_ratio: float = Field(ge=0.0, le=1.0, description="Fraction of exact duplicate rows")
    memory_usage_bytes: int = Field(ge=0, description="Estimated in-memory footprint")


class ColumnProfile(BaseModel):
    """Statistical and structural profile of an individual column."""

    name: str = Field(description="Column header name")
    inferred_dtype: str = Field(description="Underlying data type (e.g. int64, float64, object)")
    semantic_type: SemanticType = Field(description="Inferred functional role of the column")
    non_null_count: int = Field(ge=0, description="Count of valid non-null entries")
    null_count: int = Field(ge=0, description="Count of null or missing entries")
    null_ratio: float = Field(ge=0.0, le=1.0, description="Null ratio in [0, 1]")
    unique_count: int = Field(ge=0, description="Cardinality / unique distinct value count")
    unique_ratio: float = Field(ge=0.0, le=1.0, description="Distinct value ratio")
    sample_values: list[Any] = Field(default_factory=list, description="Sanitized representative values")
    anomalies_detected: int = Field(default=0, ge=0, description="Count of anomalies flagging this column")
    min_value: Any | None = Field(default=None, description="Minimum value if ordered/numeric")
    max_value: Any | None = Field(default=None, description="Maximum value if ordered/numeric")
    mean: float | None = Field(default=None, description="Arithmetic mean for numeric columns")
    median: float | None = Field(default=None, description="Median value for numeric columns")
    std_dev: float | None = Field(default=None, description="Standard deviation for numeric columns")
    memory_bytes: int | None = Field(default=None, description="Memory consumption in bytes")
    is_candidate_identifier: bool = Field(default=False, description="Whether column appears to be a unique identifier")
    is_constant_or_near_constant: bool = Field(default=False, description="Whether column has zero or near-zero variance")

    @field_validator("min_value", "max_value", "mean", "median", "std_dev", "null_ratio", "unique_ratio", mode="before")
    @classmethod
    def _sanitize_numeric_fields(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    @field_validator("sample_values", mode="before")
    @classmethod
    def _sanitize_sample_values(cls, values: list[Any]) -> list[Any]:
        if not values:
            return []
        cleaned = []
        for val in values:
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                cleaned.append(None)
            else:
                cleaned.append(val)
        return cleaned


class Evidence(BaseModel):
    """Mathematical or structural proof supporting a forensic finding."""

    metric_name: str = Field(description="Identifier of the metric (e.g. benford_mad, z_score, null_ratio)")
    observed_value: Any = Field(description="Quantified observed value in the dataset")
    threshold_or_expected: Any = Field(default=None, description="Expected baseline or threshold violation level")
    sample_row_indices: list[int] = Field(default_factory=list, description="Sample row coordinates exhibiting the issue")
    sample_values: list[Any] = Field(default_factory=list, description="Extracted sample values demonstrating the finding")
    details: str | None = Field(default=None, description="Technical narrative detailing mathematical proof")

    @field_validator("observed_value", "threshold_or_expected", mode="before")
    @classmethod
    def _sanitize_evidence_scalars(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        if isinstance(v, list):
            return [None if (isinstance(item, float) and (math.isnan(item) or math.isinf(item))) else item for item in v]
        return v

    @field_validator("sample_values", mode="before")
    @classmethod
    def _sanitize_evidence_samples(cls, values: list[Any]) -> list[Any]:
        if not values:
            return []
        cleaned = []
        for val in values:
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                cleaned.append(None)
            else:
                cleaned.append(val)
        return cleaned


class Recommendation(BaseModel):
    """Actionable remediation step for a specific finding."""

    finding_id: str = Field(description="ID of the finding this recommendation addresses")
    action: str = Field(description="Concrete recommended action for the analyst")
    reason: str = Field(description="Forensic rationale justifying the action")
    priority: Severity = Field(description="Urgency of applying this remediation")


class Finding(BaseModel):
    """An individual forensic finding detailing an anomaly, risk, or integrity flaw."""

    id: str = Field(description="Unique identifier for the finding (e.g. FND-CMP-001)")
    category: FindingCategory = Field(description="Forensic domain category")
    severity: Severity = Field(description="Severity impact of the finding")
    title: str = Field(description="Executive headline summary of the issue")
    description: str = Field(description="Explainable forensic breakdown of why this matters")
    affected_columns: list[str] = Field(default_factory=list, description="Columns involved in the anomaly")
    affected_row_count: int = Field(default=0, ge=0, description="Count of records compromised by this issue")
    affected_row_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="Ratio of records compromised")
    evidence: list[Evidence] = Field(default_factory=list, description="Quantified evidence backing this finding")
    recommendations: list[Recommendation] = Field(default_factory=list, description="Remediation steps")


class PenaltyItem(BaseModel):
    """Deduction item contributing to the overall Trust Score calculation."""

    finding_id: str = Field(description="ID of the finding responsible for the deduction")
    category: FindingCategory = Field(description="Category of the penalty")
    deduction: float = Field(ge=0.0, description="Points deducted from the baseline score")
    reason: str = Field(description="Attribution narrative for this penalty")


class TrustScore(BaseModel):
    """Composite integrity metric with explainable deduction audit trail."""

    overall_score: float = Field(ge=0.0, le=100.0, description="Composite score from 0.0 (toxic) to 100.0 (pristine)")
    verdict: ExecutiveVerdict = Field(description="High-level trust classification")
    grade: str = Field(description="Letter grade: A, B, C, D, or F")
    total_deductions: float = Field(ge=0.0, description="Sum of all applied penalties")
    penalties: list[PenaltyItem] = Field(default_factory=list, description="Detailed itemization of point deductions")
    rationale: str = Field(description="Executive narrative explaining the verdict")


class ForensicDossier(BaseModel):
    """Complete, self-contained forensic investigation report."""

    metadata: InvestigationMetadata
    summary: DatasetSummary
    trust_score: TrustScore
    findings: list[Finding] = Field(default_factory=list)
    columns: list[ColumnProfile] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Health check status response."""

    status: str = Field(default="healthy", description="Service health state")
    service: str = Field(default="INTEGRIS Forensic Engine", description="Service name")
    version: str = Field(default="0.1.0", description="API and Engine version")
    engine_status: str = Field(default="ready", description="Forensic analysis engine status")
    timestamp: str = Field(description="Current server UTC timestamp in ISO 8601 format")
