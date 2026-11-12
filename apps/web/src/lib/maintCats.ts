import { useApi } from './hooks';
import { CATEGORY_LABELS, CATEGORY_SHORT } from './labels';

/** Bakım başlıkları (dinamik): API'den gelir, etiket sözlükleri yerinde güncellenir */
export interface MaintCat { key: string; label: string; short: string; items: string[]; color: string; isActive: boolean; builtIn: boolean; sortOrder: number }

let current: MaintCat[] = [];
let lastData: unknown = null;

function apply(list: MaintCat[]) {
  current = list;
  for (const c of list) {
    CATEGORY_LABELS[c.key] = c.label;
    CATEGORY_SHORT[c.key] = c.short || c.label;
  }
}

/** Uygulama genelinde başlıkları yükler; bileşen başlıklar değişince yeniden çizilir */
export function useMaintCats(enabled = true) {
  const q = useApi<MaintCat[]>(enabled ? '/maintenance-categories' : null, undefined, { staleTime: 5 * 60_000 });
  if (q.data && q.data !== lastData) {
    lastData = q.data;
    apply(q.data);
  }
  const all = q.data ?? current;
  return { all, active: all.filter((c) => c.isActive), loading: q.isLoading };
}

/** Seçim listeleri için etkin başlıklar */
export const activeMaintCats = () => current.filter((c) => c.isActive);
/** Başlığın alt türleri (öneri listesi) */
export const maintItems = (key?: string | null) => current.find((c) => c.key === key)?.items ?? [];
export const maintColor = (key: string, i = 0) => current.find((c) => c.key === key)?.color ?? ['#0B2342', '#1767AD', '#5b9bd8', '#a9cdf0'][i % 4];
