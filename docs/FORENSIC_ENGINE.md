# INTEGRIS — Forensic Engine Specification

This document explains the analytical behavior implemented in `backend/app/ingestion/` and `backend/app/engine/`. Every check is deterministic and rule- or statistics-driven; no external APIs or language models are used.

---

## 1. Ingestion (`backend/app/ingestion/`)

Before analysis begins, `ingest_dataset(filename, content)` validates and converts raw uploaded bytes into an in-memory `pandas.DataFrame` wrapped in an `IngestionResult`.

- **INPUT:** Sanitized basename (`file.filename`) and raw `bytes` buffer (`<= 50 MB` for `.csv`/`.tsv`/`.txt`, `<= 25 MB` for `.xlsx`/`.xls`, `<= 15 MB` for `.pdf`).
- **ANALYSIS:**
  1. **Magic-Byte Signature Check (`detector.py`):** Verifies that `.pdf` begins with `%PDF`, `.xlsx` begins with `PK\x03\x04` (ZIP container), `.xls` begins with `\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1` (OLE2 container), and text formats (`.csv`, `.tsv`, `.txt`) do not match binary signatures or contain null bytes (`\x00`).
  2. **Format Parsing:**
     - **CSV / TSV / TXT (`csv_parser.py`, `text_parser.py`):** Decodes via fallback chain (`utf-8-sig` → `utf-8` → `cp1252` → `latin-1`), sniffs delimiters (`,`, `\t`, `;`, `|`), rejects non-tabular prose paragraphs, and reads with `keep_default_na=False, na_values=[""]` so literal strings like `"N/A"` remain available for sentinel/type-drift inspection.
     - **Excel (`excel_parser.py`):** Checks `.xlsx` ZIP headers to ensure uncompressed payload `<= 250 MB`, selects the first non-empty worksheet via `openpyxl` (`.xlsx`) or `xlrd` (`.xls`), drops completely blank rows/columns, and preserves literal `"N/A"` text tokens (`keep_default_na=False, na_values=[""]`).
     - **PDF (`pdf_parser.py`):** Extracts embedded vector tables via `pdfplumber`, selects the primary multi-row table, coalesces multi-page continuations with matching column counts while skipping repeated page headers, retains valid 1-row final continuation pages, and raises a controlled `ValueError` (`HTTP 400`) on scanned/image-only or non-tabular PDFs.
- **FINDING / OUTPUT:** Produces `IngestionResult(df, file_type, sheet_name, available_sheets, table_index, page_count)` or raises a `ValueError` mapped to `HTTP 400`.
- **EFFECT ON INVESTIGATION:** Guarantees that all downstream analyzers receive a clean tabular `DataFrame` with preserved textual sentinel tokens across all six file formats.

---

## 2. Dataset Profiling (`backend/app/engine/profiler.py`)

`profile_dataset(df)` characterizes the dataset's structure and each column's semantic role prior to running anomaly detectors.

- **INPUT:** In-memory `pandas.DataFrame`.
- **ANALYSIS:**
  1. **Header Deduplication (`_deduplicate_columns`):** Normalizes empty column names to `col_1`, `col_2`, and deduplicates repeated headers (`id`, `id_1`, `id_2`) without mutating caller input.
  2. **Dataset Summary:** Computes `total_cells`, `missing_cells`, `missing_cell_ratio`, `duplicate_rows`, `duplicate_row_ratio`, and `memory_usage_bytes`.
  3. **Semantic Type Inference (`_infer_semantic_type`):** Classifies each column into one of eight `SemanticType` values:
     - `BOOLEAN`: `<= 2` distinct values within `{"true", "false", "0", "1", "yes", "no", "t", "f"}`.
     - `DATETIME`: Native `datetime64` dtype or `> 60%` of sampled strings matching date patterns.
     - `IDENTIFIER`: Non-float columns with `null_ratio <= 0.05` that either carry identifier name tokens (`unique_ratio > 0.90`, `avg_len <= 60`) or have `100%` uniqueness (`total_rows >= 5`, not prose-like).
     - `NUMERIC_CONTINUOUS` / `NUMERIC_DISCRETE`: Numeric columns classified by float dtype and distinct value count (`> 20` unique → continuous; `<= 10` unique and `< 5%` unique ratio → categorical; otherwise discrete).
     - `CATEGORICAL` / `FREE_TEXT`: String columns distinguished by average length (`> 60` chars or multi-word high-cardinality prose → `FREE_TEXT`; `unique_ratio < 0.20` or `<= 50` unique → `CATEGORICAL`).
  4. **Finite Summary Statistics:** Computes `min_value`, `max_value`, `mean`, `median`, and `std_dev` over finite numeric values (`np.isfinite`), plus `is_candidate_identifier` and `is_constant_or_near_constant`.
