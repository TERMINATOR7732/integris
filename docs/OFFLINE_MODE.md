# INTEGRIS — Browser-Local & Offline Investigation Modes

INTEGRIS provides two ways to run forensic investigations locally without uploading datasets to Render or any remote API:

1. **Browser-Local Mode (`LOCAL` in the Vercel Web UI):** Runs the complete 6-module forensic engine directly inside an isolated browser Web Worker (`frontend/src/local/`) across all 6 supported formats: `.csv`, `.tsv`, and `.txt` up to `50 MB` (including `45 MB` stress datasets), `.xlsx` and `.xls` up to `25 MB` (with `250 MB` uncompressed bomb protection), and `.pdf` up to `15 MB`.
2. **Python CLI Offline Mode (`backend/app/offline/`):** Runs the Python ingestion and forensic pipeline (`backend/app/engine/`) directly from a local terminal across `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf` files.

---

## 1. Architecture

```text
                             INTEGRIS
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
          ONLINE (Web)    LOCAL (Browser)   OFFLINE (CLI)
                 │              │              │
            Render API     Web Worker     Local CLI Runner
        (app/api/routes) (src/local/*)  (app/offline/runner)
                 │              │              │
                 ▼              ▼              ▼
             ForensicDossier JSON Contract (Identical Parity)
```

- **Browser-Local Engine (`frontend/src/local/`):**
  - `ingestion/detector.ts`: Validates magic bytes (`%PDF`, `PK\x03\x04`, OLE2, null bytes), enforces per-format size limits (`50 MB` CSV/TSV/TXT, `25 MB` XLSX/XLS, `15 MB` PDF) and dimension limits (`500,000` rows, `1,000` columns).
  - `ingestion/csvParser.ts`: Auto-detects delimiters and text encodings (`UTF-8`, `CP1252`), and executes a 2-pass byte-streaming RFC 4180 parse into compact typed arrays (`Float64Array` for numeric/boolean columns and dictionary-encoded `Int32Array` for string columns).
  - `ingestion/excelParser.ts`: Validates `.xlsx` ZIP Central Directory headers (enforcing a `250 MB` uncompressed decompression-bomb guard) and `.xls` OLE2 headers, selects the first worksheet with usable tabular rows, normalizes date cells (`YYYY-MM-DD HH:MM:SS`), and preserves literal strings like `"N/A"`.
  - `ingestion/pdfParser.ts`: Uses `pdfjs-dist` with an embedded in-process fake-worker (`LoopbackPort`) to extract ruled table grids from PDF vector paths and text operators across single-page and multi-page documents with zero network calls.
  - `engine/*`: Exact TypeScript ports of `profiler`, `completeness`, `uniqueness`, `validity`, `distribution`, `consistency`, `leakage`, `scorer`, `sanitizer`, and `pipeline`, verified for 100% output parity against the Python reference engine.
  - `worker/forensicWorker.ts` & `workerClient.ts`: Transfers the file's `ArrayBuffer` with zero copy into a dedicated Web Worker, streams stage progress updates (`0%` → `100%`), and supports instant `AbortSignal` cancellation (`worker.terminate()`).
- **Python Reference Engine (`backend/app/engine/` & `backend/app/offline/`):**
  - `backend/app/engine/` (`profiler.py`, `completeness.py`, `uniqueness.py`, `validity.py`, `distribution.py`, `consistency.py`, `leakage.py`, `scorer.py`, `pipeline.py`, `sanitizer.py`) and `backend/app/ingestion/` remain untouched and un-duplicated.
  - `backend/app/offline/runner.py` & `cli.py`: Provides the command-line interface (`python -m app.offline investigate ...`).

---

## 2. Browser-Local Mode Usage (No Installation Required)

