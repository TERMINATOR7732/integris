"""Local offline investigation runner for INTEGRIS.

Executes the existing INTEGRIS ingestion and forensic pipeline locally on a machine
without uploading dataset files to Render or any remote API.
"""

from app.offline.runner import (
    OfflineInvestigationError,
    investigate_file,
    investigate_file_to_dict,
    investigate_file_to_json,
)

__all__ = [
    "OfflineInvestigationError",
    "investigate_file",
    "investigate_file_to_dict",
    "investigate_file_to_json",
]