- **OUTPUT:** `(DatasetSummary, list[ColumnProfile])`.
- **EFFECT ON INVESTIGATION:** Supplies `ColumnProfile` metadata to the UI's Column Dossiers and informs downstream analyzers which columns are identifiers, dates, or continuous numbers.

---

## 3. Uniqueness Analysis (`backend/app/engine/uniqueness.py`)

Evaluates record-level duplication, entity primary-key integrity, and composite natural keys.

- **INPUT:** `df` and `column_profiles`.
- **ANALYSIS:**
  1. **Exact Duplicate Rows:** Checks `df.duplicated(keep="first")`.
  2. **Candidate Primary-Key Identification & Foreign-Key Disambiguation:**
     - Tokenizes column names across `snake_case`, `kebab-case`, `camelCase`, and `PascalCase`.
     - Matches strong identifier tokens (`id`, `uuid`, `guid`, `pk`, `identifier`, `ident`), unmodified `key`, or entity-qualified `code`/`number` (`customer_code`, `employee_number`), while excluding catalog qualifiers (`product_code`, `item_code`, `sku_code`).
     - Filters out repeating foreign-key columns before flagging collisions:
       - Columns containing hierarchy/role tokens (`manager`, `supervisor`, `agent`, `physician`, `attending`, `parent`, etc.) when another identifier column has higher uniqueness.
       - Columns with `unique_ratio < 0.80` (when `total_rows >= 5`, `collision_count > 1`, or another named identifier has higher uniqueness).
       - Secondary identifier columns with `unique_ratio < 0.95` when the table already has an intact 100%-unique primary key.
       - Secondary identifier columns whose duplicate row indices are a subset of an earlier primary-key collision's row indices (preventing double-counting on duplicated transaction rows).
  3. **Composite Key Discovery:** When no single column is 100% unique, checks pairs of non-null moderate-cardinality columns to see if `(col_a, col_b)` uniquely identifies all rows.
- **FINDING:**
  - `FND-UNQ-EXACT-DUPS` (`CRITICAL` if `>= 10%`, `HIGH` if `>= 2%`, else `MEDIUM`)
  - `FND-UNQ-PK-COLLISION-<col>` (`CRITICAL`)
  - `FND-UNQ-PK-NULL-<col>` (`CRITICAL` if `> 5%`, else `HIGH`)
  - `FND-UNQ-COMPOSITE-<col_a>-<col_b>` (`INFO`)
- **EVIDENCE:** `exact_duplicate_rows` (with preview dicts of duplicated rows), `identifier_collision_count` (with colliding key values and row indices), `identifier_null_count`, or `composite_cardinality`.
- **EFFECT ON INVESTIGATION:** Surfaces entity-integrity violations that would cause row multiplication in SQL joins while avoiding false alarms on legitimate many-to-one foreign keys.

---

## 4. Temporal Consistency (`backend/app/engine/consistency.py`)

Detects chronological inversions across paired lifecycle date/timestamp columns.

