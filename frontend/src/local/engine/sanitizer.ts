/**
 * INTEGRIS Local Engine — JSON Payload Sanitizer
 * Mirrors backend/app/engine/sanitizer.py to ensure no NaN/Infinity or oversized
 * strings appear in the ForensicDossier payload.
 */

const MAX_STRING_LENGTH = 500;

export function sanitizeForJson<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }

  if (typeof obj === 'boolean') {
    return obj;
  }

  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      return null as unknown as T;
    }
    return obj;
  }

  if (typeof obj === 'string') {
    if (obj.length > MAX_STRING_LENGTH) {
      return (obj.slice(0, MAX_STRING_LENGTH - 3) + '...') as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForJson(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[String(k)] = sanitizeForJson(v);
    }
    return out as T;
  }

  return String(obj) as unknown as T;
}
