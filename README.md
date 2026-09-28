# INTEGRIS

**Data Integrity & Forensics Platform**

INTEGRIS is a deterministic data integrity and forensic analysis platform that examines uploaded tabular datasets for structural, statistical, temporal, uniqueness, consistency, and data-quality anomalies.

- **Production Application:** [https://integris-ten.vercel.app](https://integris-ten.vercel.app)
- **Production Backend:** [https://integris-sp5o.onrender.com](https://integris-sp5o.onrender.com)
- **Production API Base:** `https://integris-sp5o.onrender.com/api/v1`
- **Health Endpoint:** [https://integris-sp5o.onrender.com/api/v1/health](https://integris-sp5o.onrender.com/api/v1/health)
- **Repository:** [https://github.com/TERMINATOR7732/integris](https://github.com/TERMINATOR7732/integris)

**Technical Documentation:**
[Architecture](docs/ARCHITECTURE.md) • [Forensic Engine](docs/FORENSIC_ENGINE.md) • [Offline Mode](docs/OFFLINE_MODE.md) • [Security](docs/SECURITY.md) • [Validation & Benchmarks](docs/VALIDATION.md) • [Portfolio Summary](docs/PORTFOLIO.md) • [Demo Guide](docs/demo.md)

---

## Overview

Datasets used for analytics, operational reporting, and machine learning frequently pass basic schema checks while still containing structural defects that invalidate downstream conclusions. Standard data-validation tools typically verify column names and primitive types, and exploratory profiling tools summarize means, minimums, maximums, and null counts without evaluating whether records are internally consistent or trustworthy.

INTEGRIS investigates uploaded tabular datasets across six file formats (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`) entirely in volatile memory. It executes a deterministic sequence of structural, statistical, and cross-column forensic analyzers and produces a structured **Forensic Dossier** containing:

- **Itemized Forensic Findings** classified by category and severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`)
- **Quantified Evidence** including observed metrics, expected thresholds, sample row indices, and offending values
- **Column-Level Profiles** with inferred semantic roles, cardinality, null density, and summary statistics
- **Integris Trust Score (`0.0–100.0`)**, letter grade (`A+` through `F`), and **Executive Verdict** (`RELIABLE`, `CAUTION`, `COMPROMISED`)
- **Prioritized Remediation Guidance** linked to each finding

---

## Why INTEGRIS Exists

A dataset can be syntactically valid—parsing without error into a DataFrame or database table—while still containing evidence of corruption or upstream pipeline failure:

- **Disguised Missingness:** Placeholder strings (`"N/A"`, `"?"`, `"unknown"`, `"-"`) or sentinel numbers (`-999`, `9999`) that bypass standard null checks and distort aggregations.
- **Identifier Collisions:** Candidate primary keys (`employee_id`, `transaction_id`, `order_id`) that repeat across distinct records and cause row multiplication during joins.
- **Temporal Contradictions:** Cross-column lifecycle inversions where completion timestamps precede start timestamps (for example, `exit_date < hire_date`, `discharge_date < admit_date`, or `settlement_date < transaction_datetime`).
- **Numeric Type Drift:** Predominantly numeric columns contaminated by a small fraction of text strings (`"145kg"`, `"pending"`), forcing the entire column into an untyped string representation.
- **Categorical & Date Format Drift:** Inconsistent category casing (`"Engineering"` vs `"engineering"`) or mixed date representations (`YYYY-MM-DD` mixed with `DD/MM/YYYY`) that silently fragment groupings and date parsing.
- **Target Leakage Indicators:** Features in supervised learning datasets that duplicate or nearly mirror the target column.

INTEGRIS approaches an uploaded dataset as an artifact to **investigate** rather than merely validate, surfacing concrete row-level evidence before the data is trusted in production workflows.

---

## Core Capabilities

- **Multi-Format Tabular Ingestion:** Parses `.csv`, `.tsv`, `.txt` (with automatic delimiter and encoding detection), `.xlsx`, `.xls`, and machine-readable tabular `.pdf` documents in memory, backed by magic-byte signature validation.
- **Structural & Semantic Profiling:** Infers column semantic types (`identifier`, `datetime`, `numeric_continuous`, `numeric_discrete`, `categorical`, `boolean`, `free_text`), cardinality ratios, null ratios, and summary statistics.
- **Uniqueness & Key Integrity Analysis:** Detects exact duplicate rows, primary-key collisions, and null entries in candidate identifiers while contextually distinguishing repeating foreign-key columns (`manager_id`, `customer_id`, `agent_id`, `device_id`) and non-entity catalog codes (`product_code`). Identifies two-column composite candidate keys when no single column is unique.
- **Temporal Consistency Analysis:** Validates chronological ordering across token-matched lifecycle column pairs (`hire → exit/termination`, `birth → hire/enroll/graduate`, `order → ship/deliver`, `ship → deliver`, `admit → discharge`, `enroll → graduation`, `open → close/resolve`, `pickup → deliver`, and `transaction → settlement`), including calendar-day grain normalization when comparing timestamps against date-only columns.
- **Data-Type, Date-Format & Categorical Drift Detection:** Flags numeric columns contaminated by string tokens (`60%–99.9%` numeric), mixed date formats within date columns, and case-insensitive category collisions.
- **Completeness & Sentinel Detection:** Identifies standard null/whitespace missingness (`>= 5%`), disguised text sentinels, contextual numeric sentinels (`-999`, `-9999`, `9999`, `99999`, `999999`, `-1`), and systematic cross-column co-missingness (Jaccard similarity `>= 0.90`).
- **Consistency & Domain Bound Checks:** Flags negative values in strictly non-negative count/quantity columns (`age`, `count`, `quantity`, `days`, `hours`, `visits`) and inverted `min > max` column pairs.
- **Distribution & Benford Screening:** Detects isolated extreme outliers beyond Tukey $3\times\text{IQR}$ fences, high distributional skewness (`|skew| > 4.0`), and leading-digit deviations from Benford's Law (`MAD > 0.025`) on eligible positive multi-decade financial columns.
- **Optional Target Leakage Detection:** When a `target_column` is provided, checks for near-identical target proxies (`>= 95%` match), extreme numeric correlation (`|r| >= 0.95` Pearson/Spearman), and deterministic categorical association (`Cramér's V >= 0.95`).
- **Deterministic Scoring & Executive Verdict:** Computes a `0.0–100.0` Trust Score from itemized severity deductions with a `35.0`-point per-column penalty cap, mapping results to a letter grade (`A+` to `F`) and Executive Verdict (`RELIABLE`, `CAUTION`, `COMPROMISED`).
- **Interactive Investigation UI & Exports:** React 19 interface featuring an Executive Verdict summary, Trust Score penalty ledger, filterable Findings Explorer, slide-out evidence drawer, Column Forensic Profiles, and full dossier export in Markdown (`.md`), JSON (`.json`), and print/PDF layout.
- **Production API & Security Hardening:** FastAPI service with strict CORS origin validation, uploaded filename basename sanitization, format-specific size limits, Excel decompression-bomb guards, non-finite float (`NaN`/`Inf`) JSON sanitization, and redacted error responses.

---

## How It Works

Every investigation follows a deterministic, single-pass in-memory pipeline:

```text
Dataset Upload (.csv, .tsv, .txt, .xlsx, .xls, .pdf)
  │
  ▼
1. Ingestion & Validation
   (Filename basename sanitization, size & magic-byte checks, in-memory parsing)
  │
  ▼
2. Dataset Profiling & Structural Analysis
   (Row/column bounds, semantic type inference, cardinality & summary stats)
  │
  ▼
3. Sequential Forensic Analyzers
   (Completeness → Uniqueness → Validity → Distribution → Consistency → Leakage)
  │
  ▼
4. Finding Generation & Evidence Packaging
   (Severity assignment, observed metrics, sample row indices, remediation steps)
  │
  ▼
5. Trust Score, Grade & Executive Verdict Calculation
   (Proportional severity deductions, 35-point per-column cap, verdict mapping)
  │
  ▼
6. Investigation UI & Dossier Export
   (Executive Verdict, Findings Explorer, Evidence Drawer, Column Dossiers, MD/JSON/Print)
```

---

## Forensic Engine

The backend (`backend/app/engine/`) contains the analytical engine, while the frontend (`frontend/src/`) serves as an interactive investigation interface over the returned `ForensicDossier` JSON contract.

The engine executes six specialized analyzer modules after initial dataset profiling (`profiler.py`):

1. **Completeness (`completeness.py`):** Evaluates null/whitespace ratios (treating optional lifecycle columns like `termination_date` or `closed_date` as low/info sparsity rather than high-severity defects), scans string columns for disguised text sentinels (`"N/A"`, `"null"`, `"unknown"`, `"?"`), tests numeric columns for isolated sentinel codes (`-999`, `9999`, `-1`) outside the bulk distribution, and measures pairwise missingness Jaccard overlap.
2. **Uniqueness (`uniqueness.py`):** Detects exact duplicate rows (`FND-UNQ-EXACT-DUPS`), evaluates candidate entity identifiers for key collisions (`FND-UNQ-PK-COLLISION-*`) and nulls (`FND-UNQ-PK-NULL-*`) while filtering out repeating foreign-key role columns and catalog codes, and discovers two-column composite candidate keys (`FND-UNQ-COMPOSITE-*`).
3. **Validity (`validity.py`):** Detects numeric type drift (`FND-VAL-TYPEDRIFT-*`) where object columns are `60%–99.9%` numeric but contain contaminating strings, mixed date formats (`FND-VAL-DATE-FORMAT-*`) across `ISO_8601`, `SLASH_YMD`, `SLASH_DMY`, `SLASH_MDY`, and `DOT_DMY`, and categorical casing drift (`FND-VAL-CAT-CASING-*`).
4. **Distribution (`distribution.py`):** Identifies extreme outliers (`FND-DST-OUTLIER-*`) beyond $3\times\text{IQR}$ when affecting `<= 10%` of records, severe skewness (`FND-DST-SKEW-*`), and Benford's Law leading-digit divergence (`FND-DST-BENFORD-*`) on financial columns with `>= 40` positive observations spanning at least two orders of magnitude (`max / min >= 50`).
5. **Consistency (`consistency.py`):** Checks cross-column chronological ordering (`FND-CNS-TEMP-*`) across nine lifecycle token pairs, impossible negative values (`FND-CNS-NEG-*`) in count/quantity/age columns, and inverted `min > max` column pairs (`FND-CNS-BOUND-*`).
6. **Data Leakage (`leakage.py`):** Runs when an optional `target_column` is supplied, flagging near-duplicate target proxies (`FND-LKG-PROXY-*`), high numeric correlations (`FND-LKG-CORR-*`), and high categorical Cramér's V associations (`FND-LKG-CRAMER-*`).

For a full breakdown of inputs, thresholds, finding IDs, evidence structures, and scoring formulas, see [`docs/FORENSIC_ENGINE.md`](docs/FORENSIC_ENGINE.md).

---

## Architecture

INTEGRIS exposes a single deterministic forensic engine through two execution modes:

```text
Browser (Analyst)                             Local Terminal (Analyst)
  │                                             │
  ▼  HTTPS                                      ▼  Local File Path
Vercel Frontend (React 19 / TS / Vite)        Offline CLI Runner (backend/app/offline/)
https://integris-ten.vercel.app               python -m app.offline investigate <file>
  │                                             │
  ▼  HTTPS (POST /api/v1/investigate)           │  Zero Network Transit
Render Backend API (FastAPI / Python)           │
https://integris-sp5o.onrender.com/api/v1       │
  │                                             │
  └──────────────────────┬──────────────────────┘
                         ▼  In-Memory Execution (Zero Database / Zero Disk Retention)
        INTEGRIS Ingestion & Forensic Engine (backend/app/ingestion/ + backend/app/engine/)
```

- **Active Production Deployment (Online Mode):** Vercel hosts the static React frontend (`https://integris-ten.vercel.app`) and Render hosts the FastAPI backend container (`https://integris-sp5o.onrender.com`).
- **Offline Investigation Mode (Local Runner):** Runs the exact same Python ingestion and forensic pipeline directly on the user's machine (`python -m app.offline investigate ...`) without sending datasets to Render.
- **Note on Cloud Infrastructure:** Google Cloud Run is **not** part of the current production deployment.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/OFFLINE_MODE.md`](docs/OFFLINE_MODE.md) for component responsibilities, data contracts, and sequence flows.

---

## Offline Investigation

**Offline Investigation Mode runs the INTEGRIS forensic engine locally on the user's machine.**

- **What It Is & Why It Exists:** A thin local CLI and Python execution adapter (`backend/app/offline/`) around the existing `backend/app/engine/` pipeline. It enables analysts to audit sensitive datasets or large local files (up to `50 MB`, such as the `45 MB` local stress dataset) without uploading data over the network or relying on free-tier cloud container memory/timeouts.
- **How It Differs from Online Mode:** Online Mode uploads the dataset from the browser to the deployed Render API (`POST /api/v1/investigate`) for volatile in-memory analysis. Offline Mode executes the identical `ingest_dataset()` and `run_forensic_pipeline()` functions directly inside a local Python process; the dataset never leaves the machine.
- **Prerequisites & Setup:** Requires Python `3.10+` and the dependencies in `backend/requirements.txt`:
  ```bash
  cd backend
  python -m venv .venv
  .venv\Scripts\Activate.ps1   # macOS/Linux: source .venv/bin/activate
  pip install -r requirements.txt
  ```
- **Example Commands:**
  ```bash
  # Print ForensicDossier JSON to stdout:
  python -m app.offline investigate ../datasets/clean_baseline.csv

  # Run with an optional ML target column and write JSON report to disk:
  python -m app.offline investigate ../datasets/corrupted_forensic.csv --target-column attrition --output ../dossier.json
  ```
- **Supported Formats:** `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and machine-readable tabular `.pdf` (validated via the shared `backend/app/ingestion/` parsers and magic-byte checks).
- **Output:** Emits the exact `ForensicDossier` JSON structure (`metadata`, `summary`, `trust_score`, `findings`, `columns`, `recommendations`) sanitized via `sanitize_for_json()`, matching the online API output for the same input file.
- **Privacy Behavior:** Processes the dataset strictly in local RAM, never contacts Render or external APIs, requires no database or AI service, emits no telemetry, and refuses to overwrite the input dataset file.
- **Limitations:** Offline Mode requires a local Python environment (opening the Vercel web UI alone does not run the Python engine in the browser) and enforces the same engine format/dimension bounds (`50 MB` CSV/TSV/TXT, `25 MB` Excel, `15 MB` PDF, `500,000` rows, `1,000` columns). See [`docs/OFFLINE_MODE.md`](docs/OFFLINE_MODE.md) for full documentation.

---

## Security

Security controls implemented and verified across Phases 8 and 9 include:

- **Restricted CORS & Origin Validation:** The backend explicitly allows `https://integris-ten.vercel.app` and local development origins (`localhost` / `127.0.0.1` on ports `5173` and `4173`), and anchors preview matching strictly to `^https://integris-ten(-[a-z0-9-]+)?\.vercel\.app$` using `re.fullmatch`. Spoofed domains (such as `https://integris-ten.vercel.app.evil.com`) and arbitrary third-party `*.vercel.app` origins are rejected on both normal and `500` error paths.
- **Upload Filename Sanitization:** Uploaded filenames are normalized via `PurePath` to their safe basename before extension checks or metadata serialization, stripping POSIX/Windows path traversal sequences (`../../etc/passwd.csv` → `passwd.csv`, `..\..\secret.xlsx` → `secret.xlsx`) and client directory paths.
- **Volatile In-Memory Processing:** Uploaded files are read into bounded memory buffers (`io.BytesIO`) and garbage-collected after response serialization. No uploaded datasets are written to disk or stored in a database.
- **Upload Size, Format & Decompression Boundaries:** Enforces format-specific upload limits (`50 MB` for `.csv`/`.tsv`/`.txt`, `25 MB` for `.xlsx`/`.xls`, `15 MB` for `.pdf`), magic-byte signature verification, an Excel uncompressed ZIP size limit (`250 MB`), and post-parse dimension limits (`500,000` rows, `1,000` columns).
- **Redacted Error Handling:** Internal exceptions return controlled JSON error responses containing only the exception class name (`type(exc).__name__`), avoiding raw stack traces or internal path disclosure.

These controls provide defense-in-depth for an unauthenticated public analysis API; see [`docs/SECURITY.md`](docs/SECURITY.md) for the complete security posture and known operational boundaries.

---

## Testing

All automated test suites and build checks pass on the current repository state:

- **Backend Test Suite (`pytest`):** `123 passed, 0 failed, 0 skipped` (`111` baseline + `12` offline mode & parity tests)
- **Frontend Test Suite (`node --test`):** `7 passed, 0 failed, 0 skipped`
- **Frontend Production Build (`tsc -b && vite build`):** `passed` (`0` TypeScript or bundler errors)

Testing spans unit tests for every forensic analyzer, multi-format ingestion tests (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`), non-finite float (`NaN`/`Inf`) JSON serialization tests, CORS and filename-sanitization regression tests, frontend report-generation and accessibility contract tests, and Phase 7/8/9 validation passes. See [`docs/VALIDATION.md`](docs/VALIDATION.md) for details.

---

## Forensic Validation / Benchmarks

### Included Benchmark Datasets (`datasets/`)

| Dataset | Rows × Cols | Target Column | Trust Score | Grade | Verdict | Findings | Key Anomalies Detected |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| [`datasets/clean_baseline.csv`](datasets/clean_baseline.csv) | `50 × 12` | *(none)* | `100.0` | `A+` | `RELIABLE` | `1` *(Info)* | Clean reference dataset; 1 informational composite-key notice |
| [`datasets/moderate_quality.csv`](datasets/moderate_quality.csv) | `50 × 12` | *(none)* | `68.1` | `C` | `CAUTION` | `7` | Disguised `"N/A"` sentinels, categorical casing drift, date format drift, skewness |
| [`datasets/corrupted_forensic.csv`](datasets/corrupted_forensic.csv) | `50 × 13` | `attrition` | `0.0` | `F` | `COMPROMISED` | `17` | PK collision (`employee_id`), temporal inversion (`exit_date < hire_date`), target proxy (`leaving_flag`), numeric type drift, `-999` sentinel, negative counts, Benford divergence |

### Phase 7 Synthetic Forensic Corpus Validation (Local)

INTEGRIS was evaluated locally against a 119-dataset multi-format synthetic forensic corpus (`CSV`, `TSV`, `TXT`, `XLSX`, `XLS`, `PDF`, plus corrupted and wrong-extension adversarial files):

- **Total Corpus Files Evaluated:** `119` (`104` accepted, `15` rejected as malformed/empty/wrong-extension/over-limit)
- **Unhandled Exceptions / HTTP 500s / Invalid JSON:** `0`
- **Supported Anomaly Recall:** False negatives reduced from `8` to `0` (`48` matched true positives, `4` matched true negatives)
- **False-Positive Reduction:** False-positive finding instances reduced from `71` to `28` (datasets with unexpected findings reduced from `48` to `20`)
- **Intentionally Unsupported Expectations:** `18` manifest expectations correspond to domain-specific rules not implemented by the general-purpose engine (see [Limitations](#limitations)).

### Local Stress Benchmark (Local Only)

- Evaluated locally against a `45 MB` synthetic stress dataset (`156,310` rows × `26` columns): completed in `~9.7s` locally (`29` findings, Trust Score `0.0`, Verdict `COMPROMISED`, Grade `F`, strict RFC 8259 JSON valid).
- *Note:* Large stress datasets are used strictly for local benchmarking and are gitignored; they are not hosted in the repository or uploaded to the free-tier Render production instance.

---

## Production

The live deployment is active at:

- **Frontend (Vercel):** [https://integris-ten.vercel.app](https://integris-ten.vercel.app)
- **Backend Root (Render):** [https://integris-sp5o.onrender.com](https://integris-sp5o.onrender.com)
- **API Base (Render):** `https://integris-sp5o.onrender.com/api/v1`
- **Health Endpoint:** [https://integris-sp5o.onrender.com/api/v1/health](https://integris-sp5o.onrender.com/api/v1/health)

Example health response:

```json
{
  "status": "healthy",
  "service": "INTEGRIS Forensic Engine",
  "version": "0.1.0",
  "engine_status": "ready",
  "timestamp": "2026-09-25T14:05:22.844542+00:00"
}
```

### Visual Walkthrough / Screenshots (Placeholders)

> **Note:** No static screenshots are committed to the repository. To add visual previews in the future, capture the following five views directly from the live application ([https://integris-ten.vercel.app](https://integris-ten.vercel.app)):
> 1. **Upload / Investigation Entry:** Drag-and-drop dataset uploader with format badges and optional target-column selector.
> 2. **Executive Verdict Card:** Composite Trust Score (`0.0–100.0`), letter grade badge, executive rationale, and severity tally pills.
> 3. **Findings Explorer:** Severity and category filter bar with expandable forensic finding cards.
> 4. **Column Forensic Profiles (Column Dossiers):** Searchable per-column cards displaying semantic types, null/unique ratios, and summary statistics.
> 5. **Finding Detail & Evidence Drawer:** Slide-out inspection panel showing mathematical evidence metrics, sample row indices, offending values, and remediation actions.

---

## Local Development

### Prerequisites

- **Python:** `3.10+` (developed and tested with Python `3.12`)
- **Node.js:** `18+` (developed and tested with Node `24`)

### 1. Clone the Repository

```bash
git clone https://github.com/TERMINATOR7732/integris.git
cd integris
```

### 2. Backend Setup & Execution

```bash
cd backend
python -m venv .venv

# Activate virtual environment (Windows PowerShell):
.venv\Scripts\Activate.ps1
# Or on macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- Local API Base: `http://localhost:8000/api/v1`
- Local Health Check: `http://localhost:8000/api/v1/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

### 3. Frontend Setup & Execution

```bash
cd frontend
npm install
npm run dev
```

- Local Web Interface: `http://localhost:5173`

### 4. Running Automated Tests & Production Build

```bash
# Backend unit and integration tests (from repository root):
./backend/.venv/Scripts/python.exe -m pytest backend/tests -q --ignore=backend/tests/validate_claude_corpus.py

# Frontend unit and contract tests (from frontend/):
cd frontend
npm test -- --run

# Frontend TypeScript & Vite production build (from frontend/):
npm run build
```

---

## Repository Structure

```text
integris/
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # /api/v1/health and /api/v1/investigate endpoints
│   │   ├── core/config.py         # CORS settings, upload size limits, allowed extensions
│   │   ├── engine/                # Profiler, 6 forensic analyzers, Trust Scorer, JSON sanitizer
│   │   ├── ingestion/             # Magic-byte detector and CSV/TSV/TXT/Excel/PDF parsers
│   │   ├── models/report.py       # Pydantic v2 schemas (ForensicDossier, Finding, Evidence, etc.)
│   │   ├── offline/               # Local CLI and offline execution adapter (runner.py, cli.py)
│   │   └── main.py                # FastAPI application and ErrorHandlerMiddleware
│   ├── tests/                     # Pytest unit, format ingestion, offline parity, and E2E suites
│   └── requirements.txt           # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/            # Upload, ExecutiveVerdictCard, FindingsExplorer, ColumnDossiers, ReportModal
│   │   ├── services/api.ts        # Typed HTTP client for backend communication
│   │   ├── types/integris.ts      # TypeScript interfaces mirroring backend Pydantic models
│   │   └── utils/                 # Markdown/JSON report generators and Node test suite
│   └── package.json               # Frontend scripts and dependencies
├── datasets/                      # Clean, moderate, and corrupted benchmark CSV datasets
├── docs/                          # Architecture, Forensic Engine, Offline Mode, Security, Validation, Portfolio, Demo
└── render.yaml                    # Render service deployment specification
```

---

## Limitations

- **Intentionally Unsupported Domain-Specific Rules:** INTEGRIS is a general-purpose tabular forensic engine without external domain knowledge or user-defined rule scripts. It does not currently implement detectors for arbitrary multi-column arithmetic equations (e.g., `quantity * unit_price == total_amount`), domain-specific percentage caps (`> 100%`), single-column future/ancient calendar cutoffs, row-dynamic temporal labels (`date_a_label`), time-series sequence monotonicity, or geospatial impossible-travel patterns.
- **Heuristic & Statistical Screening Signals:** Checks such as Benford's Law (`FND-DST-BENFORD-*`) and Tukey $3\times\text{IQR}$ outlier detection (`FND-DST-OUTLIER-*`) are statistical screening indicators rather than proof of manipulation. Synthetic uniform distributions, narrow pricing tiers, or heavy-tailed operational metrics can naturally trigger these flags and require analyst review.
- **Machine-Readable PDFs Only:** PDF ingestion (`pdfplumber`) extracts embedded vector/text tables and rejects scanned image-only PDFs (`HTTP 400`); optical character recognition (OCR) is not enabled.
- **Single-Pass In-Memory Bounds:** Because datasets are processed synchronously in volatile RAM without disk spilling or background job queues, uploads are bounded to `50 MB` (`25 MB` for Excel, `15 MB` for PDF), `500,000` rows, and `1,000` columns, and free-tier cloud hosting imposes tighter practical memory constraints than local execution.

---

## Future Work

Potential future engineering extensions (not currently implemented):

- **Configurable Domain Rule Packs:** Optional declarative constraints for multi-column arithmetic invariants (e.g., `subtotal + tax == total`) and domain range bounds.
- **Richer Provenance & Drift Comparison:** Baseline-to-target dataset comparison for detecting schema and distribution drift across pipeline runs.
- **Additional Forensic Detectors:** Sequence monotonicity checks for event logs and calendar plausibility bounds for historical/future dates.
- **Out-of-Core / Streaming Execution:** Chunked or DuckDB/Polars-backed processing for multi-hundred-megabyte datasets.
- **Investigation Workflows:** Optional rule suppression or analyst annotation export within generated dossiers.

---

## Project Status

The current production baseline (`4558912`) is stable, regression-tested (`111` backend tests and `6` frontend tests passing), and deployed on Vercel (`https://integris-ten.vercel.app`) and Render (`https://integris-sp5o.onrender.com`).

---

## License

This project is licensed under the [MIT License](LICENSE).
