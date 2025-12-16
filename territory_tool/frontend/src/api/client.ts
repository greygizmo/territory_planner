import type {
  ConfigResponse,
  OptimizeRequest,
  OptimizeResponse,
  EvaluateRequest,
  EvaluateResponse,
  ExportCsvRequest,
  HealthResponse,
} from '../types';

const API_BASE = '/api';

// ============================================================================
// Error Handling
// ============================================================================

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// API Functions
// ============================================================================

export async function healthCheck(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(response);
}

export async function getConfig(): Promise<ConfigResponse> {
  const response = await fetch(`${API_BASE}/config`);
  return handleResponse<ConfigResponse>(response);
}

export async function getZipToState(): Promise<Record<string, string>> {
  const response = await fetch(`${API_BASE}/zip_to_state`);
  return handleResponse<Record<string, string>>(response);
}

export async function optimize(request: OptimizeRequest): Promise<OptimizeResponse> {
  const response = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  return handleResponse<OptimizeResponse>(response);
}

export async function evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
  const response = await fetch(`${API_BASE}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  return handleResponse<EvaluateResponse>(response);
}

export async function exportCsv(request: ExportCsvRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }

  return response.blob();
}

// ============================================================================
// API Client Object
// ============================================================================

export const api = {
  healthCheck,
  getConfig,
  getZipToState,
  optimize,
  evaluate,
  exportCsv,
};

export default api;

