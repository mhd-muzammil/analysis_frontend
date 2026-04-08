/**
 * JWT authentication module.
 * Manages access/refresh tokens and provides authenticated fetch.
 */

// Resolve API base URL: in production, use env var; in dev, use Vite proxy
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// ── Token storage ──

const ACCESS_KEY = 'oc_access_token';
const REFRESH_KEY = 'oc_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Auth API calls ──

export interface LoginResponse {
  access: string;
  refresh: string;
  user: { id: number; username: string; is_staff: boolean };
}

export async function loginApi(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const resp = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `Login failed (${resp.status})`);
  }

  const data: LoginResponse = await resp.json();
  setTokens(data.access, data.refresh);
  return data;
}

// ── Token refresh with de-duplication lock ──

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in flight, piggyback on it
  if (refreshPromise) return refreshPromise;

  refreshPromise = _doRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function _doRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const resp = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });

    if (!resp.ok) {
      // Token is genuinely invalid/expired — clear and force re-login
      clearTokens();
      return null;
    }

    const data = await resp.json();
    setTokens(data.access, data.refresh);
    return data.access;
  } catch (err) {
    // Network error — DON'T clear tokens (transient failure)
    console.error('Token refresh network error:', err);
    return null;
  }
}

// ── Authenticated fetch wrapper ──

/**
 * Wrapper around fetch that automatically injects JWT Authorization header.
 * If the access token is expired (401), attempts a silent refresh and retries once.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getAccessToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let resp: Response;
  try {
    resp = await fetch(url, { ...options, headers });
  } catch (err) {
    // Network error — throw a descriptive error
    throw new Error('Network error — please check your connection.');
  }

  // If 401, try refreshing the token once
  if (resp.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      resp = await fetch(url, { ...options, headers });
    }
  }

  return resp;
}
