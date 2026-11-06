import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X, Inbox, CheckCircle2, AlertTriangle, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Tone } from '../lib/labels';
import { initials } from '../lib/format';

export function Badge({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge b-${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ map, labels, value }: { map: Record<string, Tone>; labels: Record<string, string>; value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return <Badge tone={map[value] ?? 'neutral'}>{labels[value] ?? value}</Badge>;
}

export function Card({ title, action, children, pad, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div className={pad === false ? '' : title ? 'card-body' : 'card-pad'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        {crumbs && <div className="breadcrumb">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Kapat">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" className={`tab${t.key === value ? ' active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([k, l]) => (
        <button key={k} className={k === value ? 'active' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title = 'Kayıt bulunamadı', text, icon }: { title?: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <b>{title}</b>
      {text && <span className="small">{text}</span>}
    </div>
  );
}

export const Spinner = () => <div className="spinner" />;
export const Loading = () => (
  <div className="loading-box">
    <Spinner />
  </div>
);

export function Avatar({ name, size }: { name?: string | null; size?: 'sm' | 'lg' }) {
  return <div className={`avatar ${size ?? ''}`}>{initials(name)}</div>;
}

export function Progress({ value, ok }: { value: number; ok?: boolean }) {
  return (
    <div className={`progress${ok || value >= 100 ? ' ok' : ''}`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Ara...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Search />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function KV({ items, cols }: { items: Array<[string, ReactNode]>; cols?: number }) {
  return (
    <dl className="kv" style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────── Data table ─────────
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  align?: 'right' | 'center';
  hideMobile?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  sort,
  onSort,
  loading,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (r: T) => void;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  loading?: boolean;
  empty?: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width, textAlign: c.align }}
                className={c.sortable ? 'sortable' : ''}
                onClick={() => c.sortable && onSort?.(c.key)}
              >
                {c.label}
                {sort?.key === c.key && (sort.order === 'asc' ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <div className="skeleton" style={{ height: 14, width: '70%' }} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows.map((r) => (
              <tr key={r.id} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} data-label={c.label} style={{ textAlign: c.align }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && (empty ?? <Empty />)}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>
        {total === 0 ? 'Kayıt yok' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total} kayıt`}
      </span>
      <div className="row">
        <button className="btn btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Önceki">
          <ChevronLeft />
        </button>
        <span className="mono">
          {page} / {pages}
        </span>
        <button className="btn btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Sonraki">
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

// ───────── Toasts ─────────
type ToastT = { id: number; text: string; kind: 'success' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, kind?: ToastT['kind']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, kind: ToastT['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Confirm({ open, title, text, onConfirm, onClose, danger, confirmLabel = 'Onayla', children }: { open: boolean; title: string; text?: ReactNode; onConfirm: () => void; onClose: () => void; danger?: boolean; confirmLabel?: string; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {text && <p className="muted">{text}</p>}
      {children}
    </Modal>
  );
}
