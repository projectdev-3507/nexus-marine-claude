import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import '../styles/doc.css';

/**
 * Belge düzenleyici yapı taşları — kağıt (A4) görünümünde, metnin üzerine tıklayıp doğrudan düzenlenir.
 * Salt okunur modda (disabled) aynı görünüm düz metin gibi okunur.
 */

/** Metin uzadıkça büyüyen, kenarlıksız metin alanı */
export function AutoText({ value, onChange, className = '', placeholder, disabled, rows = 1 }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; disabled?: boolean; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} className={`doc-input ${className}`} rows={rows} value={value ?? ''} placeholder={disabled ? '' : placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

export function Paper({ children }: { children: ReactNode }) {
  return <div className="paper">{children}</div>;
}

const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function RowTools({ disabled, onUp, onDown, onDelete }: { disabled?: boolean; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  if (disabled) return null;
  return (
    <span className="row-tools">
      <button type="button" title="Yukarı taşı" onClick={onUp}><ArrowUp /></button>
      <button type="button" title="Aşağı taşı" onClick={onDown}><ArrowDown /></button>
      <button type="button" title="Sil" className="del" onClick={() => confirm('Bu satır silinsin mi?') && onDelete()}><Trash2 /></button>
    </span>
  );
}

export function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  if (disabled) return null;
  return <button type="button" className="doc-add" onClick={onClick}><Plus /> {label}</button>;
}

export interface Item { title?: string; text: string }

/** Başlıklı maddeler: "• Başlık: metin" veya "1. Başlık: metin" */
export function ItemList({ items, onChange, disabled, numbered, withTitle = true, addLabel = 'Madde ekle' }: { items: Item[]; onChange: (v: Item[]) => void; disabled?: boolean; numbered?: boolean; withTitle?: boolean; addLabel?: string }) {
  const list = items ?? [];
  const set = (i: number, patch: Partial<Item>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="doc-list">
      {list.map((it, i) => (
        <div key={i} className="doc-li">
          <span className="doc-bullet">{numbered ? `${i + 1}.` : '•'}</span>
          <div className="doc-li-body">
            {withTitle && (it.title !== undefined || !disabled) && (
              <AutoText className="doc-li-title" value={it.title ?? ''} placeholder="Başlık (isteğe bağlı)" disabled={disabled} onChange={(v) => set(i, { title: v })} />
            )}
            <AutoText value={it.text} placeholder="Metin" disabled={disabled} onChange={(v) => set(i, { text: v })} />
          </div>
          <RowTools disabled={disabled} onUp={() => onChange(move(list, i, -1))} onDown={() => onChange(move(list, i, 1))} onDelete={() => onChange(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton disabled={disabled} label={addLabel} onClick={() => onChange([...list, withTitle ? { title: '', text: '' } : { text: '' }])} />
    </div>
  );
}

/** Düz metin maddeleri (paragraf listesi) */
export function TextList({ items, onChange, disabled, addLabel = 'Paragraf ekle', bullet = '•' }: { items: string[]; onChange: (v: string[]) => void; disabled?: boolean; addLabel?: string; bullet?: string }) {
  const list = items ?? [];
  return (
    <div className="doc-list">
      {list.map((t, i) => (
        <div key={i} className="doc-li">
          <span className="doc-bullet">{bullet}</span>
          <div className="doc-li-body"><AutoText value={t} disabled={disabled} onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))} /></div>
          <RowTools disabled={disabled} onUp={() => onChange(move(list, i, -1))} onDown={() => onChange(move(list, i, 1))} onDelete={() => onChange(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton disabled={disabled} label={addLabel} onClick={() => onChange([...list, ''])} />
    </div>
  );
}

export interface TableRow { name: string; quantity: string; unit: string }

/** Alan / miktar tablosu */
export function QtyTable({ rows, onChange, disabled }: { rows: TableRow[]; onChange: (v: TableRow[]) => void; disabled?: boolean }) {
  const list = rows ?? [];
  const set = (i: number, patch: Partial<TableRow>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead><tr><th style={{ width: 36 }}>No</th><th>Uygulama</th><th style={{ width: 90 }}>Miktar</th><th style={{ width: 80 }}>Birim</th>{!disabled && <th style={{ width: 70 }} />}</tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><AutoText value={r.name} disabled={disabled} onChange={(v) => set(i, { name: v })} /></td>
              <td><AutoText value={r.quantity} disabled={disabled} onChange={(v) => set(i, { quantity: v })} /></td>
              <td><AutoText value={r.unit} disabled={disabled} onChange={(v) => set(i, { unit: v })} /></td>
              {!disabled && <td><RowTools onUp={() => onChange(move(list, i, -1))} onDown={() => onChange(move(list, i, 1))} onDelete={() => onChange(list.filter((_, j) => j !== i))} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      <AddButton disabled={disabled} label="Satır ekle" onClick={() => onChange([...list, { name: '', quantity: '', unit: 'm²' }])} />
    </div>
  );
}

export interface Section { code?: string; title: string; intro?: string; items: Item[]; bullets?: string[]; tableTitle?: string; table?: TableRow[] }

/** Harfli bölüm (A., B., C. ...) — başlık, giriş, maddeler, madde işaretleri ve isteğe bağlı tablo */
export function SectionList({ sections, onChange, disabled, numberedItems, addLabel = 'Bölüm ekle' }: { sections: Section[]; onChange: (v: Section[]) => void; disabled?: boolean; numberedItems?: boolean; addLabel?: string }) {
  const list = sections ?? [];
  const set = (i: number, patch: Partial<Section>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="doc-sections">
      {list.map((s, i) => (
        <div key={i} className="doc-sec">
          <div className="doc-sec-head">
            <AutoText className="doc-code" value={s.code ?? ''} disabled={disabled} onChange={(v) => set(i, { code: v })} />
            <AutoText className="doc-h3" value={s.title} placeholder="Bölüm başlığı" disabled={disabled} onChange={(v) => set(i, { title: v })} />
            <RowTools disabled={disabled} onUp={() => onChange(move(list, i, -1))} onDown={() => onChange(move(list, i, 1))} onDelete={() => onChange(list.filter((_, j) => j !== i))} />
          </div>
          {(s.intro !== undefined || !disabled) && <AutoText className="doc-p" value={s.intro ?? ''} placeholder="Giriş metni (isteğe bağlı)" disabled={disabled} onChange={(v) => set(i, { intro: v })} />}
          {(s.items?.length > 0 || !disabled) && <ItemList items={s.items ?? []} numbered={numberedItems} disabled={disabled} onChange={(v) => set(i, { items: v })} />}
          {(s.bullets?.length ?? 0) > 0 && <TextList items={s.bullets ?? []} disabled={disabled} addLabel="Bilgi satırı ekle" onChange={(v) => set(i, { bullets: v })} />}
          {s.table && (
            <>
              <AutoText className="doc-p strong" value={s.tableTitle ?? 'Uygulama Alan Tablosu'} disabled={disabled} onChange={(v) => set(i, { tableTitle: v })} />
              <QtyTable rows={s.table} disabled={disabled} onChange={(v) => set(i, { table: v })} />
            </>
          )}
          {!disabled && (
            <div className="row-wrap" style={{ gap: 6 }}>
              {!s.bullets?.length && <button type="button" className="doc-add" onClick={() => set(i, { bullets: [''] })}><Plus /> Bilgi satırı</button>}
              {!s.table && <button type="button" className="doc-add" onClick={() => set(i, { table: [{ name: '', quantity: '', unit: 'm²' }], tableTitle: 'Uygulama Alan Tablosu' })}><Plus /> Tablo</button>}
            </div>
          )}
        </div>
      ))}
      <AddButton disabled={disabled} label={addLabel} onClick={() => onChange([...list, { code: String.fromCharCode(65 + list.length), title: '', items: [] }])} />
    </div>
  );
}

/** İmza kutuları */
export function SignBoxes({ boxes }: { boxes: Array<{ head: string; children: ReactNode }> }) {
  return (
    <div className="doc-signs" style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}>
      {boxes.map((b, i) => (
        <div key={i} className="doc-sign">
          <b>{b.head}</b>
          {b.children}
        </div>
      ))}
    </div>
  );
}