- **INPUT:** `df` and `column_profiles`.
- **ANALYSIS:**
  1. Identifies date-like columns via `SemanticType.DATETIME` or standalone temporal tokens in the column name (`TEMPORAL_COLUMN_TOKENS`), verifying that non-null sample values parse as dates (`pd.to_datetime(..., format="mixed")`) and excluding numeric/identifier/boolean columns (such as `attendance_pct`).
  2. Pairs start and end columns across nine lifecycle rules (`TEMPORAL_PAIRS`):
     - `hire / join / start / onboard` → `exit / termination / end / resign / offboard`
     - `birth / dob` → `hire / join / start / enroll / graduate`
     - `order / booking / created` → `ship / deliver / dispatch / fulfill`
     - `ship / dispatch` → `deliver / delivery`
     - `admit / admission` → `discharge`
     - `enroll / enrollment` → `graduate / graduation`
     - `open / opened` → `close / closed / resolve / resolution`
     - `pickup / collection` → `deliver / delivery / dropoff`
     - `transaction / txn / trade` → `settle / settlement / clearing`
  3. Normalizes timezone-aware/mixed series to UTC when needed, and floors sub-day start timestamps (`s_series.dt.floor("D")`) when comparing against calendar-date-only end columns (so a transaction at `2024-10-22 21:19:10` settling on `2024-10-22` is not falsely flagged).
  4. Flags rows where `end_date < start_date`.
- **FINDING:** `FND-CNS-TEMP-<start_col>-<end_col>` (`CRITICAL`).
- **EVIDENCE:** `chronological_inversion_count`, up to 10 `sample_row_indices`, and paired `{start_col: val, end_col: val}` sample dicts.
- **EFFECT ON INVESTIGATION:** Immediately highlights impossible event timelines (`CRITICAL`, `-20.0` base deduction) with exact row coordinates.

---

## 5. Type Drift, Date Format & Categorical Validity (`backend/app/engine/validity.py`)

Inspects column values for mixed data types, competing date representations, and inconsistent category casing.

- **INPUT:** `df` and `column_profiles`.
- **ANALYSIS:**
  1. **Numeric Type Drift:** On string/object columns (`>= 3` non-null values), coerces values with `pd.to_numeric(..., errors="coerce")`. If `60.0% <= numeric_ratio < 100.0%`, flags the non-numeric strings as type-drift contaminants.
  2. **Date Format Inconsistency:** On date-named or `DATETIME` string columns, matches values against five calendar-validated patterns (`ISO_8601`, `SLASH_YMD`, `SLASH_DMY`, `SLASH_MDY`, `DOT_DMY`). Flags columns where `>= 2%` of non-null entries deviate from the dominant date format.
  3. **Categorical Casing Drift:** On string columns with `2–50` unique values, groups trimmed strings by `.lower()` and flags categories that appear in multiple casing variants (e.g., `["Engineering", "engineering"]`).
- **FINDING:**
  - `FND-VAL-TYPEDRIFT-<col>` (`HIGH`)
  - `FND-VAL-DATE-FORMAT-<col>` (`MEDIUM`)
  - `FND-VAL-CAT-CASING-<col>` (`MEDIUM`)
- **EVIDENCE:** `non_numeric_contaminants` (offending strings and row indices), `format_breakdown` (pattern count map and deviant samples), or `conflicting_category_variants`.
- **EFFECT ON INVESTIGATION:** Explains why numeric columns failed to parse as numbers or why categorical groupings and date joins produce fragmented results.

---

## 6. Completeness & Sentinel Detection (`backend/app/engine/completeness.py`)

Detects explicit missingness, disguised text/numeric placeholder values, and coupled cross-column dropout.

