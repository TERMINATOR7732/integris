# INTEGRIS — Backend Engine & API

Forensic computation service and data integrity analysis contract for INTEGRIS.

## Architecture

- **Framework:** FastAPI (ASGI async framework)
- **Validation:** Pydantic V2
- **Protocol:** REST with JSON Forensic Dossier contract
- **Zero-Retention:** In-memory stream processing; no raw dataset records are stored or persisted.

## Local Setup

### 1. Environment & Dependencies

```bash
# Create virtual environment
python -m venv .venv

# Activate on Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Install minimum dependencies
pip install -r requirements.txt
```

### 2. Run the Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

- API Base: `http://localhost:8000`
- Health Endpoint: `http://localhost:8000/api/v1/health`
- Interactive Swagger Docs: `http://localhost:8000/docs`

### 3. Run Tests

```bash
pytest
```
