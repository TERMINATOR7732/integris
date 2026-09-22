/**
 * API client abstraction for INTEGRIS Forensic Services.
 * Decouples network transport from UI components and provides strict type safety.
 */

import type {
  ForensicDossier,
  HealthResponse,
  InvestigateOptions,
} from '../types/integris';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. URL search parameter override (e.g., ?api=http://localhost:8000)
    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = urlParams.get('api')?.trim();
    if (apiParam) {
      return `${apiParam.replace(/\/+$/, '')}/api/v1`;
    }

    // 2. Local storage override (if user specified custom endpoint)
    const storedApi = localStorage.getItem('INTEGRIS_API_BASE')?.trim();
    if (storedApi) {
      return `${storedApi.replace(/\/+$/, '')}/api/v1`;
    }
  }

  // 3. Vite environment variable (default build target)
  const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  return rawBaseUrl
    ? `${rawBaseUrl.replace(/\/+$/, '')}/api/v1`
    : '/api/v1';
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
 * Check backend engine health and readiness.
 */
export async function getHealth(): Promise<HealthResponse> {
  const apiBase = getApiBaseUrl();
  try {
    const response = await fetch(`${apiBase}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
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
    throw new IntegrisApiError(
      `Unable to connect to INTEGRIS Forensic Engine at ${apiBase}/health. Ensure backend is running.`,
      0,
      error,
    );
  }
}

/**
 * Submit dataset for forensic integrity investigation.
 */
export async function investigateDataset(
  file: File,
  options?: InvestigateOptions,
): Promise<ForensicDossier> {
  const apiBase = getApiBaseUrl();
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

    // Diagnostic check for serverless payload boundary
    const isServerlessHost =
      apiBase.includes('vercel.app') ||
      (!apiBase.includes('localhost') &&
        !apiBase.includes('127.0.0.1') &&
        !apiBase.startsWith('/'));

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
