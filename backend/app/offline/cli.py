"""Command-line interface for INTEGRIS Offline Investigation Mode.

Usage (from `backend/` directory):
    python -m app.offline investigate ../datasets/clean_baseline.csv
    python -m app.offline investigate ../datasets/corrupted_forensic.csv --target-column attrition
    python -m app.offline investigate ../datasets/clean_baseline.csv --output report.json

Usage (from repository root):
    python backend/app/offline/cli.py investigate datasets/clean_baseline.csv
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

# Ensure `backend/` is on sys.path when invoked directly from the repository root
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.offline.runner import OfflineInvestigationError, investigate_file_to_dict  # noqa: E402


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.offline",
        description=(
            "INTEGRIS Offline Investigation Mode — Run the INTEGRIS forensic engine "
            "locally on your machine without uploading datasets to any remote server."
        ),
    )
    subparsers = parser.add_subparsers(dest="command")

    investigate_parser = subparsers.add_parser(
        "investigate",
        help="Investigate a local dataset file (.csv, .tsv, .txt, .xlsx, .xls, .pdf).",
        description=(
            "Validate, parse, and analyze a local dataset using the INTEGRIS forensic "
            "engine entirely on the local machine."
        ),
    )
    investigate_parser.add_argument(
        "dataset",
        type=str,
        help="Path to the local dataset file (.csv, .tsv, .txt, .xlsx, .xls, .pdf).",
    )
    investigate_parser.add_argument(
        "-t",
        "--target-column",
        dest="target_column",
        type=str,
        default=None,
        help="Optional target column name for machine-learning leakage detection.",
    )
    investigate_parser.add_argument(
        "-o",
        "--output",
        dest="output",
        type=str,
        default=None,
        help="Optional file path to write the ForensicDossier JSON report (defaults to stdout).",
    )
    investigate_parser.add_argument(
        "--compact",
        action="store_true",
        help="Emit compact single-line JSON instead of pretty-printed JSON.",
    )
    return parser


def _format_summary(dossier_dict: dict, output_path: Path) -> str:
    meta = dossier_dict.get("metadata", {})
    score = dossier_dict.get("trust_score", {})
    findings = dossier_dict.get("findings", [])
    return (
        f"INTEGRIS Offline Investigation Complete\n"
        f"  Dataset       : {meta.get('file_name')} ({meta.get('file_type', '').upper()})\n"
        f"  Dimensions    : {meta.get('row_count', 0):,} rows x {meta.get('column_count', 0):,} columns\n"
        f"  Trust Score   : {score.get('overall_score')} / 100.0 (Grade {score.get('grade')}, Verdict: {str(score.get('verdict', '')).upper()})\n"
        f"  Findings      : {len(findings)}\n"
        f"  Execution Time: {meta.get('execution_time_ms')} ms\n"
        f"  Report Saved  : {output_path}\n"
    )


def main(argv: Sequence[str] | None = None) -> int:
    """Execute the INTEGRIS offline CLI and return an exit status code."""
    args_list = list(sys.argv[1:] if argv is None else argv)

    # Allow convenient shorthand `python -m app.offline path/to/file.csv`
    # while keeping `python -m app.offline investigate path/to/file.csv` as the primary syntax
    if (
        args_list
        and not args_list[0].startswith("-")
        and args_list[0] != "investigate"
    ):
        args_list = ["investigate", *args_list]

    parser = _build_parser()
    if not args_list:
        parser.print_help(sys.stderr)
        return 2

    try:
        parsed = parser.parse_args(args_list)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

    if parsed.command != "investigate":
        parser.print_help(sys.stderr)
        return 2

    input_path = Path(parsed.dataset)
    output_path: Path | None = Path(parsed.output) if parsed.output else None

    if output_path is not None:
        try:
            if input_path.exists() and output_path.resolve() == input_path.resolve():
                print(
                    "Error: Refusing to overwrite the input dataset file with the output report.",
                    file=sys.stderr,
                )
                return 1
        except OSError:
            pass

    try:
        dossier_dict = investigate_file_to_dict(
            file_path=input_path,
            target_column=parsed.target_column,
        )
        indent = None if parsed.compact else 2
        json_text = json.dumps(dossier_dict, indent=indent, allow_nan=False)

        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json_text + "\n", encoding="utf-8")
            print(_format_summary(dossier_dict, output_path), end="", file=sys.stdout)
        else:
            print(json_text, file=sys.stdout)

        return 0
    except OfflineInvestigationError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(
            f"Error: Failed to write output report: {exc.strerror or 'OS error'}.",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:
        print(
            f"Error: Offline investigation encountered an unexpected error ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
