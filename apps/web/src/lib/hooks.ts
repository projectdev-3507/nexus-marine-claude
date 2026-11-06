import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useToast } from '../components/ui';

export function useApi<T = any>(path: string | null, query?: Record<string, unknown>, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: [path, query],
    queryFn: () => api<T>(path!, { query }),
    enabled: !!path,
    ...opts,
  });
}

/** POST/PUT/PATCH yardımcı — başarıda sorguları yeniler ve bildirim gösterir */
export function useAction<TBody = any, TRes = any>(fn: (body: TBody) => Promise<TRes>, opts: { success?: string; invalidate?: boolean; onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.invalidate !== false) void qc.invalidateQueries();
      if (opts.success) toast(opts.success, 'success');
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Liste sayfaları için arama/sıralama/sayfalama durumu */
export function useListState(defaults: { sort?: string; order?: 'asc' | 'desc'; pageSize?: number } = {}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' } | undefined>(defaults.sort ? { key: defaults.sort, order: defaults.order ?? 'desc' } : undefined);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq]);
  return {
    q,
    setQ,
    page,
    setPage,
    sort,
    onSort: (key: string) => setSort((s) => ({ key, order: s?.key === key && s.order === 'desc' ? 'asc' : 'desc' })),
    query: { q: dq || undefined, page, pageSize: defaults.pageSize ?? 25, sort: sort?.key, order: sort?.order },
  };
}
