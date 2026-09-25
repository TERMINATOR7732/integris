# INTEGRIS — Security Posture & Hardening

This document summarizes the security controls, operational boundaries, and audit history implemented in INTEGRIS as of production baseline `4558912`. For full audit evidence, see [`INTEGRIS_PHASE8_QA_REPORT.md`](../INTEGRIS_PHASE8_QA_REPORT.md) and [`INTEGRIS_PHASE9_HARDENING_REPORT.md`](../INTEGRIS_PHASE9_HARDENING_REPORT.md).

---

## 1. CORS Policy & Origin Validation

INTEGRIS restricts cross-origin browser requests to authorized frontend origins (`backend/app/core/config.py`, `backend/app/main.py`):

- **Explicit Allowed Origins (`CORS_ORIGINS`):**
  - `https://integris-ten.vercel.app` (Production Vercel frontend)
  - `http://localhost:5173` & `http://127.0.0.1:5173` (Local Vite dev server)
  - `http://localhost:4173` & `http://127.0.0.1:4173` (Local Vite preview server)
- **Anchored Preview Origin Regex (`CORS_ORIGIN_REGEX`):**
  - Strictly anchored to `^https://integris-ten(-[a-z0-9-]+)?\.vercel\.app$`.
  - If a legacy unanchored wildcard (`https://.*\.vercel\.app`) is present in container environment variables, `_load_cors_origin_regex()` automatically upgrades it to the anchored `integris-ten` pattern at startup.
- **Full-String Matching on Error Responses (`ErrorHandlerMiddleware`):**
  - When an unhandled server exception occurs (`HTTP 500`), `ErrorHandlerMiddleware` validates the `Origin` header using `re.fullmatch(settings.CORS_ORIGIN_REGEX, origin)` rather than prefix matching (`re.match`).
  - Suffix-spoofed origins (e.g., `https://integris-ten.vercel.app.evil.com`), foreign Vercel deployments (`https://evil.vercel.app`), and arbitrary external domains (`https://example.com`) do not receive `Access-Control-Allow-Origin` headers on either `200` or `500` responses.

---

## 2. Uploaded Filename Sanitization

In `backend/app/api/routes.py`, `_sanitize_upload_filename()` normalizes client-supplied `UploadFile.filename` values before extension validation, ingestion, or metadata serialization:

- Normalizes backslashes to forward slashes and extracts the final path component via `PurePath(raw_filename.replace("\\", "/")).name.strip()`.
- Strips any Windows drive prefixes (`C:`) and falls back to `"dataset.csv"` if the resulting basename is empty, `"."`, or `".."`.
- Prevents POSIX traversal strings (`../../etc/passwd.csv` → `passwd.csv`), Windows traversal strings (`..\..\secret.xlsx` → `secret.xlsx`), and client filesystem paths (`C:\Users\Admin\secret.csv` → `secret.csv`, `/tmp/data.csv` → `data.csv`) from being echoed in `InvestigationMetadata.file_name` or exported Markdown/JSON reports.

---

## 3. Upload Size, Structural & Decompression Boundaries

INTEGRIS enforces multi-layer resource bounds before and during parsing:

- **Extension Allowlist (`config.py`):** Only `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf` are accepted (`HTTP 400` otherwise).
- **Format-Specific Byte Limits (`config.py`, `routes.py`):** Reads at most `max_bytes + 1` into memory (`await file.read(max_bytes + 1)`) and rejects oversized payloads with `HTTP 413`:
  - `.csv`, `.tsv`, `.txt`: `50 MB` (`52,428,800` bytes)
  - `.xlsx`, `.xls`: `25 MB` (`26,214,400` bytes)
  - `.pdf`: `15 MB` (`15,728,640` bytes)
- **Magic-Byte Signature Verification (`backend/app/ingestion/detector.py`):**
  - Verifies binary file signatures (`%PDF` for PDF, `PK\x03\x04` for XLSX, `\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1` for XLS) against declared file extensions and rejects binary null-byte (`\x00`) streams renamed to `.csv`/`.tsv`/`.txt` (`HTTP 400`).
