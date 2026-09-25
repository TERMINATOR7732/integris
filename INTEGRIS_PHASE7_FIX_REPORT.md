# INTEGRIS — Phase 7 Forensic Engine & Ingestion Fix Report

## 1. Starting Commit & Scope
- **Repository:** `E:\MHT CET REGISTRATION\BE\Task\Integris`
- **Branch:** `main`
- **Starting Commit:** `0587cf6 fix(api): harden production integration`
- **Execution Mode:** 100% Local Verification (Zero changes or traffic to Render, Vercel, or Google Cloud)

---

## 2. Confirmed Defects Addressed
1. **Confirmed Bug #1 — `product_code` Primary-Key Collision False Positive (`backend/app/engine/uniqueness.py`):**
   - Removed catalog/SKU qualifiers (`"product"`, `"item"`, `"sku"`) from `ENTITY_CODE_QUALIFIERS` so `product_code` is not automatically treated as a candidate entity primary key by column name alone.
2. **Confirmed Bug #2 — Foreign-Key `*_id` Primary-Key Collision False Positives (`backend/app/engine/uniqueness.py`):**
   - Added contextual primary-key vs foreign-key disambiguation using `FOREIGN_KEY_ROLE_TOKENS` (`manager`, `agent`, `physician`, `attending`, `supervisor`, `parent`, etc.), column uniqueness ratio (`unique_ratio < 0.80`), presence of an intact 100%-unique primary key in the dataset (`has_intact_primary_id`), and deduplication of secondary identifier collisions whose duplicate row indices are already explained by an earlier primary-key collision (`account_id` alongside `transaction_id`).
3. **Confirmed Bug #3 — Incomplete Domain Lifecycle `TEMPORAL_PAIRS` (`backend/app/engine/consistency.py`):**
   - Added token-aware lifecycle rules for `admit_date → discharge_date`, `enrollment_date → graduation_date`, `opened_date → closed_date`, `pickup_date → delivered_date`, `ship_date → delivery_date`, and `transaction_datetime → settlement_date`, including calendar-day grain normalization when comparing a sub-day timestamp start column (`transaction_datetime`) against a date-only end column (`settlement_date`).
4. **Confirmed Bug #4 — Excel `"N/A"` Coercion (`backend/app/ingestion/excel_parser.py`):**
   - Updated `pd.read_excel()` to pass `keep_default_na=False, na_values=[""]` so literal textual sentinel strings like `"N/A"` in `.xlsx` and `.xls` workbooks are preserved for `FND-VAL-TYPEDRIFT-*` and `FND-CMP-SENT-TXT-*` detection while genuine blank cells (`None`, `""`) continue to become `NaN`.
5. **Confirmed Bug #5 — Multi-Page PDF Final Continuation Row Loss (`backend/app/ingestion/pdf_parser.py`):**
   - Updated multi-page table coalescing to retain valid 1-row continuation tables on pages following the primary multi-row table when column counts match, the row is not a repeated header (`tbl_headers != norm_primary`), and the cells pass tabular structure guards.

---

## 3. Files Changed
### Tracked Production Files Modified (4)
- `backend/app/engine/uniqueness.py`
- `backend/app/engine/consistency.py`
- `backend/app/ingestion/excel_parser.py`
- `backend/app/ingestion/pdf_parser.py`

### Tracked Test Files Modified (4)
- `backend/tests/test_uniqueness.py`
- `backend/tests/test_profiler.py`
- `backend/tests/test_consistency.py`
- `backend/tests/test_ingestion_formats.py`

---

## 4. Explanation of Each Fix
### 4.1 Fix #1 — `product_code` Entity-Code Hardening (`backend/app/engine/uniqueness.py`)
- **Root Cause:** `ENTITY_CODE_QUALIFIERS` included `"product"`, causing `_is_identifier_column("product_code")` to return `True` and triggering `FND-UNQ-PK-COLLISION-product_code` across 21 corpus datasets (`csv/false_positive_code_columns.csv`, `csv/identifiers_composite_key.csv`, `csv/clean_ecommerce_transactions.csv`, `csv/ecommerce_transactions_true_positive.csv`, and all 18 `cross_format/family_*` files).
- **Fix:** Removed `"product"`, `"item"`, and `"sku"` from `ENTITY_CODE_QUALIFIERS`. Genuine entity qualifiers (`customer`, `user`, `employee`, `record`, `account`, `order`, `transaction`, `patient`, `student`, `primary`, `lookup`, etc.) remain intact, and 100%-unique columns still qualify via `profiler.py` cardinality rules.

