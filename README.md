# INTEGRIS — Data Integrity & Forensics Platform

> **Find what your data is hiding.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC.svg)](https://tailwindcss.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen.svg)]()

INTEGRIS is a deterministic data integrity and forensic investigation platform designed to evaluate whether a tabular dataset can reasonably be trusted before it is committed to production analytics, executive decision-making, regulatory reporting, or machine learning pipelines.

Unlike generic exploratory data analysis (EDA) or data-profiling tools that merely calculate column summaries and null percentages, INTEGRIS acts as an **algorithmic forensic investigator**. It detects disguised missingness, primary key collisions, numeric type drift, cross-column causality inversions, extreme statistical anomalies, digital manipulation indicators via Benford's Law, and machine learning target leakage proxies—synthesizing all evidence into an explainable **Integris Trust Score** and **Executive Verdict**.

---

## 1. Why INTEGRIS?

Data teams and analysts routinely ingest third-party, vendor, or internally generated datasets assuming they are clean and representative. Conventional tools fail to catch critical real-world failure modes:

| Failure Mode | Generic Profilers (ydata, sweetviz) | INTEGRIS Forensic Engine |
| :--- | :--- | :--- |
| **Disguised Missingness** | Reports as valid string values (`"N/A"`, `"?"`, `"-999"`) | Detects text/numeric sentinels and quantifies disguised missingness rates |
| **Identifier Integrity** | Notes high cardinality | Flags primary key collisions on candidate identifiers with exact row indices |
| **Type Inconsistencies** | Silently coerces column to `object` type | Identifies numeric type drift and highlights contaminating string tokens |
| **Temporal Logic** | Plots independent date distributions | Computes cross-column relational contradictions ($e.g. \text{exit\_date} < \text{hire\_date}$) |
| **Digital Anomaly Screening** | Basic min/max/mean calculations | Performs Benford's Law logarithmic first-digit analysis with Chi-Square tests |
| **Target Leakage Risk** | Unaware of target feature context | Detects near-identical proxies and extreme correlations ($|r| \ge 0.95$, Cramér's V) |
| **Trust Evaluation** | No composite trustworthiness verdict | Computes an explainable 0–100 Trust Score with capped severity deductions |

---

## 2. Core Forensic Questions Answered

Every investigation produces a structured **Forensic Dossier** answering seven critical questions:

1. **What is wrong with this dataset?** Anomalies categorized across 7 forensic dimensions with deterministic severity attribution (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`).
2. **Where are the problems located?** Exact column names, record row coordinates, and offending values.
3. **What evidence supports each finding?** Quantified mathematical and statistical proofs ($p$-values, divergence statistics, Tukey bounds, match percentages).
4. **How severe is it?** Calibrated severity scoring based on operational impact.
5. **Which records are affected?** Concrete row sample indices for rapid audit and triage.
6. **What should an analyst investigate next?** Actionable remediation steps tailored to the specific failure pattern.
7. **Can this dataset reasonably be trusted?** A composite 0.0–100.0 Trust Score, letter grade (A+ through F), and clear Executive Verdict (`RELIABLE`, `CAUTION`, `COMPROMISED`).

---

## 3. Architecture Overview

INTEGRIS is built with a strictly decoupled, local-first, zero-retention architecture. All tabular computation is performed in-memory using vector operations in Python and rendered via a reactive, dark-themed investigation interface.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INTEGRIS FRONTEND (Vite / React 19)                │
│                                                                             │
│   ┌─────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│   │   Dataset Uploader  │  │  Executive Verdict    │  │  Trust Score    │  │
│   │  (Drag-and-Drop)    │  │  (Status & Summary)   │  │  (Breakdown)    │  │
│   └──────────┬──────────┘  └───────────▲───────────┘  └────────▲────────┘  │
│              │                         │                       │            │
│              │ POST multipart/form-data│                       │            │
│              ▼                         │                       │            │
│   ┌────────────────────────────────────┴───────────────────────┴────────┐  │
│   │   Findings Explorer  │  Detail Drawer  │  Column Dossiers  │ Export │  │
│   └────────────────────────────────────▲────────────────────────────────┘  │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │ JSON ForensicDossier Contract
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                       INTEGRIS BACKEND (FastAPI / Python 3.12)              │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                  In-Memory Tabular Stream (Zero Retention)          │  │
│   └──────┬──────────────┬──────────────┬──────────────┬──────────────┬──┘  │
│          ▼              ▼              ▼              ▼              ▼      │
│     [Profiler]   [Completeness]   [Uniqueness]    [Validity]   [Consistency]│
│          │              │              │              │              │      │
│          ▼              ▼              ▼              ▼              ▼      │
│    [Distribution]   [Benford's Law]   [Data Leakage]  [Trust Scorer]        │
│                                                                             │
│   * Zero Database  * Zero Disk Persistence  * Zero Telemetry  * ₹0 Budget   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

- **Frontend:**
  - [React 19](https://react.dev/) — Concurrent rendering, modern hooks architecture.
  - [TypeScript 5.7](https://www.typescriptlang.org/) — Strict typing across all components and contract interfaces.
  - [Vite 6](https://vitejs.dev/) — Ultra-fast modular bundler and development server.
  - [Tailwind CSS v4](https://tailwindcss.com/) — Modern utility-first styling with dark-mode aesthetic.
  - [Lucide React](https://lucide.dev/) — Crisp, accessible iconography.
- **Backend:**
  - [Python 3.12](https://www.python.org/) — High-performance modern Python runtime.
  - [FastAPI](https://fastapi.tiangolo.com/) — Asynchronous, typed HTTP framework with OpenAPI specification.
  - [Uvicorn](https://www.uvicorn.org/) — Lightning-fast ASGI web server implementation.
  - [Pydantic v2](https://docs.pydantic.dev/) — High-speed data validation and contract enforcement.
- **Forensic Computation:**
  - [pandas](https://pandas.pydata.org/) — High-performance tabular data structures and data manipulation.
  - [NumPy](https://numpy.org/) — Optimized vector mathematics and array operations.
  - [SciPy](https://scipy.org/) — Scientific statistical functions, Goodness-of-Fit tests, and distribution metrics.
- **Testing & Quality:**
  - [pytest](https://docs.pytest.org/) — Full unit, statistical, and end-to-end pipeline verification.
  - [Node.js Native Test Runner](https://nodejs.org/api/test.html) — Zero-dependency frontend utility verification.

---

## 5. The Eight Forensic Analyzers

INTEGRIS executes eight specialized forensic analysis engines in sequence:

1. **Dataset Profiler:** Informs baseline dimensions, memory footprint, column non-null counts, semantic data type classification (continuous, discrete, categorical, datetime, identifier, boolean, free text), cardinality ratios, and composite candidate key identification.
2. **Completeness & Missingness Inspector:** Identifies standard null values, empty whitespace tokens, disguised text sentinels (`"N/A"`, `"?"`, `"None"`, `"missing"`), disguised numeric sentinels (`-999`, `9999` in non-negative domains), and systematic cross-column co-missingness patterns.
3. **Uniqueness & Collision Detector:** Scans for exact duplicate rows across all features and identifies primary key collisions where candidate unique identifiers repeat across distinct records.
4. **Validity & Drift Inspector:** Uncovers numeric type drift (numeric columns contaminated by string tokens such as `"unknown"` or `"145kg"`), date format inconsistencies (mixed ISO, DMY, and unparseable values), and categorical casing inconsistencies (`"Engineering"` vs `"engineering"`).
5. **Distribution & Statistical Forensics:** Applies Tukey's fences ($3\times\text{IQR}$) to detect extreme statistical outliers, computes modified Z-scores using median absolute deviation (MAD), and measures distribution skewness.
6. **Benford's Law Digital Forensics:** Screens multi-decade continuous positive numerical distributions against Benford's logarithmic first-digit decay distribution ($P(d) = \log_{10}(1 + 1/d)$) using Chi-Square goodness-of-fit testing to identify potential fabrication, irregular rounding, or systemic truncation.
7. **Cross-Column Consistency Engine:** Validates defensible relational rules across columns, such as temporal causality inversions ($e.g. \text{exit\_date} < \text{hire\_date}$), impossible negative values in strictly non-negative counts, and inverted numeric boundaries ($e.g. \min > \max$).
8. **Information Leakage & Target Proxy Detector:** When a target feature is specified for supervised machine learning, scans for near-identical target proxies (Jaccard similarity $\ge 0.95$), extreme linear correlations ($|r| \ge 0.95$), and deterministic categorical associations (Cramér's V $\ge 0.95$).

---

## 6. Integris Trust Score & Verdict Matrix

The **Integris Trust Score** is a deterministic, explainable composite index from **0.0 to 100.0**:

- **Initial State:** Every dataset starts with a perfect score of **100.0**.
- **Base Severity Deductions:**
  - `CRITICAL`: **-20.0 points** (e.g. primary key collisions, temporal inversions, target proxy leakage).
  - `HIGH`: **-12.0 points** (e.g. exact duplicate rows, pervasive type drift, disguised sentinels).
  - `MEDIUM`: **-6.0 points** (e.g. Benford non-conformity, isolated statistical outliers, casing drift).
  - `LOW`: **-2.0 points** (e.g. format anomalies, extreme skewness).
  - `INFO`: **0.0 points** (diagnostic context and clean bill of health notices).
- **Proportional Row Scaling:** Deductions for row-level defects scale proportionally with the fraction of affected records.
- **Column-Level Penalty Cap:** To prevent a single noisy or experimental column from unfairly obliterating an otherwise sound dataset, no single column can deduct more than **35.0 points** total.
- **Floor Bound:** The final Trust Score is strictly bounded between **0.0** and **100.0**.

### Trust Score Bands & Executive Verdicts

| Score Range | Grade | Verdict | Status Meaning | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **90.0 – 100.0** | **A / A+** | `RELIABLE` | High integrity; no critical anomalies or systemic defects detected. | Cleared for production pipelines and executive reporting. |
| **75.0 – 89.9** | **B** | `RELIABLE` | Generally dependable; minor quality anomalies present that do not threaten analytical validity. | Proceed with routine data cleaning and standard validation. |
| **50.0 – 74.9** | **C** | `CAUTION` | Moderate integrity concerns; notable inconsistencies, missingness, or drift detected. | Thorough analyst review and remediation required prior to use. |
| **30.0 – 49.9** | **D** | `CAUTION` | Substantial structural flaws; multiple high-severity defects present. | Not recommended for production without structural remediation. |
| **0.0 – 29.9** | **F** | `COMPROMISED` | Severe integrity failures; invalid keys, temporal contradictions, or extreme corruption. | **Quarantine immediately.** Unfit for analytical or ML consumption. |

---

## 7. Demonstration & Benchmark Datasets

Three synthetic, privacy-safe benchmark datasets are included in the [`datasets/`](datasets/) directory for immediate local evaluation:

| Benchmark Dataset | Rows | Cols | Expected Score | Grade | Verdict | Total Findings | Injected Test Anomalies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [`datasets/clean_baseline.csv`](datasets/clean_baseline.csv) | 50 | 12 | **100.0 / 100.0** | **A+** | **RELIABLE** | 1 (Info) | Pristine reference dataset. 100% complete, strict schema compliance, zero defects. |
| [`datasets/moderate_quality.csv`](datasets/moderate_quality.csv) | 50 | 12 | **68.1 / 100.0** | **C** | **CAUTION** | 7 | Real-world messy tabular data: disguised sentinels (`"N/A"` in satisfaction), casing drift (`"engineering"` vs `"Engineering"`), and format anomalies. |
| [`datasets/corrupted_forensic.csv`](datasets/corrupted_forensic.csv) | 50 | 13 | **0.0 / 100.0** | **F** | **COMPROMISED** | 17 *(target: attrition)* | Stress-test dataset: Primary key collisions on `employee_id`, temporal inversions (`exit_date < hire_date`), negative counts, numeric type drift (`"unknown"`), Benford non-conformity, and target proxy leakage (`leaving_flag`). |

For full step-by-step walkthroughs, see [`docs/demo.md`](docs/demo.md).

---

## 8. Responsible Analytics & Zero-Retention Data Policy

INTEGRIS adheres to a strict **ephemeral, zero-retention security model**:

- **In-Memory Volatile Processing:** Datasets are streamed into memory, analyzed in RAM buffers, and discarded immediately after response synthesis.
- **Zero Raw Data Persistence:** No uploaded tabular files or raw record data are written to disk, databases, object stores, or temporary caches.
- **No Database Storage:** INTEGRIS operates without PostgreSQL, SQLite, MongoDB, or Supabase.
- **No External AI APIs / No LLMs:** Analysis is 100% local, deterministic, and mathematical. No proprietary customer data is ever sent to third-party language models or external cloud APIs.
- **Zero Telemetry & Tracking:** No analytics scripts, cookies, or remote telemetric beacons are embedded.
- **Ethical Screening Disclosure:** Benford's Law and statistical outlier flags are intended as **investigative screening leads**, not definitive proof of fraud, illegality, or malicious activity. Many valid real-world datasets naturally deviate from Benford's Law (e.g. narrow numeric ranges, regulated tariffs, psychological pricing). Contextual verification by qualified analysts is always advised.

---

## 9. Local Setup & Installation

### Prerequisites
- **Python:** 3.10 or higher (recommended: 3.12)
- **Node.js:** 18 or higher (tested with Node 24)
- **Git**

### 1. Clone Repository
```bash
git clone https://github.com/your-username/integris.git
cd integris
```

### 2. Backend Service Setup
```bash
cd backend

# Create and activate virtual environment:
python -m venv .venv

# On Windows PowerShell:
.venv\Scripts\Activate.ps1
# On macOS/Linux:
# source .venv/bin/activate

# Install required dependencies:
pip install -r requirements.txt

# Launch FastAPI development server:
uvicorn app.main:app --reload --port 8000
```
- Interactive API Documentation (Swagger): `http://localhost:8000/docs`
- Service Health Endpoint: `http://localhost:8000/api/v1/health`

### 3. Frontend Application Setup
```bash
# In a separate terminal window:
cd frontend

# Install Node dependencies:
npm install

# Start Vite development server:
npm run dev
```
- Investigation Web Interface: `http://localhost:5173`

---

## 10. API Specification

### `GET /api/v1/health`
Checks engine readiness, system status, and active version.
```json
{
  "status": "operational",
  "version": "0.1.0",
  "engine": "active"
}
```

### `POST /api/v1/investigate`
Performs complete forensic integrity investigation on an uploaded tabular dataset.
- **Content-Type:** `multipart/form-data`
- **Parameters:**
  - `file` *(required)*: Tabular file (`.csv`, `.tsv`, `.txt`). Max file size: 50 MB.
  - `target_column` *(optional)*: Name of target column for machine-learning leakage diagnostics.
  - `delimiter` *(optional)*: Explicit field delimiter (defaults to auto-detection).
- **Returns:** Strongly typed `ForensicDossier` JSON object containing:
  - `metadata`: Dataset filename, size, row count, column count, execution time, timestamp.
  - `trust_score`: Score (0–100), letter grade (A+–F), executive verdict, summary, penalty breakdown.
  - `findings`: Array of granular anomaly findings with severity, domain, title, explanation, metrics, affected columns/rows, and recommended actions.
  - `column_profiles`: Detailed profiles for all analyzed columns.

---

## 11. Verification & Automated Testing

### Backend Test Suite (39 Tests)
Run the full pytest suite from the project root or `backend/`:
```bash
# From project root:
backend/.venv/Scripts/python.exe -m pytest -v
```
Verifies:
- Complete end-to-end pipeline against all three reference datasets.
- Individual analyzer units: completeness, uniqueness, validity, distribution, Benford's Law, consistency, and leakage.
- Trust Scorer penalty attribution and column-level deduction caps.
- FastAPI endpoints, serialization schemas, and error boundaries.

### Frontend Unit Tests & Build
```bash
cd frontend

# Run unit tests:
npm test

# Verify production TypeScript build:
npm run build
```
Verifies report formatting utilities, Markdown dossier generation, JSON serialization, and ensures zero TypeScript compilation errors.

---

## 12. Forensic Dossier Export Formats

INTEGRIS provides three export channels from the investigation interface:
1. **Interactive Modal:** Quick review of full dossier directly within the platform.
2. **Executive Markdown Report (`.md`):** Formatted audit documentation with structured sections, summary metrics, and prioritized finding lists ready for Git commit.
3. **Machine-Readable JSON (`.json`):** Full, un-truncated `ForensicDossier` contract for ingestion into automated CI/CD data quality gates.
4. **Print / PDF Audit Report:** Uses a specialized `@media print` stylesheet that cleanly formats the investigation into an executive white-paper document via the browser's native print preview (`Ctrl+P` / `Cmd+P`).

---

## 13. License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
