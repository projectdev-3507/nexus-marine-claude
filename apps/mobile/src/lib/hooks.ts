import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api } from './api';

export function useApi<T = any>(path: string | null, query?: Record<string, unknown>, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({ queryKey: [path, query], queryFn: () => api<T>(path!, { query }), enabled: !!path, ...opts });
}

export function useAction<B = any, R = any>(fn: (b: B) => Promise<R>, opts: { success?: string; onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void qc.invalidateQueries();
      if (opts.success) Alert.alert('Başarılı', opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => Alert.alert('Hata', e.message),
  });
}