### 4.2 Fix #2 — Foreign-Key `*_id` Disambiguation (`backend/app/engine/uniqueness.py`)
- **Root Cause:** `analyze_uniqueness()` checked `if is_named_id or is_candidate:` without distinguishing primary keys from repeating foreign keys (`customer_id`, `agent_id`, `user_id`, `attending_physician_id`, `manager_id`, `device_id`, `account_id`).
- **Fix:** Before running primary-key collision and null checks on a named identifier column, `analyze_uniqueness()` now evaluates contextual evidence across the dataset:
  1. Columns bearing explicit hierarchy/actor role tokens (`FOREIGN_KEY_ROLE_TOKENS`: `manager`, `agent`, `physician`, `attending`, `supervisor`, `parent`, etc.) when another named identifier column has higher uniqueness are treated as foreign keys.
  2. Columns with `unique_ratio < 0.80` (when `total_rows >= 5`, `collision_count > 1`, or another named identifier has higher uniqueness) are recognized as many-to-one foreign keys.
  3. When the dataset already has an intact 100%-unique, non-null primary identifier (`has_intact_primary_id = True`), secondary identifier columns with `unique_ratio < 0.95` are treated as foreign keys.
  4. When an earlier primary identifier column has already emitted `FND-UNQ-PK-COLLISION-*` on a set of row indices, a secondary identifier column whose colliding row indices are a subset of those same rows (such as `account_id` when two `transaction_id` records are duplicated in `csv/banking_transactions_true_positive.csv`) is not double-counted as a separate primary-key collision.

### 4.3 Fix #3 — Domain Lifecycle Temporal Pairs (`backend/app/engine/consistency.py`)
- **Root Cause:** `TEMPORAL_PAIRS` only covered `hire -> exit/termination`, `birth -> hire/graduation`, and `order -> ship/deliver`, missing 6 domain lifecycle pairs across 7 true-positive datasets.
- **Fix:** Added token-aware rules to `TEMPORAL_PAIRS` and `TEMPORAL_COLUMN_TOKENS` for:
  - `admit_date → discharge_date`
  - `enrollment_date → graduation_date`
  - `opened_date → closed_date`
  - `pickup_date → delivered_date`
  - `ship_date → delivery_date`
  - `transaction_datetime → settlement_date`
- Additionally, when the start column has sub-day time precision (`s_has_time = True`, e.g. `2024-10-22 21:19:10`) and the end column is calendar-date-only (`e_has_time = False`, e.g. `2024-10-22`), comparison normalizes the start timestamp to calendar-day grain (`s_series.dt.floor("D")`) so same-day settlements are not falsely flagged as inversions.

### 4.4 Fix #4 — Excel Textual Sentinel Preservation (`backend/app/ingestion/excel_parser.py`)
- **Root Cause:** `pd.read_excel(excel_file, sheet_name=sheet)` defaulted to `keep_default_na=True`, converting literal `"N/A"` strings in `xls/transactions_with_anomalies_legacy.xls` (`amount`) into `NaN` (`2.58%` missing, below the `5%` missingness threshold).
- **Fix:** Updated the call to `pd.read_excel(excel_file, sheet_name=sheet, keep_default_na=False, na_values=[""])`. Genuine empty cells (`None` and `""`) still parse as `NaN` and empty rows/columns are still dropped via `dropna(how="all")`, while literal `"N/A"` strings remain intact for `validity.py` (`FND-VAL-TYPEDRIFT-amount`) and `completeness.py` (`FND-CMP-SENT-TXT-amount`).

### 4.5 Fix #5 — Multi-Page PDF Single-Row Continuation Retention (`backend/app/ingestion/pdf_parser.py`)
- **Root Cause:** `parse_pdf()` filtered every page's extracted tables with `len(table) >= 2`, dropping the final page of `pdf/numeric_heavy_sensor_table.pdf` which contained 1 continuation data row (`RD00150`, yielding `149` instead of `150` rows).
- **Fix:** `parse_pdf()` still requires the primary table (`primary_table`) to have `len(table) >= 2` and pass all tabular structure checks (so 1-row header-only PDFs and decorative boxes are rejected). On subsequent pages (`page_idx > primary_page_idx`), a 1-row table whose column count matches `col_count`, whose cells are not a repeated header (`tbl_headers != norm_primary`), and whose content passes cell count, newline, and length guards is coalesced as a continuation data row.

---

## 5. Regression Tests Added
1. `backend/tests/test_uniqueness.py`:
   - Updated `test_uniqueness_token_aware_identifier_matching` to verify `product_code` and `productCode` do not trigger identifier semantics by name alone while `customer_code` and `user_id` do.
   - Added `test_uniqueness_product_code_and_foreign_key_no_false_positives` verifying clean `manager_id` (with nulls and repeats), `customer_id`, and `product_code` do not emit `FND-UNQ-PK-COLLISION-*` or `FND-UNQ-PK-NULL-*`, while a genuine `order_id` collision in the same table is detected.
