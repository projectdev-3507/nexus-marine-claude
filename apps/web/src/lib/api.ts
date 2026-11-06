const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'nexus.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`${BASE}/api${path}`, window.location.origin);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url.toString(), {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && token) onUnauthorized?.();
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const details = (data as any)?.details;
    const fieldErr = details?.fieldErrors ? Object.entries(details.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join(' · ') : '';
    throw new ApiError(res.status, [(data as any)?.error ?? 'İstek başarısız', fieldErr].filter(Boolean).join(' — '), details);
  }
  return data as T;
}

/** Kimlik doğrulamalı dosya/PDF bağlantısı */
export const fileUrl = (id: string, download = false) => `${BASE}/api/files/${id}/raw?token=${encodeURIComponent(tokenStore.get() ?? '')}${download ? '&download=1' : ''}`;
export const authedUrl = (path: string) => `${BASE}/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(tokenStore.get() ?? '')}`;

export async function uploadFiles(entityType: string, entityId: string, files: File[] | FileList, extra: { caption?: string; tag?: string; customerVisible?: boolean } = {}) {
  const fd = new FormData();
  fd.append('entityType', entityType);
  fd.append('entityId', entityId);
  if (extra.caption) fd.append('caption', extra.caption);
  if (extra.tag) fd.append('tag', extra.tag);
  if (extra.customerVisible !== undefined) fd.append('customerVisible', String(extra.customerVisible));
  for (const f of Array.from(files)) fd.append('files', f);
  return api<any[]>('/files', { form: fd, method: 'POST' });
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
