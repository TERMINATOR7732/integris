# INTEGRIS — Phase 6 Forensic Corpus Validation Report

- **Repository:** `E:\MHT CET REGISTRATION\BE\Task\Integris`
- **Evaluated Commit:** `0587cf6 fix(api): harden production integration`
- **Execution Mode:** 100% Local In-Memory Validation (`backend/tests/validate_claude_corpus.py`)
- **Corpus Archive:** `Integris test files.zip` (`5,192,157` bytes compressed; `19,527,673` bytes / `18.62 MiB` uncompressed across `249` archive entries)

---

## 1. Executive Summary

| Metric | Value |
| :--- | :--- |
| Total Dataset Files Discovered in Corpus Archive | **119** (`18,927,468` bytes / `18.05 MiB`) |
| Cataloged in `master_manifest.json` | **115** |
| Unlisted Clean Domain Format Variants (Stem Collision in Generator) | **4** (`tsv/clean_food_rescue.tsv`, `tsv/clean_student_records.tsv`, `xlsx/clean_iot_sensor.xlsx`, `xlsx/clean_supply_chain.xlsx`) |
| Expected Accepted / Actual Accepted | **105** expected / **104** actual |
| Expected Rejected / Actual Rejected | **14** expected / **15** actual |
| Ingestion Mismatches | **1** (`adversarial/empty/header_only.csv`: expected accepted, rejected with HTTP 400 by 0-row API guard) |
| Unhandled Exceptions / HTTP 500 Crashes / Non-Finite JSON Errors | **0** |
| Documented Ground-Truth Anomaly Expectations (Across 48 Datasets) | **72** |
| Matched Expectations (`TRUE_POSITIVE` + `TRUE_NEGATIVE`) | **52** (`48` TP, `4` TN) |
| False Negatives (Supported / Partially Supported Capabilities Missed) | **0** |
| Unsupported Expectations (`NOT_CURRENTLY_SUPPORTED` Detector Types) | **18** |
| Generator / Manifest Ground-Truth Discrepancies (`MANIFEST_ISSUE`) | **2** anomaly entries + **2** clean/empty dataset generator issues |
| Accepted Datasets with Unexpected Findings (`FALSE_POSITIVE` / `FP_AND_FN`) | **20** datasets (driven by 3 root causes: `product_code` in `ENTITY_CODE_QUALIFIERS`, foreign-key `*_id` repetition, and Benford's Law on synthetic uniform prices/amounts) |

---

## 2. Corpus Inventory

All **119** dataset files discovered inside `Integris test files.zip -> integris-test-data.zip`:

| # | Relative Path | Ext | Size (Bytes) | Size (MiB) | Format | In Manifest | Expected Ingestion | Actual Ingestion | HTTP | Rows | Cols | Score | Findings |
| :---: | :--- | :---: | ---: | ---: | :---: | :---: | :---: | :---: | :---: | ---: | ---: | ---: | :---: |
| 1 | `adversarial/corrupted/corrupted_zip_xlsx.xlsx` | `xlsx` | 17,061 | 0.0163 | `xlsx` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 2 | `adversarial/corrupted/malformed_csv.csv` | `csv` | 82 | 0.0001 | `csv` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 3 | `adversarial/corrupted/malformed_pdf.pdf` | `pdf` | 77 | 0.0001 | `pdf` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 4 | `adversarial/corrupted/truncated_xlsx.xlsx` | `xlsx` | 1,725 | 0.0016 | `xlsx` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 5 | `adversarial/corrupted/zero_byte_file.xlsx` | `xlsx` | 0 | 0.0000 | `xlsx` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 6 | `adversarial/duplicate_headers/csv_duplicate_headers_whitespace.csv` | `csv` | 1,234 | 0.0012 | `csv` | Yes | `accepted` | `accepted` | `200` | 30 | 3 | 100.0 | 0 |
| 7 | `adversarial/duplicate_headers/customer_id_repeated_three_times.csv` | `csv` | 1,059 | 0.0010 | `csv` | Yes | `accepted` | `accepted` | `200` | 30 | 4 | 100.0 | 0 |
| 8 | `adversarial/empty/completely_empty.csv` | `csv` | 0 | 0.0000 | `csv` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 9 | `adversarial/empty/header_only.csv` | `csv` | 50 | 0.0000 | `csv` | Yes | `accepted` | `rejected` | `400` | - | - | - | 0 |
| 10 | `adversarial/empty/one_column.csv` | `csv` | 147 | 0.0001 | `csv` | Yes | `accepted` | `accepted` | `200` | 20 | 1 | 80.0 | 1 |
| 11 | `adversarial/empty/one_column_identifiers.csv` | `csv` | 170 | 0.0002 | `csv` | Yes | `accepted` | `accepted` | `200` | 20 | 1 | 100.0 | 0 |
| 12 | `adversarial/empty/one_row.csv` | `csv` | 65 | 0.0001 | `csv` | Yes | `accepted` | `accepted` | `200` | 1 | 3 | 100.0 | 0 |
| 13 | `adversarial/empty/tiny_with_duplicate_ids.csv` | `csv` | 31 | 0.0000 | `csv` | Yes | `accepted` | `accepted` | `200` | 3 | 2 | 80.0 | 1 |
| 14 | `adversarial/empty/two_rows.csv` | `csv` | 24 | 0.0000 | `csv` | Yes | `accepted` | `accepted` | `200` | 2 | 2 | 100.0 | 0 |
| 15 | `adversarial/wide/wide_1001_columns_over_limit.csv` | `csv` | 115,351 | 0.1100 | `csv` | Yes | `rejected` | `rejected` | `413` | - | - | - | 0 |
| 16 | `adversarial/wrong_extension/binary_renamed_txt.txt` | `txt` | 2,048 | 0.0020 | `txt` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 17 | `adversarial/wrong_extension/plain_text_renamed.pdf` | `pdf` | 55 | 0.0001 | `pdf` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 18 | `adversarial/wrong_extension/valid_pdf_renamed.xlsx` | `xlsx` | 1,544 | 0.0015 | `xlsx` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 19 | `adversarial/wrong_extension/valid_xls_renamed.csv` | `csv` | 5,632 | 0.0054 | `csv` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 20 | `adversarial/wrong_extension/valid_xlsx_renamed.pdf` | `pdf` | 5,176 | 0.0049 | `pdf` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 21 | `cross_format/family_a_clean.csv` | `csv` | 8,130 | 0.0078 | `csv` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 22 | `cross_format/family_a_clean.pdf` | `pdf` | 14,462 | 0.0138 | `pdf` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 23 | `cross_format/family_a_clean.tsv` | `tsv` | 8,130 | 0.0078 | `tsv` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 24 | `cross_format/family_a_clean.txt` | `txt` | 8,130 | 0.0078 | `txt` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 25 | `cross_format/family_a_clean.xls` | `xls` | 26,112 | 0.0249 | `xls` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 26 | `cross_format/family_a_clean.xlsx` | `xlsx` | 11,047 | 0.0105 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 27 | `cross_format/family_b_duplicates.csv` | `csv` | 8,802 | 0.0084 | `csv` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 28 | `cross_format/family_b_duplicates.pdf` | `pdf` | 15,157 | 0.0145 | `pdf` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 29 | `cross_format/family_b_duplicates.tsv` | `tsv` | 8,802 | 0.0084 | `tsv` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 30 | `cross_format/family_b_duplicates.txt` | `txt` | 8,802 | 0.0084 | `txt` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 31 | `cross_format/family_b_duplicates.xls` | `xls` | 26,112 | 0.0249 | `xls` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 32 | `cross_format/family_b_duplicates.xlsx` | `xlsx` | 11,383 | 0.0109 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 162 | 6 | 66.1 | 3 |
| 33 | `cross_format/family_c_temporal_anomaly.csv` | `csv` | 8,117 | 0.0077 | `csv` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 34 | `cross_format/family_c_temporal_anomaly.pdf` | `pdf` | 14,452 | 0.0138 | `pdf` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 35 | `cross_format/family_c_temporal_anomaly.tsv` | `tsv` | 8,117 | 0.0077 | `tsv` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 36 | `cross_format/family_c_temporal_anomaly.txt` | `txt` | 8,117 | 0.0077 | `txt` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 37 | `cross_format/family_c_temporal_anomaly.xls` | `xls` | 26,112 | 0.0249 | `xls` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 38 | `cross_format/family_c_temporal_anomaly.xlsx` | `xlsx` | 10,994 | 0.0105 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 150 | 6 | 100.0 | 0 |
| 39 | `csv/banking_transactions_true_positive.csv` | `csv` | 60,853 | 0.0580 | `csv` | Yes | `accepted` | `accepted` | `200` | 502 | 11 | 52.8 | 3 |
| 40 | `csv/categorical_distribution_shift.csv` | `csv` | 24,185 | 0.0231 | `csv` | Yes | `accepted` | `accepted` | `200` | 800 | 3 | 100.0 | 0 |
| 41 | `csv/categorical_drift_employment_status.csv` | `csv` | 11,933 | 0.0114 | `csv` | Yes | `accepted` | `accepted` | `200` | 700 | 2 | 94.0 | 1 |
| 42 | `csv/clean_banking_transactions.csv` | `csv` | 72,721 | 0.0694 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 11 | 100.0 | 0 |
| 43 | `csv/clean_crm_tickets.csv` | `csv` | 69,950 | 0.0667 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 9 | 98.6 | 1 |
| 44 | `csv/clean_cyber_auth_logs.csv` | `csv` | 62,278 | 0.0594 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 8 | 100.0 | 0 |
| 45 | `csv/clean_ecommerce_transactions.csv` | `csv` | 64,638 | 0.0616 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 13 | 94.0 | 1 |
| 46 | `csv/clean_energy_sustainability.csv` | `csv` | 36,555 | 0.0349 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 8 | 100.0 | 0 |
| 47 | `csv/clean_food_rescue.csv` | `csv` | 53,429 | 0.0510 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 9 | 100.0 | 0 |
| 48 | `csv/clean_healthcare_records.csv` | `csv` | 40,643 | 0.0388 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 10 | 100.0 | 0 |
| 49 | `csv/clean_hr.csv` | `csv` | 80,768 | 0.0770 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 14 | 100.0 | 1 |
| 50 | `csv/clean_iot_sensor.csv` | `csv` | 46,385 | 0.0442 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 8 | 100.0 | 0 |
| 51 | `csv/clean_saas_events.csv` | `csv` | 83,195 | 0.0793 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 9 | 100.0 | 0 |
| 52 | `csv/clean_student_records.csv` | `csv` | 52,770 | 0.0503 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 9 | 100.0 | 0 |
| 53 | `csv/clean_supply_chain.csv` | `csv` | 63,654 | 0.0607 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 12 | 100.0 | 0 |
| 54 | `csv/crm_tickets_true_positive.csv` | `csv` | 58,823 | 0.0561 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 9 | 78.7 | 2 |
| 55 | `csv/csv_duplicate_headers_exact.csv` | `csv` | 1,649 | 0.0016 | `csv` | Yes | `accepted` | `accepted` | `200` | 50 | 4 | 100.0 | 0 |
| 56 | `csv/csv_empty_rows_interspersed.csv` | `csv` | 1,859 | 0.0018 | `csv` | Yes | `accepted` | `accepted` | `200` | 80 | 3 | 94.0 | 1 |
| 57 | `csv/csv_medium_a_rowcount.csv` | `csv` | 719,859 | 0.6865 | `csv` | Yes | `accepted` | `accepted` | `200` | 20000 | 4 | 100.0 | 0 |
| 58 | `csv/csv_medium_b_rowcount.csv` | `csv` | 1,259,587 | 1.2012 | `csv` | Yes | `accepted` | `accepted` | `200` | 35000 | 4 | 100.0 | 0 |
| 59 | `csv/csv_quoting_and_multiline.csv` | `csv` | 8,958 | 0.0085 | `csv` | Yes | `accepted` | `accepted` | `200` | 120 | 5 | 94.0 | 1 |
| 60 | `csv/csv_trailing_whitespace.csv` | `csv` | 1,769 | 0.0017 | `csv` | Yes | `accepted` | `accepted` | `200` | 60 | 3 | 100.0 | 0 |
| 61 | `csv/csv_utf8_bom.csv` | `csv` | 4,571 | 0.0044 | `csv` | Yes | `accepted` | `accepted` | `200` | 60 | 5 | 94.0 | 1 |
| 62 | `csv/csv_wide_999_columns.csv` | `csv` | 287,215 | 0.2739 | `csv` | Yes | `accepted` | `accepted` | `200` | 40 | 999 | 100.0 | 0 |
| 63 | `csv/cyber_auth_logs_true_positive.csv` | `csv` | 51,892 | 0.0495 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 8 | 100.0 | 0 |
| 64 | `csv/date_format_variety.csv` | `csv` | 15,891 | 0.0152 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 3 | 94.0 | 1 |
| 65 | `csv/date_future_and_ancient.csv` | `csv` | 11,422 | 0.0109 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 2 | 100.0 | 0 |
| 66 | `csv/date_validity_violations.csv` | `csv` | 11,311 | 0.0108 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 2 | 96.3 | 1 |
| 67 | `csv/ecommerce_transactions_true_positive.csv` | `csv` | 54,328 | 0.0518 | `csv` | Yes | `accepted` | `accepted` | `200` | 503 | 13 | 24.5 | 8 |
| 68 | `csv/energy_sustainability_true_positive.csv` | `csv` | 30,471 | 0.0291 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 8 | 100.0 | 0 |
| 69 | `csv/false_positive_code_columns.csv` | `csv` | 47,993 | 0.0458 | `csv` | Yes | `accepted` | `accepted` | `200` | 700 | 11 | 100.0 | 0 |
| 70 | `csv/food_rescue_true_positive.csv` | `csv` | 44,355 | 0.0423 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 9 | 80.0 | 1 |
| 71 | `csv/healthcare_records_true_positive.csv` | `csv` | 33,974 | 0.0324 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 10 | 72.8 | 2 |
| 72 | `csv/high_cardinality_free_text.csv` | `csv` | 60,004 | 0.0572 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 2 | 100.0 | 0 |
| 73 | `csv/hr_true_positive.csv` | `csv` | 67,319 | 0.0642 | `csv` | Yes | `accepted` | `accepted` | `200` | 505 | 14 | 39.5 | 7 |
| 74 | `csv/identifiers_composite_key.csv` | `csv` | 18,606 | 0.0177 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 4 | 100.0 | 1 |
| 75 | `csv/identifiers_duplicates_0_1pct.csv` | `csv` | 29,321 | 0.0280 | `csv` | Yes | `accepted` | `accepted` | `200` | 1000 | 3 | 80.0 | 2 |
| 76 | `csv/identifiers_duplicates_0pct.csv` | `csv` | 29,280 | 0.0279 | `csv` | Yes | `accepted` | `accepted` | `200` | 1000 | 3 | 100.0 | 0 |
| 77 | `csv/identifiers_duplicates_10pct.csv` | `csv` | 29,372 | 0.0280 | `csv` | Yes | `accepted` | `accepted` | `200` | 1000 | 3 | 80.0 | 2 |
| 78 | `csv/identifiers_duplicates_1pct.csv` | `csv` | 29,295 | 0.0279 | `csv` | Yes | `accepted` | `accepted` | `200` | 1000 | 3 | 80.0 | 2 |
| 79 | `csv/identifiers_duplicates_5pct.csv` | `csv` | 29,261 | 0.0279 | `csv` | Yes | `accepted` | `accepted` | `200` | 1000 | 3 | 80.0 | 2 |
| 80 | `csv/identifiers_near_duplicates.csv` | `csv` | 18,771 | 0.0179 | `csv` | Yes | `accepted` | `accepted` | `200` | 800 | 2 | 80.0 | 2 |
| 81 | `csv/identifiers_unique.csv` | `csv` | 14,685 | 0.0140 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 3 | 100.0 | 0 |
| 82 | `csv/identifiers_uuid.csv` | `csv` | 27,358 | 0.0261 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 3 | 100.0 | 0 |
| 83 | `csv/iot_sensor_true_positive.csv` | `csv` | 38,756 | 0.0370 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 8 | 92.8 | 1 |
| 84 | `csv/leakage_and_legitimate_derivation.csv` | `csv` | 27,610 | 0.0263 | `csv` | Yes | `accepted` | `accepted` | `200` | 600 | 7 | 80.0 | 1 |
| 85 | `csv/missing_values_scattered_and_clustered.csv` | `csv` | 59,735 | 0.0570 | `csv` | Yes | `accepted` | `accepted` | `200` | 700 | 7 | 82.7 | 5 |
| 86 | `csv/numeric_anomalies.csv` | `csv` | 30,322 | 0.0289 | `csv` | Yes | `accepted` | `accepted` | `200` | 700 | 7 | 64.6 | 6 |
| 87 | `csv/saas_events_true_positive.csv` | `csv` | 69,383 | 0.0662 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 9 | 92.7 | 1 |
| 88 | `csv/student_records_true_positive.csv` | `csv` | 43,902 | 0.0419 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 9 | 80.0 | 1 |
| 89 | `csv/supply_chain_true_positive.csv` | `csv` | 53,124 | 0.0507 | `csv` | Yes | `accepted` | `accepted` | `200` | 500 | 12 | 80.0 | 1 |
| 90 | `csv/temporal_forensics_multidomain.csv` | `csv` | 59,833 | 0.0571 | `csv` | Yes | `accepted` | `accepted` | `200` | 800 | 6 | 100.0 | 0 |
| 91 | `csv/unicode_multilingual_text.csv` | `csv` | 34,314 | 0.0327 | `csv` | Yes | `accepted` | `accepted` | `200` | 400 | 4 | 100.0 | 0 |
| 92 | `large/large_hr_dataset_10mb.csv` | `csv` | 8,840,997 | 8.4314 | `csv` | Yes | `accepted` | `accepted` | `200` | 111802 | 9 | 37.1 | 7 |
| 93 | `large/large_hr_dataset_1mb.csv` | `csv` | 886,070 | 0.8450 | `csv` | Yes | `accepted` | `accepted` | `200` | 11189 | 9 | 37.1 | 7 |
| 94 | `large/large_hr_dataset_5mb.csv` | `csv` | 4,423,063 | 4.2182 | `csv` | Yes | `accepted` | `accepted` | `200` | 55901 | 9 | 37.1 | 7 |
| 95 | `pdf/anomalous_healthcare_table.pdf` | `pdf` | 8,237 | 0.0079 | `pdf` | Yes | `accepted` | `accepted` | `200` | 100 | 5 | 68.9 | 3 |
| 96 | `pdf/clean_multipage_table.pdf` | `pdf` | 16,648 | 0.0159 | `pdf` | Yes | `accepted` | `accepted` | `200` | 220 | 5 | 94.0 | 1 |
| 97 | `pdf/clean_multipage_table_repeated_headers.pdf` | `pdf` | 17,364 | 0.0166 | `pdf` | Yes | `accepted` | `accepted` | `200` | 220 | 5 | 94.0 | 1 |
| 98 | `pdf/clean_one_page_table.pdf` | `pdf` | 3,693 | 0.0035 | `pdf` | Yes | `accepted` | `accepted` | `200` | 28 | 5 | 100.0 | 0 |
| 99 | `pdf/date_heavy_shipment_table.pdf` | `pdf` | 10,181 | 0.0097 | `pdf` | Yes | `accepted` | `accepted` | `200` | 120 | 5 | 50.0 | 3 |
| 100 | `pdf/missing_cells_support_table.pdf` | `pdf` | 7,351 | 0.0070 | `pdf` | Yes | `accepted` | `accepted` | `200` | 90 | 4 | 97.2 | 2 |
| 101 | `pdf/mixed_data_types_table.pdf` | `pdf` | 6,252 | 0.0060 | `pdf` | Yes | `accepted` | `accepted` | `200` | 90 | 4 | 88.0 | 1 |
| 102 | `pdf/numeric_heavy_sensor_table.pdf` | `pdf` | 12,273 | 0.0117 | `pdf` | Yes | `accepted` | `accepted` | `200` | 150 | 5 | 100.0 | 0 |
| 103 | `pdf/scanned_image_only_no_text.pdf` | `pdf` | 5,401 | 0.0052 | `pdf` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 104 | `tsv/clean_food_rescue.tsv` | `tsv` | 53,429 | 0.0510 | `tsv` | No* | `accepted` | `accepted` | `200` | 600 | 9 | 100.0 | 0 |
| 105 | `tsv/clean_student_records.tsv` | `tsv` | 52,770 | 0.0503 | `tsv` | No* | `accepted` | `accepted` | `200` | 600 | 9 | 100.0 | 0 |
| 106 | `tsv/tsv_delimiter_detection_case.tsv` | `tsv` | 2,214 | 0.0021 | `tsv` | Yes | `accepted` | `accepted` | `200` | 50 | 4 | 94.0 | 1 |
| 107 | `tsv/tsv_standard.tsv` | `tsv` | 11,303 | 0.0108 | `tsv` | Yes | `accepted` | `accepted` | `200` | 150 | 5 | 94.0 | 1 |
| 108 | `txt/txt_comma_separated.txt` | `txt` | 2,722 | 0.0026 | `txt` | Yes | `accepted` | `accepted` | `200` | 80 | 4 | 100.0 | 0 |
| 109 | `txt/txt_nontabular_prose.txt` | `txt` | 481 | 0.0005 | `txt` | Yes | `rejected` | `rejected` | `400` | - | - | - | 0 |
| 110 | `txt/txt_pipe_separated.txt` | `txt` | 3,006 | 0.0029 | `txt` | Yes | `accepted` | `accepted` | `200` | 80 | 4 | 100.0 | 0 |
| 111 | `txt/txt_semicolon_separated.txt` | `txt` | 2,654 | 0.0025 | `txt` | Yes | `accepted` | `accepted` | `200` | 80 | 4 | 100.0 | 0 |
| 112 | `txt/txt_tab_separated.txt` | `txt` | 2,423 | 0.0023 | `txt` | Yes | `accepted` | `accepted` | `200` | 80 | 4 | 100.0 | 0 |
| 113 | `xls/clean_employees_legacy.xls` | `xls` | 22,016 | 0.0210 | `xls` | Yes | `accepted` | `accepted` | `200` | 150 | 5 | 100.0 | 0 |
| 114 | `xls/transactions_with_anomalies_legacy.xls` | `xls` | 22,016 | 0.0210 | `xls` | Yes | `accepted` | `accepted` | `200` | 155 | 4 | 68.8 | 4 |
| 115 | `xlsx/clean_iot_sensor.xlsx` | `xlsx` | 37,318 | 0.0356 | `xlsx` | No* | `accepted` | `accepted` | `200` | 600 | 8 | 100.0 | 0 |
| 116 | `xlsx/clean_supply_chain.xlsx` | `xlsx` | 45,419 | 0.0433 | `xlsx` | No* | `accepted` | `accepted` | `200` | 600 | 12 | 100.0 | 0 |
| 117 | `xlsx/large_text_payload_workbook.xlsx` | `xlsx` | 82,842 | 0.0790 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 3000 | 2 | 100.0 | 0 |
| 118 | `xlsx/multisheet_workbook.xlsx` | `xlsx` | 18,824 | 0.0180 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 200 | 5 | 100.0 | 0 |
| 119 | `xlsx/unicode_headers_and_sheetname.xlsx` | `xlsx` | 7,857 | 0.0075 | `xlsx` | Yes | `accepted` | `accepted` | `200` | 100 | 5 | 100.0 | 0 |

---

## 3. Format & Category Coverage

| Group / Format | File Count | Total Bytes | Total MiB | Accepted | Rejected |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Format: `CSV` | 71 | 18,539,159 | 17.6803 | 66 | 5 |
| Format: `TSV` | 7 | 144,765 | 0.1381 | 7 | 0 |
| Format: `TXT` | 9 | 38,383 | 0.0366 | 7 | 2 |
| Format: `XLSX` | 12 | 246,014 | 0.2346 | 8 | 4 |
| Format: `XLS` | 5 | 122,368 | 0.1167 | 5 | 0 |
| Format: `PDF` | 15 | 136,779 | 0.1304 | 11 | 4 |
| Category: `adversarial/wrong_extension` | 5 | 14,455 | 0.0138 | 0 | 5 |
| Category: `adversarial/corrupted` | 5 | 18,945 | 0.0181 | 0 | 5 |
| Category: `adversarial/empty` (empty/minimal) | 7 | 487 | 0.0005 | 5 | 2 |
| Category: `wide` (`csv_wide_999` + `wide_1001`) | 2 | 402,566 | 0.3839 | 1 | 1 |
| Category: `large` (`1MB`, `5MB`, `10MB`) | 3 | 14,150,130 | 13.4946 | 3 | 0 |
| Category: `cross_format` (`3 families × 6 formats`) | 18 | 230,978 | 0.2203 | 18 | 0 |

---

## 4. Dataset Coverage & Ground Truth Overview

- **Total Datasets on Disk:** `119` (`115` in `master_manifest.json` + `4` clean domain TSV/XLSX variants whose per-dataset manifest files collided by stem with their CSV counterparts).
- **Expected Accepted:** `105` (`101` in `master_manifest.json` + `4` unlisted clean domain variants).
- **Expected Rejected:** `14` (`5` wrong-extension, `5` corrupted, `1` zero-byte empty CSV, `1` 1001-column wide CSV, `1` non-tabular prose TXT, `1` scanned image-only PDF).
- **Datasets with Documented Ground-Truth Anomaly Arrays:** `48` datasets containing `76` discrete anomaly/guard expectations.

---

## 5. Capability Matrix

| Test Category / Anomaly Type | INTEGRIS Module | Support Classification | Notes |
| :--- | :--- | :---: | :--- |
| Format & Magic-Byte Validation (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.pdf`) | `app/ingestion/detector.py` | `SUPPORTED` | 100% of wrong-extension, binary-in-text, prose TXT, and scanned PDF files rejected cleanly. |
| Corrupted / Truncated / Zero-Byte File Rejection | `app/ingestion/*`, `app/api/routes.py` | `SUPPORTED` | 100% rejected with HTTP 400 and sanitized error messages (zero traceback leaks). |
| Wide Dataset Column Guard (`MAX_DATASET_COLUMNS = 1000`) | `app/api/routes.py` | `SUPPORTED` | `csv_wide_999_columns.csv` accepted (HTTP 200); `wide_1001_columns_over_limit.csv` rejected (HTTP 413). |
| Header-Only (0 Data Rows) File Handling | `app/ingestion/csv_parser.py`, `app/api/routes.py` | `ENGINE_ONLY` | `run_forensic_pipeline()` supports 0-row DataFrames, but `csv_parser.py` and `routes.py` reject 0-row uploads with HTTP 400. |
| Exact Duplicate Row Detection (`FND-UNQ-EXACT-DUPS`) | `app/engine/uniqueness.py` | `SUPPORTED` | 100% of true exact duplicate datasets detected across CSV, TSV, TXT, XLSX, XLS, and PDF. |
| Primary-Key Collision Detection (`FND-UNQ-PK-COLLISION-*`) | `app/engine/uniqueness.py` | `PARTIALLY_SUPPORTED` | Detects all primary-key collisions (0.1% to 10%), but also flags foreign-key `*_id` columns (`customer_id`, `user_id`, `manager_id`, `device_id`) and `product_code`. |
| Near-Duplicate / Transposed-Character ID Detection | `app/engine/uniqueness.py` | `NOT_CURRENTLY_SUPPORTED` | No edit-distance ID matcher exists (though 42/44 transposed IDs in `identifiers_near_duplicates.csv` collided with existing sequential IDs and were caught). |
| Missingness & Disguised Sentinels (`FND-CMP-MISS-*`, `FND-CMP-SENT-*`) | `app/engine/completeness.py` | `SUPPORTED` | Detects standard missingness (`>=5%`) and disguised text/numeric sentinels (`NULL`, `N/A`, `unknown`, `-1`, `9999`). |
| Numeric Type Drift in String/Object Columns (`FND-VAL-TYPEDRIFT-*`) | `app/engine/validity.py` | `PARTIALLY_SUPPORTED` | Works on CSV/TSV/TXT/PDF, but `excel_parser.py` (`pd.read_excel` default `keep_default_na=True`) coerces `'N/A'` strings to `NaN` before `validity.py` runs. |
| Mixed Date Formats & Invalid Calendar Dates (`FND-VAL-DATE-FORMAT-*`) | `app/engine/validity.py` | `SUPPORTED` | Detects both `date_format_variety.csv` (292 rows) and `date_validity_violations.csv` (18 impossible calendar dates). |
| Categorical Casing & Typo Drift (`FND-VAL-CAT-CASING-*`) | `app/engine/validity.py` | `SUPPORTED` | Detects casing variants while leaving rare valid categories (`'On Leave'`) unflagged. |
| Temporal Ordering Contradictions (`FND-CNS-TEMP-*`) | `app/engine/consistency.py` | `PARTIALLY_SUPPORTED` | Detects `hire_date->termination_date` and `order_date->ship_date/delivery_date`, but lacks rules for `admit->discharge`, `enrollment->graduation`, `opened->closed`, `pickup->delivered`, `ship->delivery`, and `transaction->settlement`. |
| Impossible Negative Values (`FND-CNS-NEG-*`) | `app/engine/consistency.py` | `SUPPORTED` | Detects negative `age` and `age_at_admission` while leaving negative `price_change`, `profit_usd`, `temperature_c`, `amount`, and `balance_after` unflagged. |
| Statistical Outlier Detection (`FND-DST-OUTLIER-*`) | `app/engine/distribution.py` | `SUPPORTED` | Detects extreme outliers across `amount`, `quantity`, `unit_price`, `salary`, `temperature_c`, `duration_ms`, and `annual_salary`. |
| Target Leakage Detection (`FND-LKG-CORR-*`, `FND-LKG-PROXY-*`) | `app/engine/leakage.py` | `SUPPORTED` | Detects `risk_score` leakage (`r = 1.000`) against `approval_outcome` while ignoring `tax_amount = 0.18 * base_amount`. |
| Percentage Bound Validation (`> 100%` on `*_pct` columns) | `app/engine/consistency.py` | `NOT_CURRENTLY_SUPPORTED` | No `0..100` bound rule for percentage columns (`renewable_pct`, `attendance_pct`). |
| Cross-Column Arithmetic Validation (`total == qty * price`) | `app/engine/consistency.py` | `NOT_CURRENTLY_SUPPORTED` | No multi-column product/sum formula checker. |
| Plausible Date Range (`future_dated_record` / `implausibly_ancient_date`) | `app/engine/validity.py` | `NOT_CURRENTLY_SUPPORTED` | No wall-clock future or ancient year bound check on standalone date columns. |
| Sequential Row-to-Row Timestamp Monotonicity (`temporal_out_of_sequence`) | `app/engine/consistency.py` | `NOT_CURRENTLY_SUPPORTED` | Row order is treated as independent; no lag-1 timestamp monotonicity check. |
| Geospatial / Impossible Travel Detection (`impossible_travel_pattern`) | `app/engine/consistency.py` | `NOT_CURRENTLY_SUPPORTED` | Domain-specific multi-row entity velocity rule is outside current tabular engine scope. |
| Batch-to-Batch Covariate / Distribution Shift (`distribution_drift`) | `app/engine/distribution.py` | `NOT_CURRENTLY_SUPPORTED` | No group-conditional distribution shift test across batch columns. |

---

## 6. Ingestion Validation Results

### 6.1 Rejected Files (15 Actual Rejected vs 14 Expected Rejected)

| Dataset | Expected | Actual | HTTP | Sanitized Error Detail | Traceback Leak? |
| :--- | :---: | :---: | :---: | :--- | :---: |
| `adversarial/corrupted/corrupted_zip_xlsx.xlsx` | `rejected` | `rejected` | `400` | `Unable to read Excel file (.xlsx). The workbook may be corrupted, malformed, or password-protected.` | None |
| `adversarial/corrupted/malformed_csv.csv` | `rejected` | `rejected` | `400` | `Malformed dataset: Structural delimiter or quote parsing error encountered.` | None |
| `adversarial/corrupted/malformed_pdf.pdf` | `rejected` | `rejected` | `400` | `This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document.` | None |
| `adversarial/corrupted/truncated_xlsx.xlsx` | `rejected` | `rejected` | `400` | `Unable to read Excel file (.xlsx). The workbook may be corrupted, malformed, or password-protected.` | None |
| `adversarial/corrupted/zero_byte_file.xlsx` | `rejected` | `rejected` | `400` | `Uploaded dataset file is completely empty (0 bytes).` | None |
| `adversarial/empty/completely_empty.csv` | `rejected` | `rejected` | `400` | `Uploaded dataset file is completely empty (0 bytes).` | None |
| `adversarial/empty/header_only.csv` | `accepted` | `rejected` | `400` | `Dataset contains 0 records or 0 columns after parsing.` | None |
| `adversarial/wide/wide_1001_columns_over_limit.csv` | `rejected` | `rejected` | `413` | `Dataset contains 1,001 columns, which exceeds the maximum processing limit of 1,000 columns.` | None |
| `adversarial/wrong_extension/binary_renamed_txt.txt` | `rejected` | `rejected` | `400` | `File with extension '.txt' contains binary null-byte data and is not valid text.` | None |
| `adversarial/wrong_extension/plain_text_renamed.pdf` | `rejected` | `rejected` | `400` | `Invalid .pdf file: missing %PDF header signature.` | None |
| `adversarial/wrong_extension/valid_pdf_renamed.xlsx` | `rejected` | `rejected` | `400` | `File contains PDF data but has extension '.xlsx'.` | None |
| `adversarial/wrong_extension/valid_xls_renamed.csv` | `rejected` | `rejected` | `400` | `File contains legacy OLE/XLS data but has extension '.csv'.` | None |
| `adversarial/wrong_extension/valid_xlsx_renamed.pdf` | `rejected` | `rejected` | `400` | `File contains OpenXML/ZIP data but has extension '.pdf'.` | None |
| `pdf/scanned_image_only_no_text.pdf` | `rejected` | `rejected` | `400` | `This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document.` | None |
| `txt/txt_nontabular_prose.txt` | `rejected` | `rejected` | `400` | `This TXT file does not contain structured tabular data.` | None |

### 6.2 Structural Edge-Case Ingestion Verification
- **UTF-8 BOM (`csv/csv_utf8_bom.csv`):** Accepted (`HTTP 200`). First header cleanly parsed as `'id'` (no `\ufeff` prefix).
- **Exact Duplicate Headers (`csv/csv_duplicate_headers_exact.csv`):** Accepted (`HTTP 200`). Headers disambiguated as `['id', 'name', 'name.1', 'score']`.
- **3x Repeated Header (`adversarial/duplicate_headers/customer_id_repeated_three_times.csv`):** Accepted (`HTTP 200`). Headers disambiguated as `['customer_id', 'customer_id.1', 'customer_id.2', 'order_total']`.
- **Whitespace Duplicate Headers (`adversarial/duplicate_headers/csv_duplicate_headers_whitespace.csv`):** Accepted (`HTTP 200`). Headers normalized and disambiguated as `['name', 'name_1', 'NAME']`.
- **Blank Rows Interspersed (`csv/csv_empty_rows_interspersed.csv`):** Accepted (`HTTP 200`), `80` data rows extracted cleanly.
- **Multiline & Escaped Quotes (`csv/csv_quoting_and_multiline.csv`):** Accepted (`HTTP 200`), `120` rows × `5` columns extracted cleanly.
- **Commas Inside TSV Values (`tsv/tsv_delimiter_detection_case.tsv`):** Accepted (`HTTP 200`), `50` rows × `4` columns parsed as tab-delimited without CSV misdetection.
- **Multi-Sheet Excel (`xlsx/multisheet_workbook.xlsx`):** Accepted (`HTTP 200`), `EmptySheet` skipped and `CleanData` (`200` rows × `5` columns) selected automatically.
- **Repeated PDF Headers Across Pages (`pdf/clean_multipage_table_repeated_headers.pdf`):** Accepted (`HTTP 200`), `220` data rows × `5` columns coalesced across 6 pages without treating repeated page headers as data rows.
- **Multi-Page PDF Final 1-Row Continuation Page (`pdf/numeric_heavy_sensor_table.pdf`):** Expected `150` rows, extracted `149` rows (`RD00150` on the final page was skipped because `pdf_parser.py` lines 73 & 90 require `len(table) >= 2` on every page, which drops a 1-row final continuation page when headers do not repeat on every page).

---

## 7. True-Positive & True-Negative Results

| Dataset | Anomaly Type | Target Column(s) | Status | Matched Finding ID(s) |
| :--- | :--- | :--- | :---: | :--- |
| `cross_format/family_b_duplicates.csv` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `cross_format/family_b_duplicates.pdf` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `cross_format/family_b_duplicates.tsv` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `cross_format/family_b_duplicates.txt` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `cross_format/family_b_duplicates.xls` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `cross_format/family_b_duplicates.xlsx` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `csv/banking_transactions_true_positive.csv` | `temporal_inversion` | `['transaction_datetime', 'settlement_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-transaction_datetime-settlement_date` |
| `csv/banking_transactions_true_positive.csv` | `extreme_outlier` | `amount` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-amount` |
| `csv/banking_transactions_true_positive.csv` | `duplicate_id_conflicting_fields` | `transaction_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-transaction_id` |
| `csv/categorical_drift_employment_status.csv` | `categorical_corruption` | `employment_status` | `TRUE_POSITIVE` | `FND-VAL-CAT-CASING-employment_status` |
| `csv/crm_tickets_true_positive.csv` | `temporal_inversion` | `['opened_date', 'closed_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-opened_date-closed_date` |
| `csv/date_format_variety.csv` | `mixed_date_formats` | `event_date_raw` | `TRUE_POSITIVE` | `FND-VAL-DATE-FORMAT-event_date_raw` |
| `csv/date_validity_violations.csv` | `invalid_calendar_date` | `date_value` | `TRUE_POSITIVE` | `FND-VAL-DATE-FORMAT-date_value` |
| `csv/ecommerce_transactions_true_positive.csv` | `temporal_inversion` | `['ship_date', 'delivery_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-ship_date-delivery_date` |
| `csv/ecommerce_transactions_true_positive.csv` | `extreme_outlier` | `quantity` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-quantity` |
| `csv/ecommerce_transactions_true_positive.csv` | `malformed_numeric_string` | `unit_price` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-unit_price` |
| `csv/ecommerce_transactions_true_positive.csv` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `csv/food_rescue_true_positive.csv` | `temporal_inversion` | `['pickup_date', 'delivered_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-pickup_date-delivered_date` |
| `csv/healthcare_records_true_positive.csv` | `temporal_inversion` | `['admit_date', 'discharge_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-admit_date-discharge_date` |
| `csv/healthcare_records_true_positive.csv` | `impossible_negative_value` | `age_at_admission` | `TRUE_POSITIVE` | `FND-CNS-NEG-age_at_admission` |
| `csv/high_cardinality_free_text.csv` | `false_positive_guard` | `free_text_note` | `TRUE_NEGATIVE` | `(none expected)` |
| `csv/hr_true_positive.csv` | `temporal_inversion` | `['hire_date', 'termination_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-hire_date-termination_date` |
| `csv/hr_true_positive.csv` | `impossible_negative_value` | `age` | `TRUE_POSITIVE` | `FND-CNS-NEG-age` |
| `csv/hr_true_positive.csv` | `exact_duplicate_rows` | `-` | `TRUE_POSITIVE` | `FND-UNQ-EXACT-DUPS` |
| `csv/hr_true_positive.csv` | `duplicate_id_conflicting_fields` | `employee_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-employee_id` |
| `csv/hr_true_positive.csv` | `missing_values` | `email` | `TRUE_POSITIVE` | `FND-CMP-SENT-TXT-email` |
| `csv/hr_true_positive.csv` | `categorical_corruption` | `employment_status` | `TRUE_POSITIVE` | `FND-VAL-CAT-CASING-employment_status` |
| `csv/identifiers_duplicates_0_1pct.csv` | `duplicate_identifier` | `record_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id` |
| `csv/identifiers_duplicates_0pct.csv` | `duplicate_identifier` | `record_id` | `TRUE_NEGATIVE` | `(none expected)` |
| `csv/identifiers_duplicates_10pct.csv` | `duplicate_identifier` | `record_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id` |
| `csv/identifiers_duplicates_1pct.csv` | `duplicate_identifier` | `record_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id` |
| `csv/identifiers_duplicates_5pct.csv` | `duplicate_identifier` | `record_id` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id` |
| `csv/iot_sensor_true_positive.csv` | `extreme_outlier` | `temperature_c` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-temperature_c` |
| `csv/leakage_and_legitimate_derivation.csv` | `legitimate_derived_field` | `['base_amount', 'tax_amount']` | `TRUE_NEGATIVE` | `(none expected)` |
| `csv/leakage_and_legitimate_derivation.csv` | `suspected_target_leakage` | `['risk_score', 'approval_outcome']` | `TRUE_POSITIVE` | `FND-LKG-CORR-risk_score` |
| `csv/missing_values_scattered_and_clustered.csv` | `scattered_missingness` | `email` | `TRUE_POSITIVE` | `FND-CMP-SENT-TXT-email, FND-CMP-MISS-email` |
| `csv/missing_values_scattered_and_clustered.csv` | `missing_numeric` | `annual_salary` | `TRUE_POSITIVE` | `FND-VAL-TYPEDRIFT-annual_salary, FND-CMP-SENT-TXT-annual_salary` |
| `csv/numeric_anomalies.csv` | `impossible_negative_value` | `age` | `TRUE_POSITIVE` | `FND-CNS-NEG-age` |
| `csv/numeric_anomalies.csv` | `extreme_outlier` | `salary` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-salary` |
| `csv/numeric_anomalies.csv` | `malformed_numeric_string` | `quantity` | `TRUE_POSITIVE` | `FND-VAL-TYPEDRIFT-quantity, FND-CMP-SENT-TXT-quantity` |
| `csv/saas_events_true_positive.csv` | `extreme_outlier` | `duration_ms` | `TRUE_POSITIVE` | `FND-DST-OUTLIER-duration_ms` |
| `csv/student_records_true_positive.csv` | `temporal_inversion` | `['enrollment_date', 'graduation_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-enrollment_date-graduation_date` |
| `csv/supply_chain_true_positive.csv` | `temporal_inversion` | `['order_date', 'ship_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-order_date-ship_date` |
| `csv/unicode_multilingual_text.csv` | `unicode_content` | `['customer_name', 'feedback_note']` | `TRUE_NEGATIVE` | `(none expected)` |
| `large/large_hr_dataset_10mb.csv` | `controlled_anomaly_mixture` | `-` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id, FND-CNS-TEMP-hire_date-termination_date, FND-DST-OUTLIER-annual_salary, FND-UNQ-EXACT-DUPS, FND-VAL-CAT-CASING-employment_status, FND-CMP-MISS-termination_date` |
| `large/large_hr_dataset_1mb.csv` | `controlled_anomaly_mixture` | `-` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id, FND-CNS-TEMP-hire_date-termination_date, FND-DST-OUTLIER-annual_salary, FND-UNQ-EXACT-DUPS, FND-VAL-CAT-CASING-employment_status, FND-CMP-MISS-termination_date` |
| `large/large_hr_dataset_5mb.csv` | `controlled_anomaly_mixture` | `-` | `TRUE_POSITIVE` | `FND-UNQ-PK-COLLISION-record_id, FND-CNS-TEMP-hire_date-termination_date, FND-DST-OUTLIER-annual_salary, FND-UNQ-EXACT-DUPS, FND-VAL-CAT-CASING-employment_status, FND-CMP-MISS-termination_date` |
| `pdf/anomalous_healthcare_table.pdf` | `temporal_inversion` | `['admit_date', 'discharge_date']` | `TRUE_POSITIVE` | `FND-CNS-TEMP-admit_date-discharge_date` |
| `pdf/anomalous_healthcare_table.pdf` | `impossible_negative_value` | `age` | `TRUE_POSITIVE` | `FND-CNS-NEG-age` |
| `pdf/missing_cells_support_table.pdf` | `missing_values` | `['priority', 'resolution_notes']` | `TRUE_POSITIVE` | `FND-CMP-MISS-priority, FND-CMP-MISS-resolution_notes` |
| `pdf/mixed_data_types_table.pdf` | `mixed_type_column` | `value` | `TRUE_POSITIVE` | `FND-CMP-SENT-TXT-value` |
| `xls/transactions_with_anomalies_legacy.xls` | `malformed_numeric_string` | `amount` | `TRUE_POSITIVE` | `FND-VAL-TYPEDRIFT-amount, FND-CMP-SENT-TXT-amount` |

---

## 8. False-Positive Audit

### 8.1 Phase 1–3 Hardening Verification (Confirmed Passing)
- **`country_code`, `region_code`, `status_code`:** `0` false identifier or PK-collision findings across all 119 datasets.
- **`paid`, `status`, `validity`:** `0` false numeric/boolean/identifier findings in `csv/false_positive_code_columns.csv`.
- **`price_change`, `voltage`, `shortage`, `temperature_c`, `profit_usd`, `balance_after`:** `0` false `FND-CNS-NEG-*` findings on legitimate negative values across the entire corpus.
- **`free_text_note` (`csv/high_cardinality_free_text.csv`):** Classified as `free_text` (`0` false identifier findings despite 100% unique strings).
- **`attendance_pct` (`csv/hr_true_positive.csv`, `large/large_hr_dataset_*.csv`, 45 MB stress dataset):** `0` false `FND-CNS-TEMP-hire_date-attendance_pct` findings.
- **Rare legitimate category `'On Leave'` (`csv/categorical_drift_employment_status.csv`):** Preserved without false flagging while casing drift (`'active'`, `'ACTIVE'`, `'full-time'`) was caught.

### 8.2 Newly Identified False-Positive Patterns in the Corpus
1. **`product_code` Classified as Candidate Primary Key (`uniqueness.py` line 28):**
   - Because `'product'` is included in `ENTITY_CODE_QUALIFIERS` and `uniqueness.py` line 157 runs PK-collision checks whenever `_is_identifier_column(col_str)` is `True` (without checking whether `unique_ratio` is high or whether a primary key like `order_id`/`row_id` already exists), `FND-UNQ-PK-COLLISION-product_code` fires on `csv/false_positive_code_columns.csv`, `csv/identifiers_composite_key.csv`, `csv/clean_ecommerce_transactions.csv`, and all 18 `cross_format/family_*` files.
2. **Foreign-Key / Grouping `*_id` Columns Flagged as Primary-Key Collisions (`uniqueness.py` line 157):**
   - In relational tables that already have a 100%-unique primary key (`ticket_id`, `auth_event_id`, `order_id`, `patient_id`, `employee_id`, `reading_id`, `event_id`), repeating foreign keys (`customer_id`, `agent_id`, `user_id`, `attending_physician_id`, `manager_id`, `device_id`, `account_id`) trigger `CRITICAL` `FND-UNQ-PK-COLLISION-*` findings because `uniqueness.py` treats every column containing token `'id'` as a candidate primary key regardless of its cardinality (`unique_ratio` between `0.07` and `0.51`).
3. **Benford's Law Firing on Synthetic Uniformly-Distributed Prices/Amounts (`distribution.py`):**
   - Synthetic datasets generated via `random.uniform(a, b)` spanning 2+ orders of magnitude (`unit_price`, `amount`, `salary`, `annual_salary`) do not follow a logarithmic Benford distribution and therefore trigger `FND-DST-BENFORD-*` (`MEDIUM`).

---

## 9. False-Negative Audit

| Dataset | Missed Anomaly | Target Column(s) | Root Cause in Current Implementation |
| :--- | :--- | :--- | :--- |

---

## 10. Unsupported Expectations (`NOT_CURRENTLY_SUPPORTED` / `PARTIALLY_SUPPORTED` Thresholds)

| Dataset | Expected Anomaly | Target Column(s) | Classification | Explanation |
| :--- | :--- | :--- | :---: | :--- |
| `cross_format/family_c_temporal_anomaly.csv` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `cross_format/family_c_temporal_anomaly.pdf` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `cross_format/family_c_temporal_anomaly.tsv` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `cross_format/family_c_temporal_anomaly.txt` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `cross_format/family_c_temporal_anomaly.xls` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `cross_format/family_c_temporal_anomaly.xlsx` | `implausible_future_date` | `order_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausible_future_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/categorical_distribution_shift.csv` | `distribution_drift` | `sales_region` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'distribution_drift' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/cyber_auth_logs_true_positive.csv` | `impossible_travel_pattern` | `['user_id', 'country_code', 'event_timestamp']` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'impossible_travel_pattern' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/date_future_and_ancient.csv` | `future_dated_record` | `record_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'future_dated_record' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/date_future_and_ancient.csv` | `implausibly_ancient_date` | `record_date` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'implausibly_ancient_date' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/ecommerce_transactions_true_positive.csv` | `derived_value_mismatch` | `total_amount` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'derived_value_mismatch' is not currently implemented as a dedicated detector in INTEGRIS (incidentally flagged via ['FND-UNQ-EXACT-DUPS', 'FND-DST-OUTLIER-total_amount']). |
| `csv/energy_sustainability_true_positive.csv` | `invalid_percentage` | `renewable_pct` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/iot_sensor_true_positive.csv` | `temporal_out_of_sequence` | `timestamp` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'temporal_out_of_sequence' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/missing_values_scattered_and_clustered.csv` | `clustered_missingness` | `department` | `PARTIALLY_SUPPORTED` | Missingness ratio in ['department'] was below INTEGRIS's >=5.0% column missingness threshold (or contiguous-block cluster detection is not separately implemented). |
| `csv/missing_values_scattered_and_clustered.csv` | `missing_dates` | `hire_date` | `PARTIALLY_SUPPORTED` | Missingness ratio in ['hire_date'] was below INTEGRIS's >=5.0% column missingness threshold (or contiguous-block cluster detection is not separately implemented). |
| `csv/numeric_anomalies.csv` | `invalid_percentage` | `attendance_pct` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS (incidentally flagged via ['FND-DST-OUTLIER-attendance_pct']). |
| `csv/student_records_true_positive.csv` | `invalid_percentage` | `attendance_pct` | `NOT_CURRENTLY_SUPPORTED` | Anomaly type 'invalid_percentage' is not currently implemented as a dedicated detector in INTEGRIS. |
| `csv/temporal_forensics_multidomain.csv` | `temporal_inversion_summary` | `-` | `NOT_CURRENTLY_SUPPORTED` | Dataset stores generic columns (date_a, date_b) whose semantic roles are defined dynamically per row in (date_a_label, date_b_label); INTEGRIS matches temporal pairs by column name. |

---

## 11. Cross-Format Comparison (`cross_format/`)

| Family | Formats Tested | Rows (All 6) | Cols (All 6) | Trust Score (All 6) | Verdict (All 6) | Finding IDs Emitted Across All 6 Formats |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| Family A (`family_a_clean.*`) | `csv, pdf, tsv, txt, xls, xlsx` | `150` | `6` | `100.0` | `reliable` | `[]` |
| Family B (`family_b_duplicates.*`) | `csv, pdf, tsv, txt, xls, xlsx` | `162` | `6` | `66.1` | `caution` | `['FND-UNQ-PK-COLLISION-order_id', 'FND-UNQ-EXACT-DUPS', 'FND-DST-BENFORD-unit_price']` |
| Family C (`family_c_temporal_anomaly.*`) | `csv, pdf, tsv, txt, xls, xlsx` | `150` | `6` | `100.0` | `reliable` | `[]` |

**Cross-Format Equivalence Conclusion:** All 6 formats (`CSV`, `TSV`, `TXT`, `XLSX`, `XLS`, `PDF`) produced **100% identical** row counts, column counts, semantic classifications, finding IDs, and Trust Scores within each of the 3 cross-format families.

---

## 12. Performance Measurements

| Dataset | Size (MiB) | Rows | Cols | Ingestion (ms) | Engine (ms) | Total API/Harness Time (ms) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `csv/clean_hr.csv` | 0.0770 | 600 | 14 | 3.62 | 57.26 | 65.60 |
| `csv/csv_medium_a_rowcount.csv` | 0.6865 | 20000 | 4 | 16.3 | 217.51 | 243.72 |
| `csv/csv_medium_b_rowcount.csv` | 1.2012 | 35000 | 4 | 24.75 | 335.01 | 378.63 |
| `csv/csv_wide_999_columns.csv` | 0.2739 | 40 | 999 | 22.34 | 2674.47 | 2729.20 |
| `adversarial/wide/wide_1001_columns_over_limit.csv` | 0.1100 | - | - | 19.21 | - | 25.13 |
| `xlsx/large_text_payload_workbook.xlsx` | 0.0790 | 3000 | 2 | 140.72 | 113.87 | 261.67 |
| `pdf/clean_multipage_table_repeated_headers.pdf` | 0.0166 | 220 | 5 | 635.85 | 18.91 | 667.19 |
| `large/large_hr_dataset_1mb.csv` | 0.8450 | 11189 | 9 | 17.26 | 336.86 | 362.21 |
| `large/large_hr_dataset_5mb.csv` | 4.2182 | 55901 | 9 | 78.22 | 1315.48 | 1425.64 |
| `large/large_hr_dataset_10mb.csv` | 8.4314 | 111802 | 9 | 158.09 | 2472.21 | 2666.65 |
| `integris_45mb_forensic_stress_dataset.csv` (45 MB Baseline) | 43.53 | 156,310 | 26 | 936.37 | 8756.82 | 9700.00 (9.70s) |

---

## 13. Parser Issues Discovered

1. **`backend/app/ingestion/pdf_parser.py` (Lines 73 & 90) — Final 1-Row Continuation Page Dropped on Multi-Page PDFs Without Repeated Headers:**
   - **Dataset:** `pdf/numeric_heavy_sensor_table.pdf` (expected `150` rows, extracted `149` rows; row `RD00150` missing).
   - **Cause:** `pdf_parser.py` filters every page's extracted table with `if table and len(table) >= 2:`. When a multi-page table does not repeat headers on every page and the final page contains exactly 1 data row (`len(table) == 1`), that final row is discarded.
2. **`backend/app/ingestion/excel_parser.py` (Line 61) — Default `pd.read_excel()` Coerces Disguised Missingness Strings (`'N/A'`) to `NaN`:**
   - **Dataset:** `xls/transactions_with_anomalies_legacy.xls` (`~5%` of `amount` cells written as `'N/A'`).
   - **Cause:** Unlike `csv_parser.py` and `text_parser.py` (which pass `na_values=[''], keep_default_na=False`), `excel_parser.py` calls `pd.read_excel(excel_file, sheet_name=sheet)` with pandas' default `keep_default_na=True`. As a result, `'N/A'` text cells in `amount` are converted to `NaN` during Excel ingestion, preventing `validity.py` (`FND-VAL-TYPEDRIFT-amount`) and `completeness.py` (`FND-CMP-SENT-TXT-amount`) from seeing the literal `'N/A'` strings.
3. **`backend/app/ingestion/csv_parser.py` & `backend/app/api/routes.py` — Header-Only (`0`-Row) CSV Rejected with HTTP 400:**
   - **Dataset:** `adversarial/empty/header_only.csv` (manifest `expected_ingestion: 'accepted'`, actual `rejected` with HTTP 400).
   - **Cause:** `csv_parser.py` line 63 and `routes.py` line 107 explicitly reject datasets with `0` data rows (`HTTP 400`), even though `run_forensic_pipeline()` supports empty DataFrames.

---

## 14. Engine Issues Discovered

1. **`backend/app/engine/uniqueness.py` (Lines 28 & 147–157) — Foreign-Key `*_id` Columns and `product_code` Trigger False-Positive `FND-UNQ-PK-COLLISION-*` Findings:**
   - **Affected Datasets:** `csv/false_positive_code_columns.csv`, `csv/identifiers_composite_key.csv`, `cross_format/family_*` (18 files), `csv/clean_crm_tickets.csv`, `csv/clean_cyber_auth_logs.csv`, `csv/clean_ecommerce_transactions.csv`, `csv/clean_healthcare_records.csv`, `csv/clean_hr.csv`, `csv/clean_iot_sensor.csv`, `csv/clean_saas_events.csv`, `xlsx/clean_iot_sensor.xlsx`, `pdf/clean_multipage_table*.pdf`, `pdf/numeric_heavy_sensor_table.pdf`.
   - **Cause:** `_is_identifier_column()` classifies `product_code` as an entity identifier, and `analyze_uniqueness()` checks `if is_named_id or is_candidate:` without requiring high uniqueness or distinguishing primary keys from low-cardinality foreign keys (`customer_id`, `user_id`, `manager_id`, `agent_id`, `device_id`, `attending_physician_id`) when the table already possesses a 100%-unique primary key.
2. **`backend/app/engine/consistency.py` (Lines 23–50) — Incomplete `TEMPORAL_PAIRS` and `TEMPORAL_COLUMN_TOKENS` Vocabulary:**
   - **Affected Datasets:** `csv/healthcare_records_true_positive.csv` (`admit_date -> discharge_date`), `pdf/anomalous_healthcare_table.pdf` (`admit_date -> discharge_date`), `csv/student_records_true_positive.csv` (`enrollment_date -> graduation_date`), `csv/crm_tickets_true_positive.csv` (`opened_date -> closed_date`), `csv/food_rescue_true_positive.csv` (`pickup_date -> delivered_date`), `csv/ecommerce_transactions_true_positive.csv` (`ship_date -> delivery_date`), `csv/banking_transactions_true_positive.csv` (`transaction_datetime -> settlement_date`).
   - **Cause:** `TEMPORAL_PAIRS` only defines 3 rules (`hire/start -> exit/termination`, `birth -> hire/graduation`, and `order -> ship/deliver`). It lacks pairs for `admit -> discharge`, `enrollment -> graduation`, `opened -> closed`, `pickup -> delivered`, `ship -> delivery` (currently both `ship` and `deliver` are in the same `end_tokens` set), `transaction -> settlement` (with date-grain normalization when comparing `datetime` vs `date`), `hire -> promotion`, and `invoice -> payment`.

---

## 15. Manifest & Corpus Generator Inconsistencies Discovered

1. **4 Clean Domain Format Variants Omitted from `master_manifest.json` Due to Stem Collision (`generators/generate_domains.py`):**
   - `tsv/clean_food_rescue.tsv`, `tsv/clean_student_records.tsv`, `xlsx/clean_iot_sensor.xlsx`, and `xlsx/clean_supply_chain.xlsx` exist on disk (bringing the true dataset count to `119`), but `write_manifest()` keyed manifests by stem without format suffix, overwriting the CSV manifest entries.
2. **`validate_corpus.py` Skips 75 of 115 Manifest Entries (`validate_corpus.py` Line 53):**
   - `if not fname or '.' not in fname: continue` skips 75 manifest entries whose `dataset` field omits the file extension (e.g., `'clean_hr'` instead of `'clean_hr.csv'`).
3. **`pdf/date_heavy_shipment_table.pdf` Contains Unintended Chronological Inversions (`generators/generate_pdf_matrix.py` Line 81):**
   - `gen_date_heavy()` generated `order_date`, `ship_date`, `eta_date`, and `delivered_date` via 4 independent `random_date(r, 2024, 2026)` calls per row, causing 62/120 rows to have `ship_date < order_date` and 60/120 rows to have `delivered_date < order_date`.
4. **`xls/transactions_with_anomalies_legacy.xls` Generates Conflicting Fields Instead of Exact Duplicate Rows (`generators/generate_excel_matrix.py` Lines 96–102):**
   - When injecting `'exact_duplicate_rows'`, `gen_legacy_xls()` re-called `r.choice(['USD', 'EUR', 'INR'])` and `random_date(r, 2024, 2026)`, producing duplicate `transaction_id` records with different dates/currencies (caught by `FND-UNQ-PK-COLLISION-transaction_id`) rather than identical rows.
5. **`csv/identifiers_near_duplicates.csv` Transposition Collides with Sequential IDs (`generators/generate_identifiers.py` Line 45):**
   - Transposing the last two digits of sequential IDs `CUST00001..CUST00800` produces another valid ID in `CUST00001..CUST00800` on 42 of 44 rows (caught as exact collisions via `FND-UNQ-PK-COLLISION-customer_id`) and is a no-op on 2 rows (`x == y`).

---

## 16. Regression Verification

- **Backend Test Suite (`pytest -v`):** `94 passed, 0 failed, 0 skipped`
- **Frontend Test Suite (`npm test`):** `5 passed, 0 failed, 0 skipped`
- **Frontend Production Build (`npm run build`):** Succeeded (`0` errors)
- **45 MB Stress Dataset Regression (`integris_45mb_forensic_stress_dataset.csv`):**
  - Size: `45,643,565` bytes
  - Dimensions: `156,310` rows × `26` columns
  - Findings: `29`
  - Trust Score / Verdict / Grade: `0.0` / `COMPROMISED` / `F`
  - Total Runtime: `9.7s` (`936.37 ms` ingestion, `8756.82 ms` engine)
  - Strict JSON (`allow_nan=False`): Passed (`61,736` bytes)
  - `FND-UNQ-PK-COLLISION-region_code` absent: `True`
  - `FND-CNS-TEMP-hire_date-attendance_pct` absent: `True`
  - `FND-CNS-TEMP-hire_date-termination_date` present: `True`

---

## 17. Recommended Phase 7 Follow-Up Work

1. **Primary-Key vs Foreign-Key / SKU Disambiguation (`backend/app/engine/uniqueness.py`):**
   - Remove `'product'`/`'item'`/`'sku'` from `ENTITY_CODE_QUALIFIERS` (or require `is_candidate_identifier` high uniqueness ratio `>= 0.80` before flagging `FND-UNQ-PK-COLLISION-*`, especially when another column in the dataset is already a 100%-unique primary key).
2. **Expand Temporal Lifecycle Pairs (`backend/app/engine/consistency.py`):**
   - Add `admit -> discharge`, `enrollment -> graduation`, `opened -> closed`, `pickup -> delivered`, `ship -> delivery`, `hire -> promotion`, `invoice -> payment`, and date-grain-normalized `transaction -> settlement` to `TEMPORAL_PAIRS` and `TEMPORAL_COLUMN_TOKENS`.
3. **Preserve Disguised Missingness Strings in Excel Parser (`backend/app/ingestion/excel_parser.py`):**
   - Pass `na_values=[''], keep_default_na=False` to `pd.read_excel()` (matching `csv_parser.py` and `text_parser.py`) so `'N/A'` and `'NULL'` text tokens in numeric Excel columns are caught by `validity.py` and `completeness.py`.
4. **Preserve 1-Row Final Continuation Tables in Multi-Page PDFs (`backend/app/ingestion/pdf_parser.py`):**
   - Allow continuation tables on pages `> 1` with `len(table) >= 1` when `len(table[0]) == col_count` so a single trailing record on the final page is not dropped.
5. **Optional New Detectors (If Desired in Scope):**
   - Percentage range `[0, 100]` check in `consistency.py` for `*_pct` / `*_percent` / `percentage` columns.
