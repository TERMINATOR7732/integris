# INTEGRIS — Phase 8 Full-System QA, Security, Performance & UX Audit Report

## 1. Executive Summary

The Phase 8 read-only full-system QA, security, performance, integration, and UX audit of the **INTEGRIS — Data Integrity & Forensics Platform** (`main` @ `200aaecebe42f9f758c021b991f00a763ae0e9de`) completed successfully without modifying any application source code, deployment configurations, or environment variables.

### System Readiness Summary
- **Automated Test & Build Health:** 100% passing across backend unit/integration tests (`98 passed, 0 failed, 0 skipped` in `3.63s`), frontend unit tests (`5 passed, 0 failed` in `321.95ms`), TypeScript/Vite production build (`0 errors` in `2.53s`), and Git whitespace/conflict checks (`git diff --check` exit code `0`).
- **Production Architecture & Live Verification:** The `Vercel frontend → Render backend → INTEGRIS forensic engine` production pipeline is live and healthy. Both `GET /api/v1/health` (`HTTP 200`, `304.25 ms`) and `POST /api/v1/investigate` (`HTTP 200`, `344.05 ms`) responded with 100% structural and behavioral parity against local execution on the Phase 7 verification fixture.
- **Forensic Engine & Format Coverage:** All 6 supported formats (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`) and all 5 Phase 7 forensic accuracy fixes remain intact across the 119-dataset synthetic corpus (`48` true positives, `4` true negatives, `0` false negatives, `0` crashes/500s) and the 45 MB stress regression dataset (`156,310` rows × `26` columns, `29` findings, Trust Score `0.0`, Verdict `COMPROMISED`, Grade `F`).
- **Security & Zero-Retention Posture:** The backend processes all uploads strictly in volatile memory (`io.BytesIO`), writes zero temporary or persistent files to disk, executes zero shell/subprocess commands, exposes zero Python tracebacks or internal filesystem paths across error responses (`400`, `413`, `422`, `500`), and contains zero tracked secrets or credentials.
- **Audit Findings:** Zero Critical or High defects were identified. Four Low-severity / defense-in-depth items (`DEF-P8-001` through `DEF-P8-004`) were documented for optional remediation in Phase 9.

---

## 2. Baseline

| Property | Verified Value |
| :--- | :--- |
| **Repository Path** | `E:\MHT CET REGISTRATION\BE\Task\Integris` |
| **GitHub Remote** | `https://github.com/TERMINATOR7732/integris.git` |
| **Active Branch** | `main` |
| **Commit SHA (Full)** | `200aaecebe42f9f758c021b991f00a763ae0e9de` |
| **Commit SHA (Short)** | `200aaec` |
| **Commit Message** | `fix(engine): resolve phase 6 forensic false positives and false negatives` |
| **Remote `origin/main` SHA** | `200aaecebe42f9f758c021b991f00a763ae0e9de` (100% synchronized) |
| **Production Frontend URL** | `https://integris-ten.vercel.app` |
| **Production Backend URL** | `https://integris-sp5o.onrender.com` |
| **Production API Base URL** | `https://integris-sp5o.onrender.com/api/v1` |
| **Production Health Endpoint** | `https://integris-sp5o.onrender.com/api/v1/health` |
| **Active Architecture** | `Vercel frontend → Render backend → INTEGRIS forensic engine` (Google Cloud Run untouched and inactive) |
| **Audit Timestamp** | `2026-09-25T19:00:00+05:30` (`2026-09-25T13:30:00Z`) |

---

## 3. Automated Tests

| Area | Result | Details |
| :--- | :--- | :--- |
| **Backend pytest** | **PASS (`98 / 98`)** | Command: `.\backend\.venv\Scripts\python.exe -m pytest backend/tests -v --ignore=backend/tests/validate_claude_corpus.py`<br>`98 passed, 0 failed, 0 skipped, 7 warnings` in `3.63s` (warnings are third-party Starlette/FastAPI deprecation notices for `httpx` and status constant aliases). |
| **Frontend tests** | **PASS (`5 / 5`)** | Command: `npm test -- --run` (`node --test src/utils/reportGenerator.test.js --run`)<br>`5 passed, 0 failed, 0 skipped` in `321.95 ms`. |
| **Production build** | **PASS (`0 errors`)** | Command: `npm run build` (`tsc -b && vite build`)<br>`1908 modules transformed`, built `dist/index.html` (`0.87 kB`), `dist/assets/index-jmIkraCE.css` (`3.75 kB`), `dist/assets/index-bzF2CaQ5.js` (`353.32 kB` / `96.58 kB` gzip) in `2.53s`. |
| **git diff check** | **PASS (`Clean`)** | Command: `git diff --check`<br>Exit code `0`, zero whitespace errors or conflict markers. |

---

## 4. Format Coverage

All supported and adversarial formats were verified locally through `POST /api/v1/investigate` across the 119-dataset synthetic corpus and benchmark fixtures:

| Format / Category | Representative Fixtures Tested | Ingestion Outcome | HTTP Status | Findings & Trust Score Behavior | Crash / 500 | Matches Expectation |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| **CSV — Clean** | `datasets/clean_baseline.csv`, `clean/ecommerce_orders_clean.csv`, `csv/clean_banking_transactions.csv` | Accepted | `200` | `0` anomalies (`1` Info composite key on `clean_baseline.csv`), Score `100.0`, Verdict `reliable` (`A+`) | No | Yes |
| **CSV — Duplicate & PK Collisions** | `single_anomaly/duplicates_exact_and_key.csv`, `csv/identifiers_duplicates_5pct.csv` | Accepted | `200` | Emits `FND-UNQ-EXACT-DUPLICATES` and `FND-UNQ-PK-COLLISION-*` with exact row indices; Score `66.1–80.0` | No | Yes |
| **CSV — Missingness & Sentinels** | `single_anomaly/missing_values_30pct.csv`, `csv/missing_values_scattered_and_clustered.csv`, `datasets/moderate_quality.csv` | Accepted | `200` | Emits `FND-CMP-MISS-*`, `FND-CMP-SENT-TXT-*`, `FND-CMP-SENT-NUM-*`; Score `25.0–82.7` | No | Yes |
| **CSV — Temporal Inconsistencies** | `single_anomaly/date_inversion_admit_after_discharge.csv`, `domain/support_tickets_corrupted.csv`, `domain/finance_corrupted.csv` | Accepted | `200` | Emits `FND-CNS-TEMP-admit_date-discharge_date`, `opened_date-closed_date`, `transaction_datetime-settlement_date` | No | Yes |
| **CSV — Numeric & Distribution Anomalies** | `csv/numeric_anomalies.csv`, `single_anomaly/numeric_outliers_extreme.csv` | Accepted | `200` | Emits `FND-DST-OUTLIER-*`, `FND-DST-SKEW-*`, `FND-DST-BENFORD-*`, `FND-CNS-NEG-*`; Score `64.6–99.4` | No | Yes |
| **CSV — Categorical & Type Drift** | `csv/categorical_drift_employment_status.csv`, `single_anomaly/type_drift_numeric_as_text.csv`, `single_anomaly/string_casing_whitespace_pollution.csv` | Accepted | `200` | Emits `FND-VAL-CASING-*`, `FND-VAL-TYPEDRIFT-*`, `FND-CNS-FORMAT-*` | No | Yes |
| **CSV — Target Leakage** | `csv/leakage_and_legitimate_derivation.csv` (`target_column=approval_outcome`), `datasets/corrupted_forensic.csv` (`target_column=attrition`) | Accepted | `200` | Emits `FND-LKG-CORR-risk_score` / `FND-LKG-PROXY-leaving_flag`; ignores legitimate `tax_amount = 0.18 * base_amount` | No | Yes |
| **TSV — Valid & Anomalous** | `tsv/clean_food_rescue.tsv`, `tsv/clean_student_records.tsv`, `tsv/tsv_standard.tsv`, `cross_format/family_b_duplicates.tsv` | Accepted | `200` | Clean TSVs score `100.0` (`0` findings); duplicate TSV emits `FND-UNQ-EXACT-DUPLICATES` and `FND-UNQ-PK-COLLISION-order_id` (`66.1`) | No | Yes |
| **TXT — Structured Tabular** | `txt/txt_comma_separated.txt`, `txt/txt_pipe_separated.txt`, `txt/txt_semicolon_separated.txt`, `txt/pipe_delimited_logs.txt` | Accepted | `200` | Delimiter sniffed accurately (`,`, `\|`, `;`, `\t`); `pipe_delimited_logs.txt` detects `FND-VAL-TYPEDRIFT-unit_price` (`75.9`) | No | Yes |
| **TXT — Prose / Binary / Empty** | `txt/txt_nontabular_prose.txt`, `adversarial/wrong_extension/binary_renamed_txt.txt` | Rejected | `400` | Controlled `400 Bad Request` rejecting unstructured prose and binary null-byte payloads | No | Yes |
| **XLSX — Clean, Multi-Sheet & Anomalous** | `xlsx/clean_iot_sensor.xlsx`, `xlsx/multisheet_workbook.xlsx`, `xlsx/unicode_headers_and_sheetname.xlsx`, `cross_format/family_b_duplicates.xlsx` | Accepted | `200` | Selects first non-empty sheet, populates `sheet_name` and `available_sheets`, detects duplicates (`66.1`) and clean sheets (`100.0`) | No | Yes |
| **XLSX — Corrupted / Truncated / Zero-Byte** | `adversarial/corrupted/corrupted_zip_xlsx.xlsx`, `truncated_xlsx.xlsx`, `zero_byte_file.xlsx` | Rejected | `400` | Controlled `400 Bad Request` (`Unable to read Excel file (.xlsx)...` or `0 bytes`) | No | Yes |
| **XLS — Legacy Clean & Anomalous** | `xls/clean_employees_legacy.xls`, `xls/legacy_accounting_sheet.xls`, `xls/transactions_with_anomalies_legacy.xls` | Accepted | `200` | Clean `.xls` files score `100.0`; `transactions_with_anomalies_legacy.xls` preserves `"N/A"` and emits `FND-VAL-TYPEDRIFT-amount` & `FND-CMP-SENT-TXT-amount` (`68.8`) | No | Yes |
| **PDF — Single-Page, Multi-Page & Continuation** | `pdf/clean_one_page_table.pdf`, `pdf/clean_multipage_table_repeated_headers.pdf`, `pdf/numeric_heavy_sensor_table.pdf`, `pdf/anomalous_healthcare_table.pdf` | Accepted | `200` | Coalesces multi-page tables without duplicating headers; retains 1-row final continuation page (`150` rows on `numeric_heavy_sensor_table.pdf`, Score `100.0`) | No | Yes |
| **PDF — Scanned / Header-Only / Malformed** | `pdf/scanned_image_only_no_text.pdf`, `adversarial/corrupted/malformed_pdf.pdf`, 1-row header-only PDF | Rejected | `400` | Controlled `400 Bad Request` (`This PDF does not contain machine-readable tabular data. OCR is not currently enabled...`) | No | Yes |
| **Encoding, BOM, Unicode & Duplicate Headers** | `csv/csv_utf8_bom.csv`, `csv/unicode_multilingual_text.csv`, `csv/csv_duplicate_headers_exact.csv`, `adversarial/duplicate_headers/*` | Accepted | `200` | UTF-8 BOM stripped cleanly, CJK/RTL/combining Unicode preserved, duplicate headers deduplicated (`col`, `col_1`, `col_2`) | No | Yes |
| **Wrong Extension / Magic-Byte Mismatch** | `valid_pdf_renamed.xlsx`, `valid_xls_renamed.csv`, `valid_xlsx_renamed.pdf`, `plain_text_renamed.pdf` | Rejected | `400` | 100% rejected by `detect_file_type()` signature validation with descriptive `400` error | No | Yes |
| **Empty & Header-Only Files** | `adversarial/empty/completely_empty.csv`, `adversarial/empty/header_only.csv` | Rejected | `400` | `0`-byte and `0`-data-row files rejected cleanly with `HTTP 400` | No | Yes |

---

## 5. Security Audit

### 5.1 Security Controls Verified
1. **Zero-Retention In-Memory File Handling (`backend/app/api/routes.py`, `backend/app/ingestion/*`):**
   - Uploaded streams are read directly into a bounded `bytes` buffer (`await file.read(max_bytes + 1)`) and wrapped in `io.BytesIO(content)`.
   - Static code scan (`git grep`) across `backend/app/` confirmed zero usage of `tempfile`, `NamedTemporaryFile`, `open(..., "w")`, `Path.write_bytes`, `shutil`, `subprocess`, `os.system`, `eval`, or `exec`.
   - Empirical check before and after 13 adversarial requests confirmed `0` files created in `tempfile.gettempdir()` or the repository directory.
2. **Path Traversal & Malicious Filenames:**
   - Tested `../../etc/passwd.csv`, `..\..\Windows\win.ini.csv`, and `<img src=x onerror=alert(1)>.csv`. Because the filename is only used to extract the extension (`filename.rsplit(".", 1)[-1].lower()`) and populate `InvestigationMetadata.file_name`, no filesystem traversal occurs. See `DEF-P8-002` (Low) regarding normalizing `metadata.file_name`.
3. **Magic-Byte & Decompression Bomb Defenses (`backend/app/ingestion/detector.py`, `excel_parser.py`):**
   - `detect_file_type()` enforces strict cross-checks between magic bytes (`%PDF`, `PK\x03\x04`, `\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1`) and extensions, and rejects binary null bytes (`\x00`) in `.csv`/`.tsv`/`.txt` files.
   - `parse_excel()` inspects ZIP entry headers (`sum(info.file_size for info in zf.infolist())`) and aborts with `HTTP 400` if uncompressed size exceeds `MAX_EXCEL_UNCOMPRESSED_BYTES = 250 MB`.
4. **Upload & Dimension Boundaries (`backend/app/core/config.py`, `backend/app/api/routes.py`):**
   - Format-specific byte limits enforced before parsing: `50 MB` for `.csv`/`.tsv`/`.txt`, `25 MB` for `.xlsx`/`.xls`, `15 MB` for `.pdf` (`HTTP 413`).
   - Post-parse structural bounds enforced: `MAX_DATASET_ROWS = 500,000` and `MAX_DATASET_COLUMNS = 1,000` (`HTTP 413`).
5. **Error Redaction & Information Disclosure (`backend/app/main.py`, `backend/app/api/routes.py`):**
   - All parser errors return controlled `HTTP 400` messages.
   - Unhandled exceptions in `routes.py` and `ErrorHandlerMiddleware` return only `type(exc).__name__` (e.g. `Forensic engine encountered an internal server error: RuntimeError.`), never leaking stack traces, file paths, usernames, or environment variables.
6. **Secrets & Configuration Hygiene:**
   - Repository-wide scan confirmed zero committed `.env` files, API keys, private keys, or credentials. Only `.env.example`, `backend/.env.example`, and `frontend/.env.example` are tracked.

### 5.2 Security Findings Classification

| Severity | Count | Summary |
| :--- | :---: | :--- |
| **Critical** | `0` | None |
| **High** | `0` | None |
| **Medium** | `0` | None |
| **Low** | `2` | `DEF-P8-001` (Permissive `CORS_ORIGIN_REGEX` matching any `*.vercel.app` tenant and unanchored `re.match` in `ErrorHandlerMiddleware`); `DEF-P8-002` (Raw client `UploadFile.filename` echoed into `metadata.file_name` without `basename` sanitization). |
| **Informational** | `2` | `INFO-SEC-001` (`backend/vercel.json` legacy config still present in repo though Render is the active backend); `INFO-SEC-002` (Starlette/FastAPI deprecation warnings in test suite for `HTTP_413`/`HTTP_422` constant names). |

---

## 6. Production Smoke Tests & Local-vs-Production Parity

### 6.1 `GET https://integris-sp5o.onrender.com/api/v1/health`
- **HTTP Status:** `200 OK`
- **Response Latency:** `304.25 ms`
- **CORS Header (`Origin: https://integris-ten.vercel.app`):** `access-control-allow-origin: https://integris-ten.vercel.app`
- **Response Body:**
  ```json
  {
    "status": "healthy",
    "service": "INTEGRIS Forensic Engine",
    "version": "0.1.0",
    "engine_status": "ready",
    "timestamp": "2026-09-25T13:34:39.292048+00:00"
  }
  ```

### 6.2 `POST https://integris-sp5o.onrender.com/api/v1/investigate` (5-Row Smoke Fixture)
Tested the exact 5-row fixture (`id,admit_date,discharge_date,product_code` with 1 chronological inversion on row 2 and `product_code` values `P001..P005`) against both local `TestClient` and live production Render API:

| Metric / Field | Local Execution (`TestClient`) | Production (`integris-sp5o.onrender.com`) | Parity Status |
| :--- | :--- | :--- | :---: |
| **HTTP Status** | `200 OK` | `200 OK` | **IDENTICAL** |
| **Response Time** | `46.55 ms` | `344.05 ms` (includes TLS + network RTT) | **HEALTHY** |
| **CORS Allow-Origin** | `https://integris-ten.vercel.app` | `https://integris-ten.vercel.app` | **IDENTICAL** |
| **Top-Level Dossier Keys** | `metadata, summary, trust_score, findings, columns, recommendations` | `metadata, summary, trust_score, findings, columns, recommendations` | **IDENTICAL** |
| **Detected Finding IDs** | `["FND-CNS-TEMP-admit_date-discharge_date"]` | `["FND-CNS-TEMP-admit_date-discharge_date"]` | **IDENTICAL** |
| **`product_code` False Positive** | Absent (`0` uniqueness findings) | Absent (`0` uniqueness findings) | **IDENTICAL** |
| **Trust Score** | `80.0` (`total_deductions: 20.0`) | `80.0` (`total_deductions: 20.0`) | **IDENTICAL** |
| **Executive Verdict & Grade** | `reliable` / `B` | `reliable` / `B` | **IDENTICAL** |

---

## 7. Performance

All performance benchmarks were executed locally in-memory via `FastAPI TestClient` (never uploading large datasets to Render). Both un-instrumented wall-clock times and `tracemalloc` peak heap allocations were recorded:

| Workload Dataset | File Size | Dimensions (Rows × Cols) | Phase 7 Baseline Runtime | Phase 8 Measured Runtime (Un-instrumented) | Phase 8 Engine `execution_time_ms` | Peak Python Heap (`tracemalloc`) | Status / Findings / Score |
| :--- | ---: | :---: | ---: | ---: | ---: | ---: | :--- |
| **`large_hr_dataset_1mb.csv`** | `0.85 MiB` (`886,070 B`) | `11,189 × 9` | `362.21 ms` | **`362.92 ms`** | `315.76 ms` | `6.60 MiB` | `HTTP 200` • `7` findings • Score `37.1` (`caution`) |
| **`large_hr_dataset_5mb.csv`** | `4.22 MiB` (`4,423,063 B`) | `55,901 × 9` | `1,425.64 ms` (`1.43 s`) | **`1,570.60 ms` (`1.57 s`)** | `1,452.38 ms` | `54.31 MiB` | `HTTP 200` • `7` findings • Score `37.1` (`caution`) |
| **`large_hr_dataset_10mb.csv`** | `8.43 MiB` (`8,840,997 B`) | `111,802 × 9` | `2,666.65 ms` (`2.67 s`) | **`3,168.49 ms` (`3.17 s`)** | `2,960.20 ms` | `58.52 MiB` | `HTTP 200` • `7` findings • Score `37.1` (`caution`) |
| **`csv_wide_999_columns.csv`** | `0.27 MiB` (`287,215 B`) | `40 × 999` | `2,729.20 ms` (`2.73 s`) | **`2,990.34 ms` (`2.99 s`)** | `2,928.42 ms` | `7.22 MiB` | `HTTP 200` • `0` findings • Score `100.0` (`reliable`) |
| **`integris_45mb_forensic_stress_dataset.csv`** | `43.53 MiB` (`45,643,565 B`) | `156,310 × 26` | `9,700.00 ms` (`9.70 s`) | **`9,709.18 ms` (`9.71 s`)** | `8,462.24 ms` | `207.11 MiB` | `HTTP 200` • `29` findings • Score `0.0` (`compromised`, `F`) |
| **`forensic_stress_186k_37col.csv`** | `45.78 MiB` (`48,008,791 B`) | `186,251 × 37` | N/A | **`5,580.16 ms` (`5.58 s`)** | `4,188.87 ms` | N/A | `HTTP 200` • `0` findings • Score `100.0` (`reliable`, `A+`) |
| **Synthetic `>50 MiB` Upload Guard** | `50.35 MiB` (`52,800,004 B`) | Rejected pre-parse | N/A | **`253.55 ms`** | N/A | `< 52 MiB` | `HTTP 413` (`Dataset size (50.0 MB) exceeds the maximum allowed limit of 50 MB.`) |

### Large-Dataset Safety Verification
- `git ls-files | Select-String "stress|45mb|85mb|dataset"` confirmed that neither `integris_45mb_forensic_stress_dataset.csv` nor `datasets/forensic_stress_186k_37col.csv` nor `Integris test files.zip` is tracked in Git.
- `.gitignore` explicitly excludes `*stress*.csv`, `datasets/*stress*.csv`, and `integris_validation_results.json`.

---

## 8. Frontend / UX & Accessibility Audit

### 8.1 Primary User Workflow Verification
1. **Application Load & Health Indicator (`App.tsx`, `Header.tsx`):** Loads cleanly with dark forensic theme (`#070a10`), probes `/api/v1/health` on mount and every 15s, and displays `ENGINE ONLINE` (`#34d399`).
2. **Dataset Selection & Client-Side Pre-Validation (`DatasetUploader.tsx`):**
   - Validates extensions (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`), format-specific size limits (`50 MB` CSV/TSV/TXT, `25 MB` Excel, `15 MB` PDF), and `0`-byte files before network transmission.
   - Sniffs the first `32 KB` of text datasets to preview column headers and populate the optional `Target column` selector.
3. **Loading State (`InvestigationLoading.tsx`):** Displays file name, formatted byte size, and active progress state while `investigateDataset()` is in flight.
4. **Results & Dossier Rendering (`CaseHeader.tsx`, `ExecutiveVerdictCard.tsx`, `DatasetProfileOverview.tsx`, `FindingsExplorer.tsx`, `ColumnDossiers.tsx`, `TrustScoreBreakdown.tsx`):**
   - Renders `overall_score`, `VerdictBadge` (`RELIABLE`, `CAUTION`, `COMPROMISED`), letter `grade` (`A+`, `A`, `B`, `C`, `D`, `F`), severity pill counts (`Critical`, `High`, `Medium`, `Low`, `Total`), and 4 structural summary cards (`Total Cell Matrix`, `Missing Cells`, `Duplicate Records`, `RAM In-Memory`).
   - `CleanDatasetNotice` renders when `overall_score >= 95` or `findings.length === 0`.
   - `FindingsExplorer` supports live text search across title/description/column/ID, severity tab filtering, and category filtering, and opens `FindingDetailDrawer` on click.
5. **Report Preview & Export (`ReportPreviewModal.tsx`, `reportGenerator.ts`):**
   - Supports Print/Save-to-PDF (`@media print` light-theme print stylesheet in `index.css`), standalone Markdown export (`.md`), and structured JSON dossier export (`.json`).
6. **Reset / New Investigation Flow:** Clicking `New Investigation` resets `activeView` to `'upload'`, clears active modals/drawers, and preserves `Current Case` navigation in the top header.

### 8.2 Responsive & Accessibility Observations (`DEF-P8-003`)
- **Strengths:**
  - `index.css` defines clear `:focus-visible` outlines (`2px solid #38bdf8`) for `<button>`, `<input>`, and `<select>`.
  - `ReportPreviewModal` and `FindingDetailDrawer` support `Escape` key dismissal, and `ReportPreviewModal` includes `role="dialog"` and `aria-modal="true"`.
  - High color contrast on primary text (`#f8fafc` / `#e2e8f0` on `#070a10` / `#0c121d`).
- **Minor UX / Accessibility Gaps Identified (`DEF-P8-003`, Low):**
  1. **Keyboard Access on Dropzone & Finding Cards:** The upload dropzone (`DatasetUploader.tsx:229`) and finding cards (`FindingsExplorer.tsx:284`) are `<div onClick={...}>` elements without `role="button"`, `tabIndex={0}`, or `onKeyDown` (`Enter`/`Space`) handlers.
  2. **Mobile Viewport Grid Overflow (`< 520px`):** `ExecutiveVerdictCard.tsx:63` (`gridTemplateColumns: 'minmax(220px, 280px) 1fr'`) and `ReportPreviewModal.tsx:366` (`gridTemplateColumns: 'minmax(200px, 260px) 1fr'`) use fixed two-column templates that compress or overflow horizontally on narrow mobile screens (`320px–480px`).
  3. **Column Highlight Filter Behavior (`ColumnDossiers.tsx:70`):** Clicking an affected column tag in `FindingsExplorer` or `FindingDetailDrawer` switches to the `Column Profiles` tab and displays `"Clear filter: <col> ✕"`, but `filteredColumns` does not actually filter the list to `highlightColumn` (it only highlights the border in place).
  4. **Target Column Input Label Association on Binary Files (`DatasetUploader.tsx:419`):** When an `.xlsx`, `.xls`, or `.pdf` file is selected (`headers.length === 0`), the fallback `<input type="text">` lacks `id="target-column-select"` to match `<label htmlFor="target-column-select">`.

---

## 9. Phase 7 Regression Results

| Phase 7 Fix Area | Verification Method & Evidence | Status |
| :--- | :--- | :---: |
| **1. Product / Catalog Code False-Positive Reduction** (`product_code`, `item_code`, `sku_code`) | Verified via `test_uniqueness_token_aware_identifier_matching`, `test_uniqueness_product_code_and_foreign_key_no_false_positives`, live Render smoke test, and 21 corpus datasets (`0` `FND-UNQ-PK-COLLISION-product_code` false positives). | **PASS** |
| **2. Foreign-Key vs Primary-Key Contextual Disambiguation** (`customer_id`, `agent_id`, `user_id`, `attending_physician_id`, `manager_id`, `device_id`, `account_id`) | Verified via `test_uniqueness_product_code_and_foreign_key_no_false_positives` and all 8 `clean/*_clean.csv` domain tables (all 8 score `100.0` with `0` false positives, while genuine PK collisions still fire). | **PASS** |
| **3. Expanded Domain Lifecycle Temporal Pairs** (`admit→discharge`, `enrollment→graduation`, `opened→closed`, `pickup→delivered`, `ship→delivery`, `transaction_datetime→settlement_date`, `hire→termination`) | Verified via `test_consistency_expanded_lifecycle_temporal_pairs` (assertions A–I), live Render smoke test (`FND-CNS-TEMP-admit_date-discharge_date`), and all 7 temporal corpus datasets (`0` false negatives). | **PASS** |
| **4. Non-Regression on `hire_date → attendance_pct`** | Verified in `test_consistency_expanded_lifecycle_temporal_pairs` and 45 MB stress dataset (`FND-CNS-TEMP-hire_date-attendance_pct` absent; `FND-CNS-TEMP-hire_date-termination_date` present on `1,978` rows). | **PASS** |
| **5. Excel `"N/A"` Sentinel Preservation** (`excel_parser.py`) | Verified via `test_parse_excel_preserves_na_text_sentinels_and_blank_cells` and `xls/transactions_with_anomalies_legacy.xls` (`FND-VAL-TYPEDRIFT-amount` and `FND-CMP-SENT-TXT-amount` detected while blank cells remain `NaN`). | **PASS** |
| **6. Multi-Page PDF 1-Row Continuation Retention** (`pdf_parser.py`) | Verified via `test_parse_pdf_retains_single_row_continuation_page_and_rejects_header_only` and `pdf/numeric_heavy_sensor_table.pdf` (`150` rows extracted including final row `RD00150` on page 5, Score `100.0`). | **PASS** |

---

## 10. Confirmed Defects

Zero Critical, High, or Medium defects were found. Four Low-severity defects/hardening items were confirmed with exact reproduction evidence:

### `DEF-P8-001` — Permissive `CORS_ORIGIN_REGEX` (`*.vercel.app`) and Unanchored `re.match` in `ErrorHandlerMiddleware`
- **Severity:** Low
- **Component:** `backend/app/core/config.py` (line 25), `render.yaml` (line 14), `backend/app/main.py` (lines 27–31)
- **Reproduction:**
  1. Send `GET /api/v1/health` with `Origin: https://unrelated-app.vercel.app`.
  2. Evaluate `re.match(settings.CORS_ORIGIN_REGEX, "https://integris-ten.vercel.app.evil.com")` as executed by `ErrorHandlerMiddleware.dispatch` (`backend/app/main.py:28`) on HTTP 500 responses.
- **Expected Behavior:** Only authorized INTEGRIS frontend origins (e.g. `https://integris-ten.vercel.app` and project-specific preview deployments) should receive `Access-Control-Allow-Origin`, and `ErrorHandlerMiddleware` should use full-string anchored matching (`re.fullmatch`).
- **Actual Behavior:** `CORS_ORIGIN_REGEX = r"https://.*\.vercel\.app"` allows any `*.vercel.app` subdomain to receive `Access-Control-Allow-Origin: <origin>` and `Access-Control-Allow-Credentials: true`. In addition, `ErrorHandlerMiddleware` uses `re.match` without a `$` anchor, which matches `https://integris-ten.vercel.app.evil.com` on 500 error responses.
- **Evidence:** `cors_audit["other_vercel_tenant"]` returned `allow_origin_200: "https://unrelated-app.vercel.app"`, and `bool(re.match(settings.CORS_ORIGIN_REGEX, "https://integris-ten.vercel.app.evil.com"))` evaluated to `True`.
- **Impact:** Low (INTEGRIS uses zero cookies, sessions, or authentication tokens, so cross-origin credentialed requests cannot access private user state).
- **Recommended Next Action:** Anchor `CORS_ORIGIN_REGEX` to `^https://integris(-[a-z0-9-]+)?\.vercel\.app$`, replace `re.match` with `re.fullmatch` in `ErrorHandlerMiddleware`, and set `allow_credentials=False` if cookies/auth headers are not used.

### `DEF-P8-002` — Client-Supplied `UploadFile.filename` Stored Unsanitized in `InvestigationMetadata.file_name`
- **Severity:** Low
- **Component:** `backend/app/api/routes.py` (lines 51, 140)
- **Reproduction:** Send `POST /api/v1/investigate` with multipart filename `../../etc/passwd.csv` or `..\..\Windows\win.ini.csv`.
- **Expected Behavior:** Directory traversal prefixes (`../`, `..\`) should be stripped so `metadata.file_name` contains only the clean basename (`passwd.csv`, `win.ini.csv`).
- **Actual Behavior:** `metadata.file_name` echoes `"../../etc/passwd.csv"` and `"..\\..\\Windows\\win.ini.csv"` verbatim into the JSON response and exported report header.
- **Evidence:** `security_cases["path_traversal_unix"]` returned `status_code: 200` with `metadata.file_name: "../../etc/passwd.csv"`. (Zero files were written to disk.)
- **Impact:** Low (backend processing is 100% in-memory `io.BytesIO`, so no filesystem write or traversal occurs, and React escapes JSX text nodes).
- **Recommended Next Action:** Strip path segments in `routes.py` via `PurePath(filename.replace("\\", "/")).name` and sanitize control characters before constructing `InvestigationMetadata`.

### `DEF-P8-003` — Minor Frontend Accessibility, Mobile Grid, and Column Filter UX Gaps
- **Severity:** Low
- **Component:** `frontend/src/components/upload/DatasetUploader.tsx` (lines 229, 419), `frontend/src/components/investigation/FindingsExplorer.tsx` (lines 110, 284), `frontend/src/components/investigation/ExecutiveVerdictCard.tsx` (line 63), `frontend/src/components/investigation/ColumnDossiers.tsx` (line 70)
- **Reproduction:**
  1. Navigate the upload dropzone or finding cards using only the `Tab` and `Enter`/`Space` keys.
  2. Inspect `ExecutiveVerdictCard` on a `< 480px` mobile viewport.
  3. Click an affected column pill on a finding card to jump to `Column Profiles` when `highlightColumn` is set.
- **Expected Behavior:** Dropzone and finding cards should be keyboard-focusable (`tabIndex={0}`, `role="button"`, `onKeyDown`); `ExecutiveVerdictCard` should stack into a single column on narrow mobile viewports; `ColumnDossiers` should filter or scroll to `highlightColumn` when `"Clear filter: <col> ✕"` is active.
- **Actual Behavior:** Dropzone and finding cards require mouse click; `ExecutiveVerdictCard` uses fixed `gridTemplateColumns: 'minmax(220px, 280px) 1fr'`; `ColumnDossiers` highlights the border of `highlightColumn` without filtering `filteredColumns`.
- **Evidence:** Direct code inspection of `DatasetUploader.tsx:229`, `FindingsExplorer.tsx:284`, `ExecutiveVerdictCard.tsx:63`, and `ColumnDossiers.tsx:70–83`.
- **Impact:** Low (all desktop/mouse flows and report exports work cleanly).
- **Recommended Next Action:** Add keyboard semantics (`role="button"`, `tabIndex={0}`, `onKeyDown`) to interactive card divs, use `repeat(auto-fit, minmax(240px, 1fr))` in `ExecutiveVerdictCard`, and include `if (highlightColumn && col.name !== highlightColumn) return false;` in `ColumnDossiers.tsx`.

### `DEF-P8-004` — Outdated Production API URL and Health Response Example in `README.md`
- **Severity:** Low (Informational / Documentation)
- **Component:** `README.md` (lines 13, 16, 240–245)
- **Reproduction:** Compare `README.md` lines 13–16 and 240–245 against the active Render backend (`https://integris-sp5o.onrender.com/api/v1/health`) and `HealthResponse` in `backend/app/models/report.py`.
- **Expected Behavior:** `README.md` should reference the active Render API URL and the current `HealthResponse` JSON schema (`status`, `service`, `version`, `engine_status`, `timestamp`).
- **Actual Behavior:** `README.md` lines 13 & 16 link to `https://integris-api.vercel.app` and lines 240–245 show an older 3-field health payload (`{"status": "operational", "version": "0.1.0", "engine": "active"}`).
- **Evidence:** Direct inspection of `README.md:13–16` and `README.md:240–245`.
- **Impact:** Low (documentation only; no runtime impact).
- **Recommended Next Action:** Update `README.md` links and the `/api/v1/health` example snippet in Phase 9.

---

## 11. Non-Defects / Known Limitations

1. **Intentional `header_only.csv` HTTP 400 Rejection:**
   - `adversarial/empty/header_only.csv` (1 header row, 0 data rows) is rejected by `routes.py` (`if df.empty or len(df.columns) == 0: raise HTTPException(400, "Dataset contains 0 records or 0 columns after parsing.")`). This is an intentional, test-enforced API guard (`test_pipeline_empty_single_row_and_duplicate_columns`), whereas `run_forensic_pipeline()` supports 0-row DataFrames when invoked directly in Python.
2. **Unsupported Specialized Anomaly Categories (`18` Corpus Expectations):**
   - As documented in Phases 6 and 7, the synthetic corpus includes 18 expectations for out-of-scope domain/cross-row rules: percentage upper-bound checks (`> 100%`), cross-column arithmetic formulas (`total == qty * price`), standalone future/ancient calendar date bounds, row-to-row sequential timestamp monotonicity, geospatial impossible-travel velocity, batch covariate distribution shift, and domain-specific business rules (education letter-grade lookup, negative parcel weight, clinical vital ranges). These are feature-scope boundaries, not defects in existing detectors.
3. **Benford's Law Screening Alerts on Synthetic Uniform Distributions:**
   - Synthetic datasets generated with `random.uniform(...)` over bounded ranges (e.g. `10..500`) trigger `FND-DST-BENFORD-*` (`MEDIUM`) when they span multiple orders of magnitude and have $\ge 100$ positive records. As disclosed in `README.md` Section 8, Benford's Law is a statistical screening lead and naturally flags uniform synthetic distributions.
4. **Synthetic Corpus Generator Defects (`4` Datasets):**
   - `pdf/date_heavy_shipment_table.pdf` (generator created 4 independent random dates per row without ordering), `adversarial/empty/one_column.csv` (20 rows chosen from 5 statuses causing exact duplicates), `xls/transactions_with_anomalies_legacy.xls` (generator duplicated `TXN00005`), and `edge_cases/single_row.csv` (1-row slice of clean e-commerce table) are confirmed artifacts of the synthetic corpus generator, not INTEGRIS defects.

---

## 12. Production Status

| Check | Status | Details |
| :--- | :---: | :--- |
| **Render Backend (`https://integris-sp5o.onrender.com`)** | **HEALTHY** | Live on commit `200aaec`; `GET /api/v1/health` returned `HTTP 200` in `304.25 ms`. |
| **Vercel Frontend (`https://integris-ten.vercel.app`)** | **HEALTHY** | Returned `HTTP 200`, serving `/assets/index-DlgJUNMe.js` configured with `https://integris-sp5o.onrender.com/api/v1`. |
| **API Connectivity & CORS** | **VERIFIED** | `POST /api/v1/investigate` returned `HTTP 200` in `344.05 ms` with `access-control-allow-origin: https://integris-ten.vercel.app`. |
| **Production Configuration** | **UNCHANGED** | Zero changes made to Render, Vercel, or environment variables. |
| **Google Cloud / Cloud Run** | **UNTOUCHED** | Zero GCP commands or changes executed. |

---

## 13. Files Changed

- **Created (Untracked Audit Report):**
  - `INTEGRIS_PHASE8_QA_REPORT.md`
- **Modified Tracked Application / Config Files:**
  - `None` (`0` tracked files modified; working tree is 100% clean of code changes).

---

## 14. Phase 9 Recommendations

If a targeted Phase 9 polish pass is desired, only the following small, evidence-based changes are recommended:
1. **CORS Hardening (`DEF-P8-001`):** Narrow `CORS_ORIGIN_REGEX` to `^https://integris(-[a-z0-9-]+)?\.vercel\.app$` and use `re.fullmatch` in `ErrorHandlerMiddleware`.
2. **Filename Basename Sanitization (`DEF-P8-002`):** Normalize `UploadFile.filename` in `backend/app/api/routes.py` using `PurePath(filename.replace("\\", "/")).name` before storing in `InvestigationMetadata.file_name`.
3. **Frontend Accessibility & Mobile Responsiveness (`DEF-P8-003`):**
   - Add `role="button"`, `tabIndex={0}`, and keyboard `Enter`/`Space` handlers to the upload dropzone (`DatasetUploader.tsx`) and finding cards (`FindingsExplorer.tsx`).
   - Add `id="target-column-select"` to the fallback target text input in `DatasetUploader.tsx`.
   - Update `ExecutiveVerdictCard.tsx` and `ReportPreviewModal.tsx` verdict grids to `repeat(auto-fit, minmax(240px, 1fr))` for `< 480px` mobile viewports.
   - Filter `filteredColumns` in `ColumnDossiers.tsx` when `highlightColumn` is active.
4. **Documentation Alignment (`DEF-P8-004`):** Update `README.md` lines 13–16 and 240–245 to reflect `https://integris-sp5o.onrender.com` and the 5-field `HealthResponse` schema.