- **INPUT:** `df` and `column_profiles`.
- **ANALYSIS:**
  1. **Standard Missingness:** Combines `series.isna()` and whitespace-only strings. If `missing_ratio >= 0.05`:
     - Assigns `CRITICAL` if `is_candidate_identifier` (`> 5%`), `INFO`/`LOW` if the column is an optional lifecycle milestone (`exit_date`, `termination_date`, `cancel_date`, etc.), or `HIGH` (`>= 50%`) / `MEDIUM` (`>= 20%`) / `LOW` (`>= 5%`) otherwise.
  2. **Disguised Text Sentinels:** Checks lowercase trimmed strings against `TEXT_SENTINELS` (`"n/a"`, `"na"`, `"null"`, `"none"`, `"?"`, `"unknown"`, `"-"`, `"--"`, `"missing"`, `"nan"`, `"#n/a"`, `"nil"`, `"undefined"`, `"blank"`, `"none/specified"`).
  3. **Disguised Numeric Sentinels:** In numeric columns (`>= 10` finite values), checks `NUMERIC_SENTINELS` (`-999`, `-9999`, `9999`, `99999`, `999999`, `-1`). Emits a finding only if the sentinel is contextually anomalous compared to the remaining values (`other_nums`): either `sentinel < 0` while `> 95%` of `other_nums >= 0`, or outside `[Q25 - 3*IQR, Q75 + 3*IQR]`.
  4. **Cross-Column Co-Missingness:** Computes pairwise Jaccard similarity of missing row index sets across columns with `>= 5%` missingness (`>= 3` rows), flagging pairs with `Jaccard >= 0.90` and `>= 5` shared missing rows.
