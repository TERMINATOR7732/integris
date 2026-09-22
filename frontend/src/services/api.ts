/**
 * API client abstraction for INTEGRIS Forensic Services.
 * Decouples network transport from UI components and provides strict type safety.
 */

import type {
  ForensicDossier,
  HealthResponse,
  InvestigateOptions,
} from '../types/integris';

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = rawBaseUrl
  ? `${rawBaseUrl.replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

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
  try {
    const response = await fetch(`${API_BASE}/health`, {
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
      `Unable to connect to INTEGRIS Forensic Engine at ${API_BASE}/health. Ensure backend is running.`,
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
  const formData = new FormData();
  formData.append('file', file);

  if (options?.targetColumn && options.targetColumn.trim() !== '') {
    formData.append('target_column', options.targetColumn.trim());
  }
  if (options?.delimiter) {
    formData.append('delimiter', options.delimiter);
  }

  try {
    const response = await fetch(`${API_BASE}/investigate`, {
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
        // use statusText
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
    throw new IntegrisApiError(
      'Network or connection error during forensic investigation. Ensure backend service is reachable.',
      0,
      error,
    );
  }
}