2. `backend/tests/test_profiler.py`:
   - Updated `test_profiler_identifier_semantic_classification_token_aware` to verify `product_code` with duplicates (`unique_ratio = 0.95`) is not classified as `SemanticType.IDENTIFIER` by name alone, while `test_profiler_free_text_not_misclassified_as_identifier` continues to verify that a 100%-unique `product_code` column is classified as `SemanticType.IDENTIFIER`.
3. `backend/tests/test_consistency.py`:
   - Added `test_consistency_expanded_lifecycle_temporal_pairs` covering all 9 assertions (A–I): `hire_date → termination_date`, exclusion of `hire_date → attendance_pct`, `admit_date → discharge_date`, `enrollment_date → graduation_date`, `opened_date → closed_date`, `pickup_date → delivered_date`, `ship_date → delivery_date`, `transaction_datetime → settlement_date` (including same-day non-inversion), and `order_date → ship_date / delivery_date`.
4. `backend/tests/test_ingestion_formats.py`:
   - Added `test_parse_excel_preserves_na_text_sentinels_and_blank_cells` verifying literal `"N/A"` in Excel triggers `FND-VAL-TYPEDRIFT-amount` and `FND-CMP-SENT-TXT-amount` while blank cells (`None`, `""`) trigger `FND-CMP-MISS-notes`.
   - Added `test_parse_pdf_retains_single_row_continuation_page_and_rejects_header_only` verifying a 1-row final continuation page is retained, a repeated-header-only page is skipped without duplicating headers, and a 1-row header-only PDF raises `ValueError`.

---

## 6. Backend Test Result
- **Command:** `pytest backend/tests -v --ignore=backend/tests/validate_claude_corpus.py`
- **Result:** **`98 passed, 0 failed, 0 skipped`** (`3.75s`)

## 7. Frontend Test Result
- **Command:** `npm test -- --run` (in `frontend/`)
- **Result:** **`5 passed, 0 failed, 0 skipped`** (`381.19 ms`)

## 8. Frontend Build Result
- **Command:** `npm run build` (`tsc -b && vite build` in `frontend/`)
- **Result:** **Succeeded (`0` errors, built in `10.29s`)**

---

## 9. Corpus Validation Before / After Summary

| Metric | Phase 6 Baseline | Phase 7 (After Fixes) | Delta |
| :--- | :---: | :---: | :---: |
| Total Datasets on Disk | `119` | `119` | `0` |
| Expected Accepted / Actual Accepted | `105` / `104` | `105` / `104` | `0` |
| Expected Rejected / Actual Rejected | `14` / `15` | `14` / `15` | `0` |
| Ingestion Mismatches (`header_only.csv`) | `1` | `1` | `0` |
| Crashes / HTTP 500s / Non-Finite JSON | `0` | `0` | `0` |
| Matched True Positives (`TRUE_POSITIVE`) | `40` | **`48`** | **`+8`** |
| Matched True Negatives (`TRUE_NEGATIVE`) | `4` | **`4`** | `0` |
| False Negatives (`FALSE_NEGATIVE`) | `8` | **`0`** | **`-8` (100% resolved)** |
| Datasets with False Positives | `48` | **`20`** | **`-28` datasets** |
| Total Unexpected Finding Instances | `71` | **`28`** | **`-43` findings** |
| Unsupported Expectations (`NOT_CURRENTLY_SUPPORTED`) | `18` | `18` | `0` |
| Corpus Defects (`MANIFEST_ISSUE` datasets) | `3` | `4` | `+1` (`legacy.xls` FN resolved, leaving only its PK-collision corpus defect) |
| Datasets Classified as `PASS` | `58` | **`80`** | **`+22` datasets** |
| Total 119-Dataset Suite Runtime | `15.7s` | `15.83s` | `+0.13s` |

### Dataset-by-Dataset Changed Behavior (Phase 6 → Phase 7)

