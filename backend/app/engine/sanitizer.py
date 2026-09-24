"""Defensive serialization and non-finite numeric sanitization for INTEGRIS.

Ensures that NaN, +Infinity, and -Infinity values in any data structure
are safely converted to None (JSON null) before serialization, preserving
standard JSON compliance (RFC 8259) and preventing Starlette ValueError crashes.
"""

import math
from typing import Any
import numpy as np
from pydantic import BaseModel


def sanitize_scalar(val: Any) -> Any:
    """Sanitize a single scalar value for strict JSON serialization.
    
    - Non-finite floats (NaN, +Inf, -Inf) -> None
    - Pandas/NumPy NA / NaT -> None
    - NumPy integers / floats / booleans -> Native Python int / float / bool
    - Valid finite numbers remain unchanged numeric types (undefined != 0)
    """
    if val is None:
        return None
    # Check for pandas/numpy NA types
    try:
        import pandas as pd
        if pd.isna(val):
            return None
    except ImportError:
        pass

    if isinstance(val, (np.floating, float)):
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return f_val

    if isinstance(val, (np.bool_, bool)):
        return bool(val)

    if isinstance(val, (np.integer, int)):
        return int(val)

    # Sanitize spreadsheet formula injection tokens for display safety
    str_val = str(val)
    if str_val.startswith(("=", "+", "-", "@", "\t", "\r")) and len(str_val) > 1:
        # Only prefix if not a standard negative/positive number
        try:
            float(str_val)
        except ValueError:
            return f"'{str_val}"
    return str_val


def sanitize_for_json(obj: Any) -> Any:
    """Recursively sanitize data structures for strict JSON serialization.
    
    Traverses dicts, lists, tuples, Pydantic models, NumPy arrays, and scalars.
    Converts:
        - NaN -> None
        - +Infinity -> None
        - -Infinity -> None
        - NumPy scalars -> Native Python types
        
    Preserves:
        - Valid finite numbers (float/int)
        - Strings, booleans, None
        - Dict keys and list ordering
    """
    if obj is None:
        return None

    if isinstance(obj, BaseModel):
        return sanitize_for_json(obj.model_dump(mode="json"))

    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}

    if isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]

    if isinstance(obj, tuple):
        return [sanitize_for_json(item) for item in obj]

    if isinstance(obj, set):
        return [sanitize_for_json(item) for item in sorted(obj, key=str)]

    if isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())

    # Float handling
    if isinstance(obj, (np.floating, float)):
        f_val = float(obj)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return f_val

    # Boolean handling (must precede int because bool is a subclass of int in Python)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)

    # Integer handling
    if isinstance(obj, (np.integer, int)):
        return int(obj)

    # Pandas/numpy NA check
    try:
        import pandas as pd
        if pd.isna(obj):
            return None
    except ImportError:
        pass

    return obj