- **FINDING:**
  - `FND-CMP-MISS-<col>` (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFO`)
  - `FND-CMP-SENT-TXT-<col>` (`HIGH` if `>= 10%`, else `MEDIUM`)
  - `FND-CMP-SENT-NUM-<col>-<sentinel>` (`HIGH` if `> 5%`, else `MEDIUM`)
  - `FND-CMP-COMISS-<col_a>-<col_b>` (`MEDIUM`)
- **EVIDENCE:** `missing_ratio`, `disguised_text_token_count`, `numeric_sentinel_outlier`, or `missingness_jaccard_similarity`.
- **EFFECT ON INVESTIGATION:** Uncovers hidden missing data that standard `.isna()` checks miss and distinguishes benign lifecycle sparsity from genuine data loss.

---

## 7. Cross-Column Domain Consistency (`backend/app/engine/consistency.py`)

In addition to temporal pairs (Section 4), `analyze_consistency` validates domain sign invariants and min/max bounds.

- **INPUT:** `df` and `column_profiles`.
- **ANALYSIS:**
  1. **Non-Negative Domain Violations:** Checks columns containing standalone tokens in `NON_NEGATIVE_TOKENS` (`count`, `quantity`, `qty`, `items`, `age`, `days`, `hours`, `units`, `visits`, `clicks`) for values `< 0`.
  2. **Contradictory Min/Max Bounds:** Pairs columns sharing a base name with `min` and `max` tokens (e.g., `min_salary` and `max_salary`) and flags rows where `min_col > max_col`.
- **FINDING:**
  - `FND-CNS-NEG-<col>` (`HIGH`)
  - `FND-CNS-BOUND-<min_col>-<max_col>` (`HIGH`)
- **EVIDENCE:** `negative_count_violation` or `min_gt_max_violations` with offending row indices and sample values.
- **EFFECT ON INVESTIGATION:** Catches sign corruption and inverted interval bounds before aggregation or modeling.

---

## 8. Distribution, Benford's Law & Target Leakage (`distribution.py`, `leakage.py`)

### 8.1 Distribution & Benford Screening (`backend/app/engine/distribution.py`)

- **INPUT:** Numeric columns in `df` with `>= 8` finite values and `> 2` unique values.
- **ANALYSIS:**
  1. **Extreme Outliers:** Computes Tukey $3\times\text{IQR}$ bounds (`[Q25 - 3*IQR, Q75 + 3*IQR]`, or `median ± 5*MAD` when `IQR == 0`). Flags isolated extreme outliers when `0 < extreme_count / n_finite <= 0.10` (or `extreme_count <= 2`).
  2. **Distributional Skewness:** Computes Fisher-Pearson skewness (`scipy.stats.skew`) and flags columns with `|skew| > 4.0` when `extreme_count == 0`.
  3. **Benford's Law First-Digit Screening:** Evaluates strictly positive (`> 0`), non-identifier columns whose name matches financial keywords (`salary`, `revenue`, `amount`, `cost`, `price`, `sales`, `transaction`, `payment`, `expense`, `balance`), with `n_finite >= 40` and `max / min >= 50`. Computes Mean Absolute Deviation (`MAD`) between observed leading-digit frequencies (`1–9`) and $\log_{10}(1 + 1/d)$, flagging `MAD > 0.025`.
- **FINDING:** `FND-DST-OUTLIER-<col>` (`HIGH` / `MEDIUM`), `FND-DST-SKEW-<col>` (`LOW`), `FND-DST-BENFORD-<col>` (`MEDIUM`).
- **EVIDENCE:** `tukey_3x_iqr_violation`, `fisher_pearson_skewness`, or `benford_mad_divergence` (with per-digit observed vs expected frequencies).
- **EFFECT ON INVESTIGATION:** Surfaces extreme leverage points and synthetic/constrained numerical distributions as investigative leads.

### 8.2 Target Leakage Detection (`backend/app/engine/leakage.py`)

- **INPUT:** `df`, `column_profiles`, and optional `target_column`.
- **ANALYSIS:**
  1. **Target Proxy (`FND-LKG-PROXY-<col>`, `CRITICAL`):** Flags features whose normalized string values match `target_column` in `>= 95%` of records (`n >= 10`).
  2. **Extreme Numeric Correlation (`FND-LKG-CORR-<col>`, `CRITICAL` if `>= 0.98` else `HIGH`):** Flags non-identifier numeric features with `max(|Pearson r|, |Spearman r|) >= 0.95` (`n >= 10`).
  3. **Categorical Association (`FND-LKG-CRAMER-<col>`, `HIGH`):** Flags non-identifier categorical features with `Cramér's V >= 0.95` against a categorical target (`n >= 15`).
- **EVIDENCE:** `target_identity_ratio`, `maximum_correlation_coefficient`, or `cramers_v_association`.
- **EFFECT ON INVESTIGATION:** Prevents post-outcome features or target duplicates from leaking into supervised ML training sets.

---

## 9. Scoring, Grade & Executive Verdict (`backend/app/engine/scorer.py`)

- **INPUT:** Deduplicated, severity-sorted `list[Finding]`.
- **ANALYSIS:**
  - Base deductions: `CRITICAL = 20.0`, `HIGH = 12.0`, `MEDIUM = 6.0`, `LOW = 2.0`, `INFO = 0.0`.
  - Non-critical findings with `affected_row_ratio > 0` scale by `0.60 + 0.40 * min(1.0, affected_row_ratio * 2.0)`.
  - Per-column penalty cap: `35.0` points maximum across all findings affecting a column.
  - Score formula: `overall_score = round(max(0.0, min(100.0, 100.0 - total_deductions)), 1)`.
- **VERDICT & GRADE MAPPING:**
  - `97.0–100.0` → Grade `A+`, Verdict `RELIABLE`
  - `90.0–96.9` → Grade `A`, Verdict `RELIABLE`
  - `75.0–89.9` → Grade `B`, Verdict `RELIABLE`
  - `50.0–74.9` → Grade `C`, Verdict `CAUTION`
  - `30.0–49.9` → Grade `D`, Verdict `CAUTION`
  - `0.0–29.9` → Grade `F`, Verdict `COMPROMISED`
- **EFFECT ON INVESTIGATION:** Provides an auditable `PenaltyItem` ledger explaining every point deducted from `100.0`.
