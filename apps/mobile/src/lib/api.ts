import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Ortak backend API adresi. EXPO_PUBLIC_API_URL veya app.json → extra.apiUrl */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as any)?.apiUrl ?? 'http://localhost:4000').replace(/\/$/, '');

const KEY = 'nexus.token';
let token: string | null = null;

export const tokenStore = {
  async load() {
    try {
      token = Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    } catch {
      token = null;
    }
    return token;
  },
  async set(t: string | null) {
    token = t;
    try {
      if (Platform.OS === 'web') t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);
      else if (t) await SecureStore.setItemAsync(KEY, t);
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* ignore */
    }
  },
  get: () => token,
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; query?: Record<string, unknown> } = {}): Promise<T> {
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api${path}${qs}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && token) onUnauthorized?.();
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error ?? 'İstek başarısız');
  return data as T;
}

export const fileUrl = (id: string) => `${API_URL}/api/files/${id}/raw?token=${encodeURIComponent(token ?? '')}`;
export const authedUrl = (path: string) => `${API_URL}/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token ?? '')}`;

/** Kamera/galeri fotoğrafını ilgili kayda yükler */
export async function uploadPhoto(entityType: string, entityId: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null }, extra: { tag?: string } = {}) {
  const fd = new FormData();
  fd.append('entityType', entityType);
  fd.append('entityId', entityId);
  if (extra.tag) fd.append('tag', extra.tag);
  const name = asset.fileName ?? `foto-${Date.now()}.jpg`;
  const type = asset.mimeType ?? 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    fd.append('files', blob, name);
  } else {
    fd.append('files', { uri: asset.uri, name, type } as any);
  }
  return api<any[]>('/files', { form: fd, method: 'POST' });
}
