# INTEGRIS — Interactive Demonstration & Reproduction Guide

This guide provides end-to-end instructions for reproducing and demonstrating the full capabilities of the **INTEGRIS Data Integrity & Forensics Platform**.

---

## 1. Local Environment Launch

Ensure both backend and frontend services are running.

### Step 1: Start Backend Service
```bash
# In project root:
cd backend

# Activate Python virtual environment:
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

# Launch FastAPI on port 8000:
uvicorn app.main:app --reload --port 8000
```
Verify readiness by visiting `http://localhost:8000/api/v1/health` in your browser. Expected response:
```json
{
  "status": "operational",
  "version": "0.1.0",
  "engine": "active"
}
```

### Step 2: Start Frontend Application
```bash
# In project root (in a separate terminal):
cd frontend

# Launch Vite dev server on port 5173:
npm run dev
```
Open your browser at `http://localhost:5173`. You should see the dark-themed INTEGRIS investigation platform interface.

---

## 2. Test Scenarios & Expected Findings

Three synthetic benchmark datasets are provided in the `datasets/` directory.

### Scenario A: Pristine Clean Baseline (`datasets/clean_baseline.csv`)
1. In the INTEGRIS interface, drag-and-drop or select `datasets/clean_baseline.csv`.
2. Leave the optional Target Column blank.
3. Click **Execute Forensic Investigation**.

#### Expected Analytical Output
- **Integris Trust Score:** `100.0 / 100.0`
- **Letter Grade:** `A+`
- **Executive Verdict:** `RELIABLE` (Emerald badge)
- **Verdict Summary:** *"Dataset demonstrates exceptional integrity across all analyzed forensic dimensions. No critical anomalies or integrity violations detected."*
- **Penalties Incurred:** `0.0 pts` total across all analyzers.
- **Clean Bill of Health Banner:** Displays an emerald certificate notice confirming zero high/critical anomalies.
- **Total Findings:** `1 (Info)` — Diagnostic summary confirming 50 records and 12 columns analyzed with zero structural defects.
- **Column Dossiers:** All 12 columns show 100% completeness and 0 defects.

---

### Scenario B: Real-World Messy Tabular Data (`datasets/moderate_quality.csv`)
1. In the top case header or upload area, select `datasets/moderate_quality.csv`.
2. Leave the optional Target Column blank.
3. Click **Execute Forensic Investigation**.

#### Expected Analytical Output
- **Integris Trust Score:** `68.1 / 100.0`
- **Letter Grade:** `C`
- **Executive Verdict:** `CAUTION` (Amber badge)
- **Verdict Summary:** *"Dataset contains moderate integrity concerns. Review identified anomalies before proceeding with critical operations."*
- **Penalties Incurred:** `-31.9 pts` total penalty deductions.
- **Total Findings:** `7` findings:
  - `0 Critical`
  - `2 High` (disguised sentinels in `satisfaction_score`, format drift)
  - `2 Medium` (casing inconsistencies in `department` like `"engineering"` vs `"Engineering"`)
  - `2 Low` (mild distribution skewness / outliers in `monthly_salary`)
  - `1 Info` (diagnostic overview)
- **Exploration:** Click on any finding in the **Findings Explorer** to open the **Finding Detail Drawer** on the right side, showing affected column names, row coordinates, metric proofs, and analyst recommendations.

---

### Scenario C: Compromised Stress-Test Case (`datasets/corrupted_forensic.csv`)
1. Select `datasets/corrupted_forensic.csv`.
2. Under **Investigation Parameters**, specify the target column:
   - Target Column: `attrition`
3. Click **Execute Forensic Investigation**.

#### Expected Analytical Output
- **Integris Trust Score:** `0.0 / 100.0`
- **Letter Grade:** `F`
- **Executive Verdict:** `COMPROMISED` (Rose/Red badge)
- **Verdict Summary:** *"Severe integrity failures detected. This dataset is fundamentally untrustworthy for analytical or machine learning use without extensive remediation."*
- **Penalties Incurred:** Severe deductions across 6 distinct forensic dimensions (capped appropriately per column).
- **Total Findings:** `17` findings:
  - `3 Critical` (Primary key collision on `employee_id`, temporal inversion where `exit_date < hire_date`, and ML target proxy leakage `leaving_flag`)
  - `8 High` (Exact duplicate rows, pervasive numeric type drift in `monthly_salary` containing text like `"unknown"` and `"145kg"`, disguised sentinels `-999` in `bonus_percent`, cross-column impossible negative `years_at_company`)
  - `4 Medium` (Extreme Benford's Law distribution non-conformity on `monthly_salary`, categorical casing drift)
  - `1 Low` (Distribution skewness)
  - `1 Info` (Diagnostic summary)

---

## 3. Forensic Report Generation & Export

Once an investigation is executed:

1. Click the **Export Dossier** button in the case header.
2. An interactive modal opens with three export mechanisms:
   - **Markdown View:** Formatted audit report ready for archiving in engineering repositories. Click **Copy Markdown** or **Download .md**.
   - **JSON Raw Export:** Full, strongly typed `ForensicDossier` JSON contract including metadata, summary stats, penalty breakdown, all findings, and column profiles. Click **Copy JSON** or **Download .json**.
   - **Print / Save PDF:** Click **Print / Save PDF** or press `Ctrl+P`. A clean `@media print` stylesheet strips navigation buttons, backgrounds, and modals, rendering a professional white-paper forensic audit document formatted for Letter/A4 printing or PDF export.

---

## 4. Headless Command-Line Verification (CLI / cURL)

You can verify the forensic engine without running the frontend:

```bash
# Test Clean Baseline:
curl -X POST "http://localhost:8000/api/v1/investigate" \
  -F "file=@datasets/clean_baseline.csv"

# Test Corrupted Dataset with Target Feature:
curl -X POST "http://localhost:8000/api/v1/investigate" \
  -F "file=@datasets/corrupted_forensic.csv" \
  -F "target_column=attrition"
```

The response is a deterministic, JSON-serialized `ForensicDossier` contract matching the frontend display.
