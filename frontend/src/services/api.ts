/**
 * API client abstraction for INTEGRIS Forensic Services.
 * Decouples network transport from UI components and provides strict type safety.
 */

import type {
  ForensicDossier,
  HealthResponse,
  InvestigateOptions,
} from '../types/integris';

/**
 * Normalizes an API endpoint URL by stripping trailing slashes and ensuring '/api/v1' suffix.
 */
function normalizeApiUrl(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const clean = raw.trim().replace(/\/+$/, '');
  if (
    clean === 'null' ||
    clean === 'undefined' ||
    (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('/'))
  ) {
    return null;
  }
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. URL search parameter override (e.g., ?api=http://localhost:8000)
    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = normalizeApiUrl(urlParams.get('api') || undefined);
    if (apiParam) {
      return apiParam;
    }

    // 2. Local storage override (if user specified custom endpoint)
    const storedApi = localStorage.getItem('INTEGRIS_API_BASE');
    if (storedApi) {
      // If browsing on a remote domain (e.g., Vercel), do not let a stale localhost override break requests
      const isRemoteHost = !window.location.hostname.includes('localhost') && window.location.hostname !== '127.0.0.1';
      const isStoredLocal = storedApi.includes('localhost') || storedApi.includes('127.0.0.1');
      if (!isRemoteHost || !isStoredLocal) {
        const clean = normalizeApiUrl(storedApi);
        if (clean) return clean;
      }
    }
  }

  // 3. Primary backend endpoint (e.g. Google Cloud Run when configured)
  const primaryUrl = normalizeApiUrl(import.meta.env.VITE_API_PRIMARY_URL as string | undefined);
  if (primaryUrl) {
    return primaryUrl;
  }

  // 4. Default / existing single base URL (preserves exact backward compatibility with VITE_API_BASE_URL)
  const defaultBaseUrl = normalizeApiUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (defaultBaseUrl) {
    return defaultBaseUrl;
  }

  // 5. Secondary / backup backend endpoint (e.g. Render fallback)
  const backupUrl = normalizeApiUrl(import.meta.env.VITE_API_BACKUP_URL as string | undefined);
  if (backupUrl) {
    return backupUrl;
  }

  // 6. Same-origin fallback
  return '/api/v1';
}

/**
 * In-memory active API endpoint selected by the health-checking probe.
 * Defaults to null until a health check establishes connection.
 */
let activeTargetUrl: string | null = null;

export function getActiveApiBaseUrl(): string {
  return activeTargetUrl || getApiBaseUrl();
}

/**
 * Returns configuration metadata describing configured endpoints.
 */
export function getApiEndpointConfig(): {
  primary: string | null;
  backup: string | null;
  active: string;
} {
  const primary = normalizeApiUrl(import.meta.env.VITE_API_PRIMARY_URL as string | undefined);
  const backup =
    normalizeApiUrl(import.meta.env.VITE_API_BACKUP_URL as string | undefined) ||
    normalizeApiUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
  return {
    primary,
    backup,
    active: getActiveApiBaseUrl(),
  };
}

export class IntegrisApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'IntegrisApiError';
  }
}

/**
 * Probes a specific base URL's health endpoint with an abort timeout.
 */
async function probeHealthEndpoint(baseUrl: string, timeoutMs: number = 5000): Promise<HealthResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const json = await response.json();
        if (json?.detail) {
          detail = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail);
        }
      } catch {
        // fallback to statusText
      }
      throw new IntegrisApiError(
        `Health check failed (HTTP ${response.status}): ${detail}`,
        response.status,
      );
    }

    const data: HealthResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof IntegrisApiError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new IntegrisApiError(
        'Health endpoint returned an invalid or non-JSON response.',
        502,
        error,
      );
    }
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    throw new IntegrisApiError(
      isAbort
        ? `Health check timed out after ${timeoutMs}ms at ${baseUrl}/health.`
        : `Unable to connect to INTEGRIS Forensic Engine at ${baseUrl}/health.`,
      0,
      error,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check backend engine health and readiness.
 *
 * When both primary (e.g. Cloud Run) and backup (e.g. Render) endpoints are
 * configured, tests primary first. If primary is unavailable, seamlessly
 * falls back to secondary for subsequent operations.
 */
export async function getHealth(): Promise<HealthResponse> {
  const primaryUrl = normalizeApiUrl(import.meta.env.VITE_API_PRIMARY_URL as string | undefined);
  const backupUrl = normalizeApiUrl(import.meta.env.VITE_API_BACKUP_URL as string | undefined);
  const staticUrl = getApiBaseUrl();

  const hasExplicitParam =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('api');

  // If debugging with explicit ?api= or if primary/backup pair is not configured, probe directly
  if (hasExplicitParam || !primaryUrl || !backupUrl || primaryUrl === backupUrl) {
    const data = await probeHealthEndpoint(staticUrl);
    activeTargetUrl = staticUrl;
    return data;
  }

  // Multi-target architecture: probe primary first
  try {
    const primaryData = await probeHealthEndpoint(primaryUrl, 4000);
    activeTargetUrl = primaryUrl;
    return primaryData;
  } catch (primaryError) {
    console.warn(
      `Primary forensic backend (${primaryUrl}) unavailable. Probing backup (${backupUrl})...`,
      primaryError,
    );
    try {
      const backupData = await probeHealthEndpoint(backupUrl, 5000);
      activeTargetUrl = backupUrl;
      return backupData;
    } catch (backupError) {
      activeTargetUrl = null;
      throw new IntegrisApiError(
        `Both primary (${primaryUrl}) and backup (${backupUrl}) forensic backends are unreachable.`,
        0,
        { primaryError, backupError },
      );
    }
  }
}

/**
 * Submit dataset for forensic integrity investigation.
 */
export async function investigateDataset(
  file: File,
  options?: InvestigateOptions,
): Promise<ForensicDossier> {
  const apiBase = getActiveApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  if (options?.targetColumn && options.targetColumn.trim() !== '') {
    formData.append('target_column', options.targetColumn.trim());
  }
  if (options?.delimiter) {
    formData.append('delimiter', options.delimiter);
  }

  try {
    const response = await fetch(`${apiBase}/investigate`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      let errorDetail = response.statusText;
      try {
        const errJson = await response.json();
        if (errJson?.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText && rawText.length < 300) {
            errorDetail = rawText.trim();
          }
        } catch {
          // ignore
        }
      }
      throw new IntegrisApiError(
        errorDetail || `Forensic investigation failed with HTTP ${response.status}`,
        response.status,
      );
    }

    const dossier: ForensicDossier = await response.json();
    return dossier;
  } catch (error) {
    if (error instanceof IntegrisApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new IntegrisApiError(
        'Server returned an invalid or malformed response during forensic investigation. Check backend service status.',
        502,
        error,
      );
    }

    // Diagnostic check for serverless payload boundary
    const isServerlessHost =
      apiBase.includes('vercel.app') &&
      !apiBase.includes('onrender.com');

    if (file.size > 4.5 * 1024 * 1024 && isServerlessHost) {
      const mbSize = (file.size / (1024 * 1024)).toFixed(1);
      throw new IntegrisApiError(
        `Upload exceeds serverless hosting limit (${mbSize} MB). Vercel Serverless Functions enforce a strict 4.5 MB request body cap. For datasets up to 50 MB, please run the backend engine locally (http://localhost:8000) or connect to a dedicated ASGI host.`,
        413,
        error,
      );
    }

    throw new IntegrisApiError(
      'Network or connection error during forensic investigation. Ensure backend service is reachable.',
      0,
      error,
    );
  }
}
