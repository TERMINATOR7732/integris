"""INTEGRIS Forensic Analysis Engine.

Provides deterministic analyzers for data profiling, completeness, uniqueness,
validity, statistical distribution, consistency, and data leakage detection.
"""

from app.engine.completeness import analyze_completeness
from app.engine.consistency import analyze_consistency
from app.engine.distribution import analyze_distribution
from app.engine.leakage import analyze_leakage
from app.engine.pipeline import run_forensic_pipeline
from app.engine.profiler import profile_dataset
from app.engine.scorer import calculate_trust_score
from app.engine.uniqueness import analyze_uniqueness
from app.engine.validity import analyze_validity

__all__ = [
    "run_forensic_pipeline",
    "profile_dataset",
    "analyze_completeness",
    "analyze_uniqueness",
    "analyze_validity",
    "analyze_distribution",
    "analyze_consistency",
    "analyze_leakage",
    "calculate_trust_score",
]
