// Bond journey API client: sessionStorage token, Bearer header, no URL secrets.

import {
  DEMO_SESSION_STORAGE_KEY,
  demoAuthHeader,
} from './types';

export const BOND_SCENARIO_ID = 'indian-corporate-bond-review';
export const BOND_CONTENT_REVISION = 1;
export const VERIFIED_ISIN = 'INE001A07RW5';
export const BOND_SNAPSHOT_DATE = '2020-07-31';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8000';

export interface DemoApiError extends Error {
  code: string;
  status: number;
}

export function loadDemoToken(): string | null {
  try {
    return sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveDemoToken(token: string): void {
  sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, token);
}

export function clearDemoToken(): void {
  sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
}

export async function demoFetch(
  path: string,
  token: string,
  init?: RequestInit & { payload?: unknown },
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: demoAuthHeader(token),
  };
  if (init?.headers) {
    Object.assign(headers, init.headers);
  }
  // Mode/provider override headers are never sent: the server resolves only
  // fixture providers regardless of client hints.
  const response = await fetch(`${API_BASE}/api/v2/demo${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.payload !== undefined ? JSON.stringify(init.payload) : undefined,
    signal: init?.signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      (body as { message?: string }).message ?? `demo request failed`,
    ) as DemoApiError;
    error.code = (body as { code?: string }).code ?? `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return body;
}
