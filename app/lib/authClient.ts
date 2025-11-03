// app/lib/authClient.ts
import { Platform } from 'react-native';
import { getAccess, getRefresh, saveTokens } from './auth';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

// <-- this is the ONLY getAccessToken used by sockets & API clients
export async function getAccessToken(): Promise<string | null> {
  return getAccess(); // reads SecureStore key 'wh_access'
}

/** Get /me with auto refresh */
export async function fetchMe<T = any>(): Promise<T> {
  let access = await getAccess();
  const refresh = await getRefresh();

  const call = async (token: string) => {
    const r = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };

  try {
    if (access) return await call(access);
  } catch (e: any) {
    if (String(e?.message) !== '401' || !refresh) throw e;
  }

  if (!refresh) throw new Error('no_tokens');

  // refresh once
  const rr = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!rr.ok) throw new Error('unauthorized');

  const data = await rr.json();
  if (!data?.access) throw new Error('unauthorized');

  await saveTokens(data.access, refresh);
  return call(data.access);
}

/** Authenticated fetch with auto refresh */
export async function authFetch(path: string, init: RequestInit = {}) {
  let access = await getAccess();
  const refresh = await getRefresh();

  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });

  if (!access && !refresh) throw new Error('no_tokens');

  if (access) {
    const r = await doFetch(access);
    if (r.status !== 401) return r;
  }

  if (!refresh) throw new Error('unauthorized');

  // refresh once
  const rr = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!rr.ok) throw new Error('unauthorized');

  const data = await rr.json();
  if (!data?.access) throw new Error('unauthorized');

  await saveTokens(data.access, refresh);
  return doFetch(data.access);
}

export async function authJson<T>(path: string, init: RequestInit = {}) {
  const r = await authFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) {
    throw new Error((await r.text().catch(() => '')) || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}
