# INTEGRIS — Testing, Validation & Benchmarks

This document summarizes the automated test suites, synthetic corpus validation, performance benchmarks, and live production checks verified across Phases 6 through 9 (production baseline `4558912`).

> **Important Distinction:** Large-scale corpus runs (`119` datasets) and stress benchmarks (`45 MB` dataset) were executed **exclusively in local in-memory environments**. Production verification against Render (`https://integris-sp5o.onrender.com`) uses only lightweight smoke fixtures (`<= 50` rows) to respect free-tier container boundaries.

---

## 1. Automated Test Suites

### 1.1 Backend Unit & Integration Tests (`pytest`)
- **Command:**
  ```bash
  ./backend/.venv/Scripts/python.exe -m pytest backend/tests -v --ignore=backend/tests/validate_claude_corpus.py
  ```
- **Result:** **`111 passed, 0 failed, 0 skipped`** (`~4.05s`)
- **Coverage Breakdown (`backend/tests/`):**
  - `test_profiler.py`: Schema profiling, token-aware identifier semantic classification, prose vs identifier disambiguation, duplicate column header deduplication, and all-null/constant columns.
  - `test_completeness.py`: Standard null/whitespace thresholds (`>= 5%`), optional lifecycle sparsity (`termination_date`, `exit_date`), disguised text sentinels (`"N/A"`, `"?"`, `"unknown"`), contextual numeric sentinels (`-999`, `9999`), and cross-column co-missingness Jaccard overlap.
  - `test_uniqueness.py`: Exact duplicate rows, primary-key collisions (`employee_id`, `order_id`), foreign-key disambiguation (`manager_id`, `customer_id`), catalog code exclusion (`product_code`), and two-column composite keys.
  - `test_validity.py`: Numeric type drift (`60%–99.9%` numeric), date format inconsistencies (`ISO_8601`, `SLASH_YMD`, `SLASH_DMY`), and categorical casing drift.
  - `test_consistency.py`: Nine domain lifecycle temporal pairs (`hire → termination`, `admit → discharge`, `enrollment → graduation`, `opened → closed`, `pickup → delivered`, `ship → delivery`, `transaction_datetime → settlement_date`, etc.), non-negative domain violations, and `min > max` bound inversions.
  - `test_distribution.py`: Tukey $3\times\text{IQR}$ extreme outliers, Fisher-Pearson skewness, and Benford's Law first-digit screening.
  - `test_leakage.py`: Target proxy detection (`>= 95%` identity), extreme Pearson/Spearman correlation (`|r| >= 0.95`), and categorical Cramér's V association (`>= 0.95`).
  - `test_scorer.py`: Base severity deductions, proportional row scaling, `35.0`-point per-column penalty cap, and grade/verdict mapping.
  - `test_ingestion_formats.py`: Multi-format parsing (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`), Excel `"N/A"` sentinel preservation, multi-page PDF table coalescing and 1-row final continuation retention, magic-byte mismatch rejection, and size limits.
  - `test_nan_hardening.py`: Recursive `NaN`/`+Inf`/`-Inf` sanitization, CORS origin allow/reject enforcement on `200` and `500` responses, and uploaded filename basename sanitization.
  - `test_pipeline_e2e.py` & `test_health.py`: End-to-end pipeline determinism, benchmark dataset assertions, and `/api/v1/health` contract checks.

### 1.2 Frontend Unit & Contract Tests (`node:test`) and Build
- **Commands:**
  ```bash
  cd frontend
  npm test -- --run
  npm run build
  ```
- **Test Result:** **`6 passed, 0 failed, 0 skipped`** (`~327ms`)
  - Verifies `formatBytes`, `formatValue`, `generateJsonExport`, `generateMarkdownReport` (9-section audit report structure on both anomalous and clean datasets), and Phase 9 keyboard-accessibility / responsive-grid component contracts.
- **Production Build Result:** **Passed (`0` errors in `~2.68s`)**
  - Strict TypeScript project build (`tsc -b`) and Vite production bundle (`vite build`).

---

## 2. Local Benchmark Datasets (`datasets/`)

Verified deterministically via `POST /api/v1/investigate`:

| Dataset | Dimensions | Target Column | Trust Score | Grade | Verdict | Findings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `datasets/clean_baseline.csv` | `50 rows × 12 cols` | *(none)* | `100.0` | `A+` | `RELIABLE` | `1` *(Info)* |
| `datasets/moderate_quality.csv` | `50 rows × 12 cols` | *(none)* | `68.1` | `C` | `CAUTION` | `7` |
| `datasets/corrupted_forensic.csv` | `50 rows × 13 cols` | `attrition` | `0.0` | `F` | `COMPROMISED` | `17` |

---

## 3. Local Synthetic Corpus Validation (Phase 6 → Phase 7)

Using `backend/tests/validate_claude_corpus.py`, INTEGRIS was evaluated locally in-memory against a 119-dataset synthetic forensic corpus (`18.05 MiB` uncompressed across `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf`):

| Metric | Phase 6 Baseline | Phase 7 / 9 Verified | Notes |
| :--- | :---: | :---: | :--- |
| **Total Corpus Datasets** | `119` | `119` | `115` in manifest + `4` clean format variants |
| **Accepted Datasets (`HTTP 200`)** | `104` | `104` | All valid tabular datasets across 6 formats |
| **Rejected Datasets (`HTTP 400 / 413`)** | `15` | `15` | Corrupted archives, 0-byte/0-row files, wrong extensions, prose TXT, scanned PDF, 1001-column CSV |
| **Unhandled Crashes / HTTP 500s** | `0` | `0` | Zero runtime crashes or invalid JSON responses |
| **Matched True Positives (`TRUE_POSITIVE`)** | `40` | **`48`** | `+8` true positives recovered in Phase 7 |
| **Matched True Negatives (`TRUE_NEGATIVE`)** | `4` | **`4`** | Clean negative-control datasets |
| **False Negatives on Supported Checks** | `8` | **`0`** | `100%` of supported ground-truth anomalies detected |
| **Datasets with False Positives** | `48` | **`20`** | `-28` datasets after FK/catalog/temporal hardening |
| **Unexpected Finding Instances** | `71` | **`28`** | `-43` false-positive finding instances removed |
| **Intentionally Unsupported Expectations** | `18` | `18` | Domain-specific rules outside engine scope |
| **Fully Passing Datasets (`PASS`)** | `58` | **`80`** | `+22` datasets classified as full `PASS` |
| **Total Suite Runtime (119 Datasets)** | `15.70s` | `15.83s` | Executed locally in memory |

For the dataset-by-dataset breakdown, see [`INTEGRIS_FORENSIC_VALIDATION_REPORT.md`](../INTEGRIS_FORENSIC_VALIDATION_REPORT.md) and [`INTEGRIS_PHASE7_FIX_REPORT.md`](../INTEGRIS_PHASE7_FIX_REPORT.md).

---

## 4. Local Performance & Stress Benchmarks (Local Only)

Measured locally in Python (`E:\MHT CET REGISTRATION\BE\Task\Integris`) without network transfer overhead:

| Local Dataset | Size (MiB) | Dimensions | Findings | Trust Score | Local Execution Time |
| :--- | ---: | :---: | :---: | :---: | ---: |
| `large/large_hr_dataset_1mb.csv` | `0.85 MiB` | `11,189 × 9` | `5` | `55.6` | `0.36s` (`362 ms`) |
| `large/large_hr_dataset_5mb.csv` | `4.22 MiB` | `55,901 × 9` | `5` | `55.6` | `1.43s` (`1,426 ms`) |
| `large/large_hr_dataset_10mb.csv` | `8.43 MiB` | `111,802 × 9` | `5` | `55.6` | `2.67s` (`2,667 ms`) |
| `csv/csv_wide_999_columns.csv` | `0.27 MiB` | `40 × 999` | `0` | `100.0` | `2.73s` (`2,729 ms`) |
| `integris_45mb_forensic_stress_dataset.csv` *(local only)* | `43.53 MiB` | `156,310 × 26` | `29` | `0.0` (`COMPROMISED` / `F`) | `9.70s` |

*Note:* The `45 MB` stress dataset is a local regression fixture (gitignored) and was never uploaded to the Render production service.

---

## 5. Production Verification (Live Render & Vercel)

Verified against the live deployment (`https://integris-ten.vercel.app` and `https://integris-sp5o.onrender.com`) after deploying commit `4558912`:

| Check | Endpoint / Target | Observed Result | Status |
| :--- | :--- | :--- | :---: |
| **Frontend Availability** | `GET https://integris-ten.vercel.app` | `HTTP 200 OK`, HTML shell & hashed production assets served | **PASS** |
| **Backend Health** | `GET https://integris-sp5o.onrender.com/api/v1/health` | `HTTP 200 OK`, `{"status": "healthy", "engine_status": "ready", "version": "0.1.0"}` | **PASS** |
| **5-Row Smoke Investigation** | `POST https://integris-sp5o.onrender.com/api/v1/investigate` | `HTTP 200 OK`, `overall_score: 100.0`, `verdict: "reliable"`, `grade: "A+"`, `row_count: 5` | **PASS** |
| **CORS — Allowed Origin** | `Origin: https://integris-ten.vercel.app` | `Access-Control-Allow-Origin: https://integris-ten.vercel.app` | **PASS** |
| **CORS — Spoofed Suffix** | `Origin: https://integris-ten.vercel.app.evil.com` | `Access-Control-Allow-Origin` omitted (`None`) | **PASS** |
| **CORS — Foreign Vercel App** | `Origin: https://evil.vercel.app` | `Access-Control-Allow-Origin` omitted (`None`) | **PASS** |
| **Filename Sanitization (Windows Traversal)** | Upload `..\..\folder\report.csv` (`3` rows) | `HTTP 200 OK`, `metadata.file_name == "report.csv"` | **PASS** |
| **Filename Sanitization (POSIX Path)** | Upload `/tmp/data.csv` (`3` rows) | `HTTP 200 OK`, `metadata.file_name == "data.csv"` | **PASS** |
| **Edge WAF + App Defense (POSIX Traversal)** | Upload `../../etc/passwd.csv` / `../../dir/sample.csv` | Blocked at Render Cloudflare WAF edge (`HTTP 403`) and sanitized in FastAPI to `"passwd.csv"` / `"sample.csv"` | **PASS** |