| Dataset | Before (Phase 6 Findings) | After (Phase 7 Findings) | Expected | Status (Before → After) |
| :--- | :--- | :--- | :--- | :---: |
| `cross_format/family_a_clean.csv` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_a_clean.pdf` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_a_clean.tsv` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_a_clean.txt` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_a_clean.xls` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_a_clean.xlsx` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `cross_format/family_b_duplicates.csv` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_b_duplicates.pdf` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_b_duplicates.tsv` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_b_duplicates.txt` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_b_duplicates.xls` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_b_duplicates.xlsx` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` | `exact_duplicate_rows` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `cross_format/family_c_temporal_anomaly.csv` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `cross_format/family_c_temporal_anomaly.pdf` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `cross_format/family_c_temporal_anomaly.tsv` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `cross_format/family_c_temporal_anomaly.txt` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `cross_format/family_c_temporal_anomaly.xls` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `cross_format/family_c_temporal_anomaly.xlsx` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `implausible_future_date` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `csv/banking_transactions_true_positive.csv` | `['FND-UNQ-PK-COLLISION-transaction_id', 'FND-UNQ-PK-COLLISION-account_id', 'FND-DST-OUTLIER-amount']` | `['FND-UNQ-PK-COLLISION-transaction_id', 'FND-CNS-TEMP-transaction_datetime-settlement_date', 'FND-DST-OUTLIER-amount']` | `temporal_inversion, extreme_outlier, duplicate_id_conflicting_fields` | `FP_AND_FN` → **`PASS`** |
| `csv/clean_crm_tickets.csv` | `['FND-UNQ-PK-COLLISION-customer_id', 'FND-UNQ-PK-COLLISION-agent_id', 'FND-CMP-MISS-closed_date']` | `['FND-CMP-MISS-closed_date']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/clean_cyber_auth_logs.csv` | `['FND-UNQ-PK-COLLISION-user_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/clean_ecommerce_transactions.csv` | `['FND-UNQ-PK-COLLISION-customer_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-DST-BENFORD-unit_price']` | `['FND-DST-BENFORD-unit_price']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `csv/clean_healthcare_records.csv` | `['FND-UNQ-PK-COLLISION-attending_physician_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/clean_hr.csv` | `['FND-UNQ-PK-COLLISION-manager_id', 'FND-UNQ-PK-NULL-manager_id', 'FND-CMP-MISS-termination_date']` | `['FND-CMP-MISS-termination_date']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/clean_iot_sensor.csv` | `['FND-UNQ-PK-COLLISION-device_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/clean_saas_events.csv` | `['FND-UNQ-PK-COLLISION-user_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/crm_tickets_true_positive.csv` | `['FND-UNQ-PK-COLLISION-customer_id', 'FND-UNQ-PK-COLLISION-agent_id', 'FND-CMP-MISS-closed_date']` | `['FND-CNS-TEMP-opened_date-closed_date', 'FND-CMP-MISS-closed_date']` | `temporal_inversion` | `FP_AND_FN` → **`PASS`** |
| `csv/cyber_auth_logs_true_positive.csv` | `['FND-UNQ-PK-COLLISION-user_id']` | `[]` | `impossible_travel_pattern` | `UNSUPPORTED_EXPECTATION` → **`UNSUPPORTED_EXPECTATION`** |
| `csv/ecommerce_transactions_true_positive.csv` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-PK-COLLISION-customer_id', 'FND-UNQ-PK-COLLISION-product_code', 'FND-CNS-TEMP-order_date-delivery_date', 'FND-DST-OUTLIER-quantity', 'FND-UNQ-EXACT-DUPS', 'FND-DST-OUTLIER-unit_price', 'FND-DST-BENFORD-unit_price', 'FND-DST-OUTLIER-total_amount']` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-CNS-TEMP-order_date-delivery_date', 'FND-CNS-TEMP-ship_date-delivery_date', 'FND-DST-OUTLIER-quantity', 'FND-UNQ-EXACT-DUPS', 'FND-DST-OUTLIER-unit_price', 'FND-DST-BENFORD-unit_price', 'FND-DST-OUTLIER-total_amount']` | `temporal_inversion, derived_value_mismatch, extreme_outlier, malformed_numeric_string, exact_duplicate_rows` | `FP_AND_FN` → **`FALSE_POSITIVE`** |
| `csv/false_positive_code_columns.csv` | `['FND-UNQ-PK-COLLISION-product_code']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/food_rescue_true_positive.csv` | `[]` | `['FND-CNS-TEMP-pickup_date-delivered_date']` | `temporal_inversion` | `FALSE_NEGATIVE` → **`PASS`** |
| `csv/healthcare_records_true_positive.csv` | `['FND-UNQ-PK-COLLISION-attending_physician_id', 'FND-CNS-NEG-age_at_admission']` | `['FND-CNS-TEMP-admit_date-discharge_date', 'FND-CNS-NEG-age_at_admission']` | `temporal_inversion, impossible_negative_value` | `FP_AND_FN` → **`PASS`** |
| `csv/hr_true_positive.csv` | `['FND-UNQ-PK-COLLISION-employee_id', 'FND-UNQ-PK-COLLISION-manager_id', 'FND-CNS-TEMP-hire_date-termination_date', 'FND-UNQ-PK-NULL-manager_id', 'FND-CNS-NEG-age', 'FND-CMP-SENT-TXT-email', 'FND-UNQ-EXACT-DUPS', 'FND-VAL-CAT-CASING-employment_status', 'FND-CMP-MISS-termination_date']` | `['FND-UNQ-PK-COLLISION-employee_id', 'FND-CNS-TEMP-hire_date-termination_date', 'FND-CNS-NEG-age', 'FND-CMP-SENT-TXT-email', 'FND-UNQ-EXACT-DUPS', 'FND-VAL-CAT-CASING-employment_status', 'FND-CMP-MISS-termination_date']` | `temporal_inversion, impossible_negative_value, exact_duplicate_rows, duplicate_id_conflicting_fields, missing_values, categorical_corruption` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/identifiers_composite_key.csv` | `['FND-UNQ-PK-COLLISION-product_code', 'FND-UNQ-COMPOSITE-region_code-product_code']` | `['FND-UNQ-COMPOSITE-region_code-product_code']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/iot_sensor_true_positive.csv` | `['FND-UNQ-PK-COLLISION-device_id', 'FND-DST-OUTLIER-temperature_c']` | `['FND-DST-OUTLIER-temperature_c']` | `temporal_out_of_sequence, extreme_outlier` | `FALSE_POSITIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `csv/saas_events_true_positive.csv` | `['FND-UNQ-PK-COLLISION-user_id', 'FND-DST-OUTLIER-duration_ms']` | `['FND-DST-OUTLIER-duration_ms']` | `extreme_outlier` | `FALSE_POSITIVE` → **`PASS`** |
| `csv/student_records_true_positive.csv` | `[]` | `['FND-CNS-TEMP-enrollment_date-graduation_date']` | `temporal_inversion, invalid_percentage` | `FALSE_NEGATIVE` → **`UNSUPPORTED_EXPECTATION`** |
| `pdf/anomalous_healthcare_table.pdf` | `['FND-CNS-NEG-age', 'FND-CMP-SENT-NUM-age--1']` | `['FND-CNS-TEMP-admit_date-discharge_date', 'FND-CNS-NEG-age', 'FND-CMP-SENT-NUM-age--1']` | `temporal_inversion, impossible_negative_value` | `FP_AND_FN` → **`FALSE_POSITIVE`** |
| `pdf/clean_multipage_table.pdf` | `['FND-UNQ-PK-COLLISION-customer_id', 'FND-DST-BENFORD-amount']` | `['FND-DST-BENFORD-amount']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `pdf/clean_multipage_table_repeated_headers.pdf` | `['FND-UNQ-PK-COLLISION-customer_id', 'FND-DST-BENFORD-amount']` | `['FND-DST-BENFORD-amount']` | `clean (0 findings)` | `FALSE_POSITIVE` → **`FALSE_POSITIVE`** |
| `pdf/date_heavy_shipment_table.pdf` | `['FND-CNS-TEMP-order_date-ship_date', 'FND-CNS-TEMP-order_date-delivered_date']` | `['FND-CNS-TEMP-order_date-ship_date', 'FND-CNS-TEMP-order_date-delivered_date', 'FND-CNS-TEMP-ship_date-delivered_date']` | `clean (0 findings)` | `MANIFEST_ISSUE` → **`MANIFEST_ISSUE`** |
| `pdf/numeric_heavy_sensor_table.pdf` (rows: 149→150) | `['FND-UNQ-PK-COLLISION-device_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |
| `xls/transactions_with_anomalies_legacy.xls` | `['FND-UNQ-PK-COLLISION-transaction_id', 'FND-UNQ-COMPOSITE-transaction_id-txn_date']` | `['FND-UNQ-PK-COLLISION-transaction_id', 'FND-VAL-TYPEDRIFT-amount', 'FND-CMP-SENT-TXT-amount', 'FND-UNQ-COMPOSITE-transaction_id-txn_date']` | `malformed_numeric_string, exact_duplicate_rows` | `FALSE_NEGATIVE` → **`MANIFEST_ISSUE`** |
| `xlsx/clean_iot_sensor.xlsx` | `['FND-UNQ-PK-COLLISION-device_id']` | `[]` | `clean (0 findings)` | `FALSE_POSITIVE` → **`PASS`** |

---

## 10. False-Positive Changes
- **Eliminated `43` false-positive finding instances across `38` datasets:**
  - **`FND-UNQ-PK-COLLISION-product_code` (`22` instances removed → `0` remaining):** Removed from `csv/false_positive_code_columns.csv`, `csv/identifiers_composite_key.csv`, `csv/clean_ecommerce_transactions.csv`, `csv/ecommerce_transactions_true_positive.csv`, and all `18` `cross_format/family_{a,b,c}.*` files.
  - **`FND-UNQ-PK-COLLISION-customer_id` (`6` instances removed → `0` remaining):** Removed from `csv/clean_crm_tickets.csv`, `csv/crm_tickets_true_positive.csv`, `csv/clean_ecommerce_transactions.csv`, `csv/ecommerce_transactions_true_positive.csv`, `pdf/clean_multipage_table.pdf`, and `pdf/clean_multipage_table_repeated_headers.pdf` (while genuine `FND-UNQ-PK-COLLISION-customer_id` in `csv/identifiers_near_duplicates.csv` remains detected).
  - **`FND-UNQ-PK-COLLISION-agent_id` (`2` instances removed → `0` remaining):** Removed from `csv/clean_crm_tickets.csv` and `csv/crm_tickets_true_positive.csv`.
  - **`FND-UNQ-PK-COLLISION-user_id` (`4` instances removed → `0` remaining):** Removed from `csv/clean_cyber_auth_logs.csv`, `csv/cyber_auth_logs_true_positive.csv`, `csv/clean_saas_events.csv`, and `csv/saas_events_true_positive.csv`.
  - **`FND-UNQ-PK-COLLISION-attending_physician_id` (`2` instances removed → `0` remaining):** Removed from `csv/clean_healthcare_records.csv` and `csv/healthcare_records_true_positive.csv`.
  - **`FND-UNQ-PK-COLLISION-manager_id` & `FND-UNQ-PK-NULL-manager_id` (`4` instances removed → `0` remaining):** Removed from `csv/clean_hr.csv` and `csv/hr_true_positive.csv`.
  - **`FND-UNQ-PK-COLLISION-device_id` (`4` instances removed → `0` remaining):** Removed from `csv/clean_iot_sensor.csv`, `xlsx/clean_iot_sensor.xlsx`, `csv/iot_sensor_true_positive.csv`, and `pdf/numeric_heavy_sensor_table.pdf`.
  - **`FND-UNQ-PK-COLLISION-account_id` (`1` instance removed → `0` remaining):** Removed redundant secondary collision from `csv/banking_transactions_true_positive.csv`.

---

## 11. False-Negative Changes
- **All `8` Phase 6 false negatives are now resolved (`8 → 0`):**
  1. `csv/banking_transactions_true_positive.csv`: `FND-CNS-TEMP-transaction_datetime-settlement_date` (`3` rows) → **`TRUE_POSITIVE`**
  2. `csv/crm_tickets_true_positive.csv`: `FND-CNS-TEMP-opened_date-closed_date` (`3` rows) → **`TRUE_POSITIVE`**
  3. `csv/ecommerce_transactions_true_positive.csv`: `FND-CNS-TEMP-ship_date-delivery_date` (`4` rows) → **`TRUE_POSITIVE`**
  4. `csv/food_rescue_true_positive.csv`: `FND-CNS-TEMP-pickup_date-delivered_date` (`3` rows) → **`TRUE_POSITIVE`**
  5. `csv/healthcare_records_true_positive.csv`: `FND-CNS-TEMP-admit_date-discharge_date` (`3` rows) → **`TRUE_POSITIVE`**
  6. `csv/student_records_true_positive.csv`: `FND-CNS-TEMP-enrollment_date-graduation_date` (`3` rows) → **`TRUE_POSITIVE`**
  7. `pdf/anomalous_healthcare_table.pdf`: `FND-CNS-TEMP-admit_date-discharge_date` (`4` rows) → **`TRUE_POSITIVE`**
  8. `xls/transactions_with_anomalies_legacy.xls`: `FND-VAL-TYPEDRIFT-amount` & `FND-CMP-SENT-TXT-amount` (`4` rows) → **`TRUE_POSITIVE`**

---

## 12. Ingestion Changes
- Accepted / Rejected counts remain `104` accepted / `15` rejected (`0` crashes, `0` HTTP 500s).
- All wrong-extension (`5`), corrupted/zero-byte (`5`), prose TXT (`1`), scanned PDF (`1`), and over-limit 1001-column CSV (`1`) files remain cleanly rejected with sanitized error messages.

## 13. PDF Row-Count Verification
- **`pdf/numeric_heavy_sensor_table.pdf`:**
  - **Before (Phase 6):** `149` rows (final page single continuation row `RD00150` dropped), `FND-UNQ-PK-COLLISION-device_id` false positive, Trust Score `80.0`.
  - **After (Phase 7):** **`150` rows** (matches manifest `expected_rows = 150` exactly), `0` false positives, Trust Score **`100.0`** (`PASS`).
- All other 10 accepted PDF datasets (`clean_one_page_table.pdf`, `clean_multipage_table.pdf`, `clean_multipage_table_repeated_headers.pdf`, `date_heavy_shipment_table.pdf`, `anomalous_healthcare_table.pdf`, `missing_cells_support_table.pdf`, `mixed_data_types_table.pdf`, `family_a_clean.pdf`, `family_b_duplicates.pdf`, `family_c_temporal_anomaly.pdf`) retained their exact expected row counts (`28`, `220`, `220`, `120`, `100`, `90`, `90`, `150`, `162`, `150`) with zero duplicated header rows.

## 14. Excel Sentinel Verification
- **`xls/transactions_with_anomalies_legacy.xls`:**
  - **Before (Phase 6):** `'N/A'` strings in `amount` were silently coerced to `NaN` by `pd.read_excel()`, missing `malformed_numeric_string` on `amount`.
  - **After (Phase 7):** `'N/A'` strings preserved during Excel ingestion; both `FND-VAL-TYPEDRIFT-amount` (`4` rows) and `FND-CMP-SENT-TXT-amount` (`4` rows) are emitted (`TRUE_POSITIVE`).
- All other `.xlsx` and `.xls` workbooks in the corpus (including `xlsx/multisheet_workbook.xlsx`, `xlsx/unicode_headers_and_sheetname.xlsx`, `xlsx/large_text_payload_workbook.xlsx`, `xls/clean_employees_legacy.xls`, and `cross_format/family_*.{xlsx,xls}`) parsed identically with ordinary empty cells/rows handled cleanly.

---

## 15. 45 MB Stress Dataset Regression
| Check | Phase 6 Baseline | Phase 7 Result |
| :--- | :---: | :---: |
| File Size (Bytes) | `45,643,565` | `45,643,565` |
| Dimensions | `156,310` rows × `26` cols | `156,310` rows × `26` cols |
| Findings Count | `29` | `29` |
| Trust Score / Verdict / Grade | `0.0` / `COMPROMISED` / `F` | `0.0` / `COMPROMISED` / `F` |
| Strict JSON (`allow_nan=False`) | Passed (`61,736` B) | Passed (`61,736` B) |
| `FND-UNQ-PK-COLLISION-region_code` Absent | `True` | `True` |
| `FND-CNS-TEMP-hire_date-attendance_pct` Absent | `True` | `True` |
| `FND-CNS-TEMP-hire_date-termination_date` Present | `True` | `True` |

---

## 16. Performance Comparison
| Dataset | Size (MiB) | Rows | Cols | Phase 6 Total Time | Phase 7 Total Time |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `large/large_hr_dataset_1mb.csv` | 0.8450 | 11,189 | 9 | `306.48 ms` (`0.31s`) | `362.21 ms` (`0.36s`) |
| `large/large_hr_dataset_5mb.csv` | 4.2182 | 55,901 | 9 | `1386.29 ms` (`1.39s`) | `1425.64 ms` (`1.43s`) |
| `large/large_hr_dataset_10mb.csv` | 8.4314 | 111,802 | 9 | `2677.50 ms` (`2.68s`) | `2666.65 ms` (`2.67s`) |
| `csv/csv_wide_999_columns.csv` | 0.2739 | 40 | 999 | `2702.30 ms` (`2.70s`) | `2729.20 ms` (`2.73s`) |
| `integris_45mb_forensic_stress_dataset.csv` | 43.5291 | 156,310 | 26 | `9.23s` | `9.70s` |

---

## 17. Remaining Unsupported Expectations (`NOT_CURRENTLY_SUPPORTED` — 18 Total)
These 18 manifest expectations correspond to detector types that are not part of the current INTEGRIS engine architecture (unchanged in Phase 7):
- `cross_format/family_c_temporal_anomaly.csv` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `cross_format/family_c_temporal_anomaly.pdf` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `cross_format/family_c_temporal_anomaly.tsv` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `cross_format/family_c_temporal_anomaly.txt` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `cross_format/family_c_temporal_anomaly.xls` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `cross_format/family_c_temporal_anomaly.xlsx` — `implausible_future_date` (`order_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/categorical_distribution_shift.csv` — `distribution_drift` (`sales_region`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'distribution_drift' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/cyber_auth_logs_true_positive.csv` — `impossible_travel_pattern` (`['user_id', 'country_code', 'event_timestamp']`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'impossible_travel_pattern' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/date_future_and_ancient.csv` — `future_dated_record` (`record_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'future_dated_record' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/date_future_and_ancient.csv` — `implausibly_ancient_date` (`record_date`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'implausibly_ancient_date' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/ecommerce_transactions_true_positive.csv` — `derived_value_mismatch` (`total_amount`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'derived_value_mismatch' is not currently implemented as a dedicated detector in INTEGRIS (incidentally flagged via ['FND-UNQ-EXACT-DUPS', 'FND-DST-OUTLIER-total_amount']).
- `csv/energy_sustainability_true_positive.csv` — `invalid_percentage` (`renewable_pct`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/iot_sensor_true_positive.csv` — `temporal_out_of_sequence` (`timestamp`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'temporal_out_of_sequence' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/missing_values_scattered_and_clustered.csv` — `clustered_missingness` (`department`): `PARTIALLY_SUPPORTED` — Missingness ratio in ['department'] was below INTEGRIS's >=5.0% column missingness threshold (or contiguous-block cluster detection is not separately implemented).
- `csv/missing_values_scattered_and_clustered.csv` — `missing_dates` (`hire_date`): `PARTIALLY_SUPPORTED` — Missingness ratio in ['hire_date'] was below INTEGRIS's >=5.0% column missingness threshold (or contiguous-block cluster detection is not separately implemented).
- `csv/numeric_anomalies.csv` — `invalid_percentage` (`attendance_pct`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS (incidentally flagged via ['FND-DST-OUTLIER-attendance_pct']).
- `csv/student_records_true_positive.csv` — `invalid_percentage` (`attendance_pct`): `NOT_CURRENTLY_SUPPORTED` — Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS.
- `csv/temporal_forensics_multidomain.csv` — `temporal_inversion_summary` (`-`): `NOT_CURRENTLY_SUPPORTED` — Dataset stores generic columns (date_a, date_b) whose semantic roles are defined dynamically per row in (date_a_label, date_b_label); INTEGRIS matches temporal pairs by column name.

---

## 18. Remaining Corpus Defects (`CORPUS_DEFECT` — Not Engine Defects)
1. **Manifest Stem Collisions (`generators/generate_domains.py`):** 4 clean domain format variants (`tsv/clean_food_rescue.tsv`, `tsv/clean_student_records.tsv`, `xlsx/clean_iot_sensor.xlsx`, `xlsx/clean_supply_chain.xlsx`) exist on disk (`100.0` Trust Score, `PASS`) but were overwritten in `master_manifest.json` due to stem collision.
2. **`validate_corpus.py` Extension Filter Bug:** `if "." not in fname: continue` skips 75 of 115 manifest entries.
3. **`pdf/date_heavy_shipment_table.pdf` Unordered Random Dates (`generators/generate_pdf_matrix.py`):** Independently generated random dates per row create genuine `order_date -> ship_date`, `order_date -> delivered_date`, and `ship_date -> delivered_date` chronological inversions in a file labeled clean.
4. **`xls/transactions_with_anomalies_legacy.xls` Conflicting Duplicate Generator (`generators/generate_excel_matrix.py`):** Re-sampling random dates and currencies while duplicating `transaction_id` creates PK collisions (`FND-UNQ-PK-COLLISION-transaction_id`) rather than identical duplicate rows.
5. **`adversarial/empty/one_column.csv` Single-Column 4-Category Repeat:** 20 rows of 4 categories in a 1-column file necessarily contain 16 exact duplicate rows (`FND-UNQ-EXACT-DUPS`).

---

## 19. Security & Safety Verification
- Zero external network calls, paid dependencies, or cloud services introduced.
- Render, Vercel, and Google Cloud configurations completely untouched.
- All 15 rejected files return clean HTTP 400 / 413 responses with zero stack-trace or internal path disclosures.
- Strict JSON serialization (`allow_nan=False`) passed across all 104 accepted corpus datasets and the 45 MB stress dataset.

## 20. Final Git Status
- **Branch:** `main` (at `0587cf6`, in sync with `origin/main`, no commits or pushes performed in Phase 7).
- **Modified Tracked Files (8):**
  - `M backend/app/engine/consistency.py`
  - `M backend/app/engine/uniqueness.py`
  - `M backend/app/ingestion/excel_parser.py`
  - `M backend/app/ingestion/pdf_parser.py`
  - `M backend/tests/test_consistency.py`
  - `M backend/tests/test_ingestion_formats.py`
  - `M backend/tests/test_profiler.py`
  - `M backend/tests/test_uniqueness.py`
- **Untracked Files:**
  - `?? INTEGRIS_FORENSIC_VALIDATION_REPORT.md`
  - `?? INTEGRIS_PHASE7_FIX_REPORT.md`
  - `?? "Integris test files.zip"`
  - `?? backend/tests/validate_claude_corpus.py`
  - `?? integris_validation_results.json`
