"""Module execution entry point for `python -m app.offline`."""

from pathlib import Path
import sys

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.offline.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