1. Open [https://integris-ten.vercel.app](https://integris-ten.vercel.app) (or `http://localhost:5173` in local development).
2. Select **`LOCAL`** in the Execution Mode toggle (`LOCAL PROCESSING — Your file stays in this browser.`).
3. Drop or browse for a `.csv`, `.tsv`, `.txt` (up to `50 MB`), `.xlsx`, `.xls` (up to `25 MB`), or `.pdf` (up to `15 MB`) dataset.
4. Optionally select or enter a target column for ML leakage checks and click **Run Local Investigation**.
5. Inspect the resulting Forensic Dossier (`Processed locally — no server upload.`) and export to Markdown, JSON, or Print/PDF.

---

## 3. Python CLI Installation & Setup

### Prerequisites

- **Python:** `3.10+` (tested with Python `3.12`)
- Local clone of the INTEGRIS repository

### Setup

```bash
git clone https://github.com/TERMINATOR7732/integris.git
cd integris/backend

python -m venv .venv

# Activate virtual environment (Windows PowerShell):
.venv\Scripts\Activate.ps1
# Or on macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

---

## 3. Usage

Run the offline investigator from the `backend/` directory (or from the repository root using `python backend/app/offline/cli.py`):

### Investigate a dataset and print JSON to `stdout`

```bash
cd backend
python -m app.offline investigate ../datasets/clean_baseline.csv
```

### Save the `ForensicDossier` JSON report to a file (`--output` / `-o`)

```bash
cd backend
python -m app.offline investigate ../datasets/moderate_quality.csv --output ../dossier_moderate.json
```

When `--output` is specified, the CLI writes the full JSON dossier to the target file and prints a concise executive summary to `stdout`:

```text
INTEGRIS Offline Investigation Complete
  Dataset       : moderate_quality.csv (CSV)
  Dimensions    : 50 rows x 12 columns
  Trust Score   : 68.1 / 100.0 (Grade C, Verdict: CAUTION)
  Findings      : 7
  Execution Time: 39.42 ms
  Report Saved  : ..\dossier_moderate.json
```

### Specify an optional target column for ML leakage checks (`--target-column` / `-t`)

```bash
cd backend
python -m app.offline investigate ../datasets/corrupted_forensic.csv --target-column attrition --output ../dossier_corrupted.json
```

### Emit compact single-line JSON (`--compact`)

```bash
cd backend
python -m app.offline investigate ../datasets/clean_baseline.csv --compact
```

### Programmatic Python API

You can also invoke the offline runner directly from Python code inside `backend/`:

```python
from app.offline import investigate_file, investigate_file_to_dict, investigate_file_to_json

dossier = investigate_file("../datasets/corrupted_forensic.csv", target_column="attrition")
print(dossier.trust_score.overall_score, dossier.trust_score.verdict)

dossier_dict = investigate_file_to_dict("../datasets/clean_baseline.csv")
dossier_json = investigate_file_to_json("../datasets/clean_baseline.csv", indent=2)
```

---

## 4. Supported Formats

Offline Investigation Mode uses the exact same `backend/app/ingestion/` parsers and magic-byte validators as the online API:

| Format | Extension | Max File Size | Notes |
| :--- | :---: | :---: | :--- |
| **Comma-Separated Values** | `.csv` | `50 MB` | Automatic delimiter (`,`, `\t`, `;`, `\|`) and encoding (`UTF-8-SIG`, `UTF-8`, `CP1252`, `Latin-1`) detection |
| **Tab-Separated Values** | `.tsv` | `50 MB` | Preserves literal sentinel tokens (`"N/A"`, `"null"`, `"?"`) for forensic inspection |
| **Delimited Text** | `.txt` | `50 MB` | Requires structured tabular delimiters; unstructured natural-language prose is rejected |
| **Excel Workbook (OpenXML)** | `.xlsx` | `25 MB` | Validates `PK\x03\x04` signature and `250 MB` uncompressed ZIP ceiling; selects first non-empty worksheet |
| **Legacy Excel Workbook** | `.xls` | `25 MB` | Validates OLE2 binary signature (`\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1`) |
| **PDF Document** | `.pdf` | `15 MB` | Validates `%PDF` header; extracts machine-readable vector tables across pages via `pdfplumber` |

Post-parse structural bounds remain `500,000` rows and `1,000` columns.

---

## 5. Output Format

Offline Investigation Mode produces the exact `ForensicDossier` schema (`backend/app/models/report.py`) returned by `POST /api/v1/investigate`, sanitized via `sanitize_for_json()` for strict RFC 8259 JSON compliance (`NaN` and `±Infinity` converted to `null`):

```json
{
  "metadata": {
    "file_name": "clean_baseline.csv",
    "file_size_bytes": 4260,
    "row_count": 50,
    "column_count": 12,
    "analyzed_at": "2026-09-28T07:18:58.630889+00:00",
    "execution_time_ms": 37.54,
    "engine_version": "0.1.0",
    "file_type": "csv",
    "sheet_name": null,
    "available_sheets": null,
    "table_index": null,
    "page_count": null
  },
  "summary": {
    "total_cells": 600,
    "missing_cells": 45,
    "missing_cell_ratio": 0.075,
    "duplicate_rows": 0,
    "duplicate_row_ratio": 0.0,
    "memory_usage_bytes": 23069
  },
  "trust_score": {
    "overall_score": 100.0,
    "verdict": "reliable",
    "grade": "A+",
    "total_deductions": 0.0,
    "penalties": [],
    "rationale": "Dataset exhibits high structural integrity and can reasonably be trusted for downstream analytics."
  },
  "findings": [...],
  "columns": [...],
  "recommendations": [...]
}
```

For identical input files and `target_column` arguments, Offline Mode produces the exact same `summary`, `trust_score` (`overall_score`, `verdict`, `grade`, `penalties`), `findings`, `columns`, and `recommendations` as the online API (differing only in runtime metadata `analyzed_at` and `execution_time_ms`).

---

## 6. Online vs. Offline Comparison

| Dimension | Online Mode (Default Web Workflow) | Offline Mode (Local CLI Runner) |
| :--- | :--- | :--- |
| **Execution Environment** | Render FastAPI container (`https://integris-sp5o.onrender.com`) | Local Python interpreter on the user's machine |
| **Entry Point** | Vercel UI (`https://integris-ten.vercel.app`) or `POST /api/v1/investigate` | `python -m app.offline investigate <file>` |
| **Forensic Engine** | `backend/app/engine/` (`run_forensic_pipeline`) | `backend/app/engine/` (`run_forensic_pipeline`) |
| **Dataset Network Transit** | Uploaded over HTTPS to Render and processed in volatile RAM | **Never leaves the local machine**; zero network requests |
| **Cloud / API Requirement** | Requires network access to the deployed Render API | Requires **no** cloud backend, remote API, database, or AI service |
| **Large Dataset Suitability** | Constrained by cloud request timeouts and free-tier container RAM | Suitable for local datasets up to format limits (e.g., `45 MB` stress CSV in `~3.9s`) |

---

## 7. Privacy & Data-Flow Behavior

When running Offline Investigation Mode:

1. **Local File Read Only:** The runner reads only the dataset path explicitly supplied on the command line (`Path.read_bytes()`).
2. **Zero Network Transmission:** Offline Mode does not upload files, does not contact Render (`https://integris-sp5o.onrender.com`), does not call external APIs or AI services, and emits no telemetry.
3. **Zero Database or Hidden Persistence:** Analysis runs in local process memory (`pandas` / `NumPy` / `SciPy`). No files are written unless `--output <path>` is explicitly provided by the user, and the CLI refuses to overwrite the input dataset file.
4. **Technical Scope Note:** Opening the Vercel-hosted web application (`https://integris-ten.vercel.app`) does not run the Python forensic engine inside the browser. To keep a dataset entirely on your machine without network transmission, execute the local Python CLI.

---

## 8. Troubleshooting

- **`ModuleNotFoundError: No module named 'app'`:**
  Ensure you either run `python -m app.offline ...` from inside the `backend/` directory, or run `python backend/app/offline/cli.py ...` from the repository root with the `backend/.venv` virtual environment activated.
- **`Error: Unsupported file format '...'` (Exit Code `1`):**
  Verify that the file has a supported extension (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`) and that its internal binary signature matches its extension.
- **`Error: Specified target column '...' does not exist in dataset` (Exit Code `1`):**
  Column names are case-sensitive after header trimming. Check the `Available columns: [...]` list printed in the error message.
- **`Error: Dataset size (...) exceeds the maximum allowed limit` (Exit Code `1`):**
  The file exceeds the format-specific boundary (`50 MB` for `.csv`/`.tsv`/`.txt`, `25 MB` for `.xlsx`/`.xls`, `15 MB` for `.pdf`).

---

## 9. Limitations

- **Requires Local Python Environment:** Offline Investigation Mode executes the Python forensic engine locally and requires Python `3.10+` with `backend/requirements.txt` installed; it does not run inside a web browser via WebAssembly.
- **Shared Engine Boundaries:** Because Offline Mode calls the same ingestion and forensic pipeline as the online API, it enforces the same format size limits (`50 MB` CSV/TSV/TXT, `25 MB` Excel, `15 MB` PDF), dimension bounds (`500,000` rows × `1,000` columns), and machine-readable PDF table requirements (no OCR on scanned image PDFs).