- **Excel Decompression Bomb Guard (`backend/app/ingestion/excel_parser.py`):**
  - Inspects `.xlsx` ZIP entry headers prior to extraction and aborts with `HTTP 400` if total uncompressed size exceeds `MAX_EXCEL_UNCOMPRESSED_BYTES = 250 MB`.
- **Post-Parse DataFrame Dimension Limits (`routes.py`):**
  - Rejects datasets exceeding `MAX_DATASET_ROWS = 500,000` or `MAX_DATASET_COLUMNS = 1,000` (`HTTP 413`), as well as `0`-byte or `0`-row datasets (`HTTP 400`).

---

## 4. Volatile In-Memory Processing (Zero Retention)

- Uploaded file streams are processed strictly in RAM via `io.BytesIO(content)` and pandas DataFrames.
- Static and empirical audits (`INTEGRIS_PHASE8_QA_REPORT.md`, Section 5.1) verified zero usage of `tempfile`, `NamedTemporaryFile`, disk writes (`open(..., "w")`, `Path.write_bytes`), database connections, shell/subprocess calls (`subprocess`, `os.system`), or dynamic code evaluation (`eval`, `exec`).
- No uploaded datasets or generated dossiers are persisted on the server.

---

## 5. Error Handling & Information Redaction

- **Controlled Client Errors:** Malformed files, unsupported extensions, magic-byte mismatches, and empty tables return descriptive `HTTP 400` or `HTTP 413` JSON responses without exposing internal file paths or parser tracebacks.
- **Redacted Server Errors:** Unhandled exceptions in `routes.py` or `ErrorHandlerMiddleware` return `HTTP 500` with only the exception class name:
  ```json
  {
    "detail": "Forensic engine encountered an internal server error: RuntimeError."
  }
  ```
- **Strict RFC 8259 JSON Sanitization (`backend/app/engine/sanitizer.py`):** All output payloads are recursively sanitized so `NaN`, `+Inf`, `-Inf`, `pd.NA`, and `pd.NaT` are converted to `null` (`None`), preventing serialization crashes on degenerate numeric data.

---

## 6. Secret & Configuration Hygiene

- INTEGRIS requires zero API keys, database credentials, or third-party secrets.
- Only `.env.example`, `backend/.env.example`, and `frontend/.env.example` are tracked in Git; `.env` files are gitignored.

---

## 7. Security Regression Tests

Automated security and boundary tests in `backend/tests/test_nan_hardening.py`, `backend/tests/test_ingestion_formats.py`, and `backend/tests/test_pipeline_e2e.py` verify:

- Authorized CORS origins (`https://integris-ten.vercel.app`, `https://integris-ten-git-main-terminator7732.vercel.app`, `http://localhost:5173`, `http://127.0.0.1:5173`) on `200` and `500` responses.
- Rejection of spoofed and unauthorized origins (`https://integris-ten.vercel.app.evil.com`, `https://evil.vercel.app`, `https://example.com`, `https://malicious-attacker.com`) on `200` and `500` responses.
- Basename sanitization across POSIX traversal (`../../etc/passwd.csv`), Windows traversal (`..\..\secret.xlsx`), absolute paths (`C:\Users\Admin\secret.csv`, `/tmp/data.csv`), and empty/dot fallbacks (`""`, `".."` → `"dataset.csv"`).
- Rejection of oversized files (`413`), wrong-extension binary payloads (`400`), corrupted archives (`400`), and stack-trace redaction on simulated `500` crashes.

---

## 8. Known Limitations

- **Unauthenticated Public Endpoint:** The `/api/v1/investigate` endpoint is intentionally public for portfolio and demonstration access and does not implement user authentication or application-layer per-IP rate limiting beyond platform edge protections.
- **In-Memory Resource Contention:** Because analysis runs synchronously in container memory, concurrent multi-megabyte uploads on a free-tier container can contend for RAM.
- **No Antivirus / Content Scanning:** The backend validates file structure and magic bytes and never executes uploaded content, but does not run external malware signature scanning.
