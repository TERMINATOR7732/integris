"""Forensic Pipeline Orchestrator for INTEGRIS.

Coordinates tabular ingestion, executes specialized forensic analyzers in sequence,
aggregates findings, calculates the Integris Trust Score, and packages the complete ForensicDossier.
"""

from datetime import datetime, timezone
import time
import pandas as pd

from app.engine.completeness import analyze_completeness
from app.engine.consistency import analyze_consistency
from app.engine.distribution import analyze_distribution
from app.engine.leakage import analyze_leakage
from app.engine.profiler import _deduplicate_columns, profile_dataset
from app.engine.scorer import calculate_trust_score
from app.engine.uniqueness import analyze_uniqueness
from app.engine.validity import analyze_validity
from app.models.report import (
    ForensicDossier,
    InvestigationMetadata,
    Recommendation,
    Severity,
)

SEVERITY_ORDER: dict[Severity, int] = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
    Severity.INFO: 4,
}


def run_forensic_pipeline(
    df: pd.DataFrame,
    file_name: str = "dataset.csv",
    file_size_bytes: int = 0,
    target_column: str | None = None,
    file_type: str = "csv",
    sheet_name: str | None = None,
    available_sheets: list[str] | None = None,
    table_index: int | None = None,
    page_count: int | None = None,
) -> ForensicDossier:
    """Execute the end-to-end forensic analysis pipeline on a tabular dataset in-memory.
    
    Args:
        df: Pandas DataFrame parsed entirely in memory.
        file_name: Client-provided dataset file name.
        file_size_bytes: Uploaded byte size.
        target_column: Optional target feature for machine learning leakage checks.
        file_type: Ingested file type (csv, tsv, txt, xlsx, xls, pdf).
        sheet_name: Analyzed sheet name for spreadsheets.
        available_sheets: All discovered sheets in workbook.
        table_index: Extracted table index for documents.
        page_count: Page count for documents.
        
    Returns:
        Strongly typed ForensicDossier model.
    """
    start_time = time.perf_counter()
    analyzed_timestamp = datetime.now(timezone.utc).isoformat()

    df = _deduplicate_columns(df)

    # 1. Profiler: Extract structural dimensions and column properties
    summary, column_profiles = profile_dataset(df)

    # 2. Sequential execution of specialized forensic analyzers
    findings = []
    findings.extend(analyze_completeness(df, column_profiles))
    findings.extend(analyze_uniqueness(df, column_profiles))
    findings.extend(analyze_validity(df, column_profiles))
    findings.extend(analyze_distribution(df, column_profiles))
    findings.extend(analyze_consistency(df, column_profiles))
    findings.extend(analyze_leakage(df, column_profiles, target_column=target_column))

    # 3. Deduplicate findings by finding ID (if any duplicate IDs occur)
    seen_ids = set()
    deduped_findings = []
    for f in findings:
        if f.id not in seen_ids:
            seen_ids.add(f.id)
            deduped_findings.append(f)

    # Sort findings by severity (Critical -> High -> Medium -> Low -> Info)
    deduped_findings.sort(key=lambda f: SEVERITY_ORDER.get(f.severity, 99))

    # 4. Attribute anomalies count back to individual column profiles
    col_profile_map = {p.name: p for p in column_profiles}
    for f in deduped_findings:
        for col_name in f.affected_columns:
            if col_name in col_profile_map:
                col_profile_map[col_name].anomalies_detected += 1

    # 5. Compute the Integris Trust Score
    trust_score = calculate_trust_score(deduped_findings)

    # 6. Aggregate unique actionable recommendations sorted by priority
    all_recommendations: list[Recommendation] = []
    for f in deduped_findings:
        all_recommendations.extend(f.recommendations)
    all_recommendations.sort(key=lambda r: SEVERITY_ORDER.get(r.priority, 99))

    execution_duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    # 7. Package and return the Forensic Dossier
    metadata = InvestigationMetadata(
        file_name=file_name,
        file_size_bytes=file_size_bytes,
        row_count=len(df),
        column_count=len(df.columns),
        analyzed_at=analyzed_timestamp,
        execution_time_ms=execution_duration_ms,
        engine_version="0.1.0",
        file_type=file_type,
        sheet_name=sheet_name,
        available_sheets=available_sheets,
        table_index=table_index,
        page_count=page_count,
    )

    return ForensicDossier(
        metadata=metadata,
        summary=summary,
        trust_score=trust_score,
        findings=deduped_findings,
        columns=column_profiles,
        recommendations=all_recommendations,
    )
