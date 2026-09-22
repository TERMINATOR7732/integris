# INTEGRIS Reference & Demonstration Datasets

This directory contains three benchmark datasets designed to evaluate and demonstrate the INTEGRIS forensic analysis pipeline across different levels of data integrity.

All datasets are synthetic, privacy-safe, zero-risk tabular files engineered with deterministic ground truth.

---

## Dataset Summary Matrix

| Dataset File | Rows | Columns | Expected Score | Letter Grade | Executive Verdict | Findings Count | Key Characteristics |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [`clean_baseline.csv`](clean_baseline.csv) | 50 | 12 | **100.0 / 100.0** | **A+** | **RELIABLE** | 1 (Info) | Pristine synthetic HR records with valid dates, clean categories, zero missingness, and strict schema conformance. |
| [`moderate_quality.csv`](moderate_quality.csv) | 50 | 12 | **68.1 / 100.0** | **C** | **CAUTION** | 7 | Real-world messy tabular data with disguised sentinels (`"N/A"` in satisfaction score), minor casing drift (`"engineering"` vs `"Engineering"`), format drift, and mild outliers. |
| [`corrupted_forensic.csv`](corrupted_forensic.csv) | 50 | 13 | **0.0 / 100.0** | **F** | **COMPROMISED** | 17 (with target `attrition`) | Forensic stress-test dataset containing primary key collisions, temporal inversions (`exit_date < hire_date`), negative salary counts, numeric type drift (`"unknown"`, `"145kg"`), extreme Benford deviations, and target proxy leakage (`leaving_flag`). |

---

## Injected Forensic Anomalies in `corrupted_forensic.csv`

1. **Completeness:** Disguised text sentinels (`"N/A"`, `"missing"`, `"Unknown"` in `performance_rating` and `department`), disguised numeric sentinels (`-999` in `bonus_percent`).
2. **Uniqueness:** Primary key collisions on `employee_id` (repeating ID `EMP00012`), exact duplicate record rows.
3. **Validity:** Numeric type drift in `monthly_salary` (`"unknown"`, `"145kg"`), date format inconsistency in `hire_date` (`"03/12/2021"`, `"invalid-date"`), casing drift in `department` (`"engineering"` vs `"Engineering"`).
4. **Distribution:** Extreme statistical outliers beyond Tukey's $3\times\text{IQR}$ in `monthly_salary` (\$9,999,999), Benford's Law leading digit non-conformity ($p < 0.001$).
5. **Consistency:** Temporal causality inversions (`exit_date` prior to `hire_date`), impossible negative values in `years_at_company` ($-3$).
6. **Data Leakage (Target: `attrition`):** Near-identical binary target proxy column `leaving_flag` exhibiting a $1.00$ correlation / Cramér's V association with the target feature.
