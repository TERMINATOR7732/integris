# INTEGRIS — Portfolio & Recruiter Summary

- **Live Application:** [https://integris-ten.vercel.app](https://integris-ten.vercel.app)
- **Production API:** [https://integris-sp5o.onrender.com/api/v1/health](https://integris-sp5o.onrender.com/api/v1/health)
- **GitHub Repository:** [https://github.com/TERMINATOR7732/integris](https://github.com/TERMINATOR7732/integris)

---

### One-line description

INTEGRIS is a full-stack data integrity and forensic analysis platform that inspects uploaded tabular datasets across six file formats for structural, statistical, temporal, uniqueness, and consistency anomalies.

---

### 50-word description

INTEGRIS is a deterministic data forensics platform built with FastAPI, Python, React 19, and TypeScript. It ingests CSV, TSV, TXT, Excel, and PDF tables in memory, runs six specialized analyzers to detect primary-key collisions, temporal inversions, sentinel values, type drift, and target leakage, and generates an explainable Trust Score dossier.

---

### 100-word description

INTEGRIS is a stateless data integrity and forensic investigation platform designed to uncover hidden dataset defects that pass ordinary schema validation. Built with a Python/FastAPI backend and a React 19/TypeScript frontend, it parses uploaded `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf` tables entirely in volatile memory. Its analytical pipeline profiles column semantics and executes deterministic detectors for primary-key vs. foreign-key collisions, cross-column chronological inversions, disguised text/numeric sentinels, numeric type drift, distribution outliers, Benford's Law deviations, and supervised ML target leakage. Each investigation produces row-level evidence, a capped 0–100 Trust Score, an Executive Verdict, and exportable Markdown/JSON audit dossiers.

---

### Technical highlights

- **Deterministic Six-Analyzer Pipeline:** Sequential in-memory execution covering Completeness, Uniqueness, Validity, Distribution (Tukey $3\times\text{IQR}$, skewness, Benford's Law), Cross-Column Consistency, and ML Target Leakage (`pandas`, `NumPy`, `SciPy`).
- **Multi-Format In-Memory Ingestion:** Unified ingestion layer supporting `.csv`, `.tsv`, `.txt` (encoding fallback and delimiter sniffing), `.xlsx` (`openpyxl`), `.xls` (`xlrd`), and multi-page vector `.pdf` tables (`pdfplumber`) with magic-byte verification.
- **Explainable Scoring & Evidence Contract:** Pydantic v2 `ForensicDossier` schema providing sample row indices, offending values, and a `0.0–100.0` Trust Score with a `35.0`-point per-column penalty cap so a single noisy column cannot zero out an entire dataset.
- **Interactive Investigation Workspace:** React 19 + TypeScript interface with severity/category filtering, slide-out evidence inspection drawer, searchable Column Forensic Profiles, and client-side Markdown (`.md`), JSON (`.json`), and print/PDF report exports.

---

### Key engineering challenges

1. **Primary-Key vs. Foreign-Key Disambiguation:** Naive uniqueness checks flag repeating foreign keys (`customer_id`, `manager_id`, `agent_id`, `device_id`) and catalog codes (`product_code`) as primary-key collisions. Solved by combining semantic column-name tokenization with dataset-wide cardinality context (detecting intact 100%-unique primary keys, hierarchy role tokens, and `< 0.80` uniqueness ratios), eliminating `43` false-positive finding instances across `38` benchmark datasets.
2. **Cross-Column Temporal Grain Normalization:** Comparing a sub-day timestamp start column (`transaction_datetime`, e.g., `2024-10-22 21:19:10`) against a calendar-date end column (`settlement_date`, `2024-10-22 00:00:00`) caused false chronological inversions on same-day settlements. Solved by detecting mixed time precision and flooring start timestamps to calendar-day grain (`dt.floor("D")`) across nine token-matched lifecycle pairs.
3. **Format-Specific Fidelity & Edge Cases:** Standard `pandas.read_excel()` coerces literal `"N/A"` strings into `NaN`, hiding disguised sentinel tokens from downstream validity and completeness detectors, while multi-page PDF tables split final single-row continuation records across page boundaries. Solved by disabling default NA coercion (`keep_default_na=False, na_values=[""]`) in Excel ingestion and adding structural continuation-row coalescing in the PDF parser.
4. **Strict RFC 8259 JSON Serialization:** Statistical computations on degenerate columns (all-null, zero-variance, or `±Inf` values) produce `NaN` or `Infinity` floats that cause runtime `ValueError` crashes during JSON serialization. Solved via Pydantic field validators and a recursive `sanitize_for_json()` pass that maps non-finite scalars to `null` while preserving `0` and `0.0`.

---

### Security work

- **Origin & CORS Hardening:** Restricted `CORSMiddleware` and `ErrorHandlerMiddleware` to `https://integris-ten.vercel.app`, anchored preview domains (`^https://integris-ten(-[a-z0-9-]+)?\.vercel\.app$`) via `re.fullmatch`, and verified rejection of suffix-spoofed origins (`https://integris-ten.vercel.app.evil.com`).
- **Input & Upload Hygiene:** Sanitized uploaded filenames to safe basenames via `PurePath`, enforced format-specific byte limits (`50 MB` CSV/TSV/TXT, `25 MB` Excel, `15 MB` PDF), validated magic-byte signatures, capped `.xlsx` uncompressed ZIP size at `250 MB`, and redacted internal details from `HTTP 500` responses.
- **Zero-Retention Execution:** Processed all uploads strictly in volatile RAM (`io.BytesIO`) with zero disk writes or database persistence.

---

### Testing / validation

- **Automated Suites:** `111` backend `pytest` unit/integration tests and `6` frontend `node:test` checks passing (`0` failures, `0` skipped), plus zero-error TypeScript/Vite production builds.
- **Synthetic Corpus Validation (Local):** Evaluated against a 119-dataset multi-format corpus (`104` accepted, `15` adversarial/malformed rejected, `0` crashes/500s), reducing false negatives on supported detectors from `8` to `0` and false-positive finding instances from `71` to `28`.
- **Local Stress Benchmark:** Verified locally against a `45 MB` (`156,310` rows × `26` columns) stress dataset in `~9.7s` with zero serialization errors.

---

### Deployment

- **Frontend:** Hosted on **Vercel** ([https://integris-ten.vercel.app](https://integris-ten.vercel.app)).
- **Backend API:** Hosted on **Render** ([https://integris-sp5o.onrender.com](https://integris-sp5o.onrender.com), health check at `/api/v1/health`).

---

### Suggested resume bullets

- Engineered a stateless data forensics platform (Python, FastAPI, pandas, SciPy, React 19, TypeScript) that ingests `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf` tables in memory and executes six anomaly analyzers with row-level evidence attribution and a capped 0–100 Trust Score.
- Eliminated 43 false-positive findings and reduced supported-detector false negatives from 8 to 0 across a 119-dataset multi-format validation corpus by implementing primary-key vs. foreign-key cardinality disambiguation, calendar-grain temporal normalization, and Excel/PDF parser fidelity fixes.
- Hardened API security and reliability across 111 backend pytest tests by enforcing magic-byte signature verification, `.xlsx` ZIP decompression-bomb limits (250 MB), `PurePath` filename sanitization, anchored `re.fullmatch` CORS validation, and recursive RFC 8259 `NaN`/`Inf` JSON sanitization.
- Built an interactive React 19 + TypeScript forensic investigation workspace with keyboard-accessible finding exploration, column-level statistical dossiers, and client-side Markdown, JSON, and print/PDF audit report exports, deployed across Vercel and Render.
