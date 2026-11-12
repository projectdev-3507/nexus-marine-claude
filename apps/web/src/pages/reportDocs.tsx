import { Trash2, RotateCcw } from 'lucide-react';
import { AutoText, EditTable, FreeSections, ItemList, Paper, SectionList, SignBoxes, type ECol } from '../components/docEditor';

/** Belge düzenleyicileri — admin'in ilettiği örnek belgelerle birebir yerleşim */
type P = { d: any; set: (k: string, v: any) => void; disabled?: boolean; approval?: { by?: string | null; at?: string | null } | null };

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '');

// ───────────────────────── Proje Teklif Dosyası ─────────────────────────
export function ProposalDoc({ d, set, disabled, approval }: P) {
  const T = (k: string, cls = '', ph?: string) => <AutoText className={cls} value={d[k] ?? ''} placeholder={ph} disabled={disabled} onChange={(v) => set(k, v)} />;
  return (
    <Paper>
      {T('company', 'doc-company')}
      {T('docTitle', 'doc-title')}
      <div className="doc-h2">{T('section1Title')}</div>
      {T('salutation', 'doc-strong')}
      {T('intro', 'doc-p')}
      {T('currentLabel', 'doc-p')}
      <ItemList items={d.findings ?? []} disabled={disabled} onChange={(v) => set('findings', v)} addLabel="Tespit ekle" />
      {T('risk', 'doc-p')}
      <div className="doc-h2">{T('section2Title')}</div>
      {T('section2Intro', 'doc-p')}
      <SectionList sections={d.scope ?? []} disabled={disabled} onChange={(v) => set('scope', v)} addLabel="İş kalemi grubu ekle" />
      <div className="doc-h2">{T('offerTitle')}</div>
      <div className="doc-p">
        {disabled ? (
          <span>{String(d.offerText ?? '').replace('{gun}', String(d.durationDays ?? ''))}</span>
        ) : (
          <>
            <AutoText value={d.offerText ?? ''} onChange={(v) => set('offerText', v)} />
            <div className="row small muted" style={{ gap: 8, marginTop: 4 }}>
              Süre (iş günü): <input className="input sm" style={{ width: 80 }} type="number" value={d.durationDays ?? ''} onChange={(e) => set('durationDays', Number(e.target.value))} />
              <span className="xs">Metindeki <code>{'{gun}'}</code> yerine yazılır</span>
            </div>
          </>
        )}
      </div>
      {T('offerClosing', 'doc-strong')}
      <div className="doc-h2">{T('conclusionTitle')}</div>
      {T('conclusion', 'doc-p')}
      <ExtraSections d={d} set={set} disabled={disabled} />
      <SignBoxes
        boxes={[
          { head: 'HAZIRLAYAN:', children: T('preparedBy1', '', 'Ad Soyad') },
          { head: 'HAZIRLAYAN:', children: T('preparedBy2', '', 'Ad Soyad') },
          { head: 'ONAY:', children: <>{T('approvedBy', '', 'Ad Soyad')}{approval && <span className="ok-text small">✓ Müşteri onayı: {approval.by} · {fmt(approval.at)}</span>}</> },
        ]}
      />
    </Paper>
  );
}

/** Her belgenin sonuna serbest başlık eklenebilir */
function ExtraSections({ d, set, disabled }: P) {
  if (disabled && !(d.extraSections ?? []).length) return null;
  return <FreeSections sections={d.extraSections ?? []} disabled={disabled} addLabel="Belgeye yeni başlık ekle" onChange={(v) => set('extraSections', v)} />;
}

// ───────────── Serbest başlıklı belge (kazıma raporu, özel raporlar) ─────────────
export function SectionsDoc({ d, set, disabled }: P) {
  return (
    <Paper>
      <div className="doc-company">NEXUS MARİN VE YATÇILIK LTD. ŞTİ.</div>
      <AutoText className="doc-title" value={d.docTitle ?? ''} placeholder="BELGE BAŞLIĞI" disabled={disabled} onChange={(v) => set('docTitle', v)} />
      <hr className="doc-hr" />
      <AutoText className="doc-h3" value={d.heading ?? ''} placeholder="Alt başlık (tekne, konu…)" disabled={disabled} onChange={(v) => set('heading', v)} />
      <FreeSections sections={d.sections ?? []} disabled={disabled} onChange={(v) => set('sections', v)} />
      {(d.closing || !disabled) && <AutoText className="doc-p" value={d.closing ?? ''} placeholder="Kapanış / sonuç metni (isteğe bağlı)" disabled={disabled} onChange={(v) => set('closing', v)} />}
    </Paper>
  );
}

// ───────────── Nihai Birleşik Restorasyon, Teak, Bakım ve Teslim Protokolü ─────────────
export function ProtocolDoc({ d, set, disabled, approval }: P) {
  const T = (k: string, cls = '', ph?: string) => <AutoText className={cls} value={d[k] ?? ''} placeholder={ph} disabled={disabled} onChange={(v) => set(k, v)} />;
  const parties: any[] = d.parties ?? [];
  const setParty = (i: number, patch: any) => set('parties', parties.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const sign = (k: 'employerSign' | 'contractorSign', f: 'name' | 'date', ph: string) => (
    <AutoText value={d[k]?.[f] ?? ''} placeholder={ph} disabled={disabled} onChange={(v) => set(k, { ...(d[k] ?? {}), [f]: v })} />
  );
  return (
    <Paper>
      {T('docTitle', 'doc-title')}
      <div className="doc-h2">TARAFLAR</div>
      {parties.map((p, i) => (
        <div key={i} className="doc-party">
          <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 auto', maxWidth: '45%' }}><AutoText className="doc-strong" value={p.title} disabled={disabled} onChange={(v) => setParty(i, { title: v })} /></div>
            <div style={{ flex: 1 }}><AutoText className="doc-h3" value={p.name} disabled={disabled} onChange={(v) => setParty(i, { name: v })} /></div>
          </div>
          <div className="doc-kv">
            {(p.fields ?? []).map((f: any, j: number) => (
              <FragmentKV key={j} label={f.label} value={f.value} disabled={disabled} onLabel={(v) => setParty(i, { fields: p.fields.map((x: any, k: number) => (k === j ? { ...x, label: v } : x)) })} onValue={(v) => setParty(i, { fields: p.fields.map((x: any, k: number) => (k === j ? { ...x, value: v } : x)) })} />
            ))}
          </div>
          {!disabled && <button type="button" className="doc-add" onClick={() => setParty(i, { fields: [...(p.fields ?? []), { label: 'Yeni alan', value: '' }] })}>+ Alan ekle</button>}
        </div>
      ))}
      <div className="doc-h2">{T('subjectTitle')}</div>
      {T('subject', 'doc-p')}
      <div className="doc-h2">{T('worksTitle')}</div>
      {T('worksIntro', 'doc-p')}
      <SectionList sections={d.sections ?? []} numberedItems disabled={disabled} onChange={(v) => set('sections', v)} addLabel="İş bölümü ekle" />
      <div className="doc-h2">{T('financeTitle')}</div>
      <ItemList items={d.finance ?? []} disabled={disabled} onChange={(v) => set('finance', v)} addLabel="Mali madde ekle" />
      <div className="doc-h2">{T('guaranteeTitle')}</div>
      <ItemList items={d.guarantee ?? []} numbered disabled={disabled} onChange={(v) => set('guarantee', v)} addLabel="Madde ekle" />
      <hr className="doc-hr" />
      {T('closing', 'doc-p')}
      {T('jurisdiction', 'doc-p')}
      <ExtraSections d={d} set={set} disabled={disabled} />
      <div className="doc-h2">TARAFLARIN İMZA VE ONAYI</div>
      <SignBoxes
        boxes={[
          {
            head: 'İşveren (Tekne Sahibi / Yetkilisi)',
            children: (
              <>
                <div className="doc-kv"><span>Adı Soyadı:</span>{sign('employerSign', 'name', '______________________')}<span>Tarih:</span>{sign('employerSign', 'date', '__ / __ / ____')}</div>
                {approval ? <span className="ok-text small">✓ Elektronik onay: {approval.by} · {fmt(approval.at)}</span> : <span className="muted small">İmza: ____________________</span>}
              </>
            ),
          },
          {
            head: 'Yüklenici (Nexus Marin ve Yatçılık Ltd. Şti.)',
            children: (
              <>
                <div className="doc-kv"><span>Adı Soyadı:</span>{sign('contractorSign', 'name', '______________________')}<span>Tarih:</span>{sign('contractorSign', 'date', '__ / __ / ____')}</div>
                <span className="muted small">İmza / Kaşe: ____________________</span>
              </>
            ),
          },
        ]}
      />
    </Paper>
  );
}

// ───────────────────────── Haftalık Bakım ve Servis Raporu ─────────────────────────

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const KIND_LABEL: Record<string, string> = { done: 'Tamamlanan', active: 'Devam eden', maint: 'Periyodik bakım', planned: 'Planlanan iş' };
type TL = { ref?: string; title: string; kind: string; from: number; to: number; status: string };

/** Pazartesi–Pazar zaman çizelgesi: her iş bir satır, gün aralığı çubuk. Düzenleme modunda satırlar değiştirilebilir. */
function WeekTimeline({ days, items, kinds, empty, onChange, disabled }: { days: string[]; items: TL[]; kinds: string[]; empty: string; onChange: (v: TL[]) => void; disabled?: boolean }) {
  const today = new Date().toDateString();
  const setRow = (i: number, patch: Partial<TL>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="wk-tl">
      <div className="wk-row wk-head">
        <span className="wk-label" />
        {days.map((d, i) => (
          <span key={d} className={`wk-day${new Date(d).toDateString() === today ? ' today' : ''}`}><b>{DAY_NAMES[i]}</b>{new Date(d).getDate()}</span>
        ))}
      </div>
      {!items.length && <p className="doc-p muted" style={{ padding: '8px 10px' }}>{empty}</p>}
      {items.map((t, i) => (
        <div key={i} className="wk-row">
          <span className="wk-label" title={t.title}>{t.ref && <em>{t.ref}</em>}{t.title}</span>
          <div className="wk-track">
            {days.map((d) => <i key={d} />)}
            <span className={`wk-bar ${t.kind}`} style={{ left: `${(t.from / 7) * 100}%`, width: `${((Math.max(t.from, t.to) - t.from + 1) / 7) * 100}%` }} title={`${KIND_LABEL[t.kind] ?? ''} · ${t.status}`}>{t.status}</span>
          </div>
        </div>
      ))}
      <div className="wk-legend">{kinds.map((k) => <span key={k} className={k}>{KIND_LABEL[k]}</span>)}</div>
      {!disabled && (
        <details className="wk-edit">
          <summary>Çizelge satırlarını düzenle ({items.length})</summary>
          {items.map((t, i) => (
            <div key={i} className="wk-edit-row">
              <input className="input sm" style={{ width: 90 }} placeholder="Ref" value={t.ref ?? ''} onChange={(e) => setRow(i, { ref: e.target.value })} />
              <input className="input sm" style={{ flex: 1, minWidth: 140 }} placeholder="İş" value={t.title} onChange={(e) => setRow(i, { title: e.target.value })} />
              <select className="select sm" value={t.from} onChange={(e) => { const v = Number(e.target.value); setRow(i, { from: v, to: Math.max(v, t.to) }); }}>{DAY_NAMES.map((n, k) => <option key={n} value={k}>{n} {new Date(days[k]).getDate()}</option>)}</select>
              <span className="muted">→</span>
              <select className="select sm" value={t.to} onChange={(e) => { const v = Number(e.target.value); setRow(i, { to: v, from: Math.min(v, t.from) }); }}>{DAY_NAMES.map((n, k) => <option key={n} value={k}>{n} {new Date(days[k]).getDate()}</option>)}</select>
              <select className="select sm" value={t.kind} onChange={(e) => setRow(i, { kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input className="input sm" style={{ width: 130 }} placeholder="Çubuk yazısı" value={t.status} onChange={(e) => setRow(i, { status: e.target.value })} />
              <button type="button" className="icon-btn" title="Satırı sil" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="doc-add" onClick={() => onChange([...items, { title: 'Yeni iş', kind: kinds[0], from: 0, to: 0, status: KIND_LABEL[kinds[0]] }])}>+ Satır ekle</button>
        </details>
      )}
    </div>
  );
}

const C_DONE: ECol[] = [{ key: 'ref', label: 'İş emri', width: 110 }, { key: 'title', label: 'İş' }, { key: 'note', label: 'Not' }, { key: 'technician', label: 'Teknisyen', width: 140 }, { key: 'date', label: 'Tarih', type: 'date', width: 110 }];
const C_ACTIVE: ECol[] = [{ key: 'ref', label: 'İş emri', width: 110 }, { key: 'title', label: 'İş' }, { key: 'technician', label: 'Teknisyen', width: 140 }, { key: 'status', label: 'Durum', width: 130 }];
const C_UP: ECol[] = [{ key: 'ref', label: 'İş emri', width: 110 }, { key: 'title', label: 'İş' }, { key: 'technician', label: 'Teknisyen', width: 140 }, { key: 'date', label: 'Tarih', type: 'date', width: 110 }];
const C_MAINT: ECol[] = [{ key: 'title', label: 'Bakım' }, { key: 'date', label: 'Tarih', type: 'date', width: 110 }, { key: 'status', label: 'Durum', width: 130 }];
const C_FAULT: ECol[] = [{ key: 'title', label: 'Arıza' }, { key: 'date', label: 'Tarih', type: 'date', width: 110 }, { key: 'status', label: 'Durum', width: 130 }];
const C_MAT: ECol[] = [{ key: 'name', label: 'Malzeme' }, { key: 'quantity', label: 'Miktar', width: 100 }, { key: 'unit', label: 'Birim', width: 90 }];

const WEEKLY_SECTIONS: Record<string, string> = {
  summary: 'Haftanın Özeti',
  timeline: 'Bu Hafta — Zaman Çizelgesi',
  nextTimeline: 'Gelecek Hafta Yapılacak İşler — Zaman Çizelgesi',
  completed: 'Bu Hafta Tamamlanan İşler',
  active: 'Devam Eden İşler',
  upcoming: 'Gelecek Hafta Planlanan İşler',
  maintenance: 'Periyodik Bakımlar',
  inspection: 'Haftalık Teknik Denetim',
  faults: 'Bu Hafta Bildirilen Arızalar',
  materials: 'Kullanılan Malzemeler',
  notes: 'Notlar',
};

export function WeeklyDoc({ d, set, disabled }: P) {
  const s = d.stats ?? {};
  // Elle düzenlenen bölümler "Verileri yenile" sırasında korunur
  const edit = (k: string) => (v: any) => { set(k, v); set('edited', [...new Set([...(d.edited ?? []), k])]); };
  const tiles: Array<[string, number, string]> = [
    ['Tamamlanan iş', s.completed ?? 0, 'ok'],
    ['Devam eden', s.active ?? 0, 'warn'],
    ['Gelecek hafta', s.upcoming ?? 0, 'info'],
    ['Yeni arıza', s.newFaults ?? 0, (s.newFaults ?? 0) > 0 ? 'danger' : 'muted'],
    ['Açık arıza', s.openFaults ?? 0, (s.openFaults ?? 0) > 0 ? 'danger' : 'muted'],
  ];
  // Bölüm başlıkları: adı değiştirilebilir, bölüm kaldırılıp geri eklenebilir (PDF'e de yansır)
  const hiddenList: string[] = d.hidden ?? [];
  const hid = (k: string) => hiddenList.includes(k);
  const title = (k: string, def: string) => d.titles?.[k] ?? def;
  const H = (k: string, def: string) =>
    disabled ? (
      <div className="doc-h2">{title(k, def)}</div>
    ) : (
      <div className="doc-h2 wk-h">
        <AutoText value={title(k, def)} placeholder={def} onChange={(v) => set('titles', { ...(d.titles ?? {}), [k]: v })} />
        <button type="button" className="wk-h-del" title="Bölümü rapordan kaldır" onClick={() => confirm(`"${title(k, def)}" bölümü rapordan kaldırılsın mı?\n(Alttaki "Kaldırılan bölümler" listesinden geri ekleyebilirsiniz.)`) && set('hidden', [...hiddenList, k])}><Trash2 /></button>
      </div>
    );
  const T = (title: string, k: string, cols: ECol[]) => !hid(k) && ((d[k] ?? []).length || !disabled) && (
    <>
      {H(k, title)}
      <EditTable cols={cols} rows={d[k] ?? []} disabled={disabled} onChange={edit(k)} />
    </>
  );
  return (
    <Paper>
      <div className="doc-company">NEXUS MARİN VE YATÇILIK HİZMETLERİ</div>
      <div className="doc-title">HAFTALIK BAKIM VE SERVİS RAPORU</div>
      <div className="small muted" style={{ textAlign: 'center' }}>{d.weekKey} · {fmt(d.weekStart)} – {fmt(d.weekEnd)}</div>
      <div className="doc-kv mt-2">
        <span>Tekne:</span><b style={{ paddingTop: 3 }}>{d.vessel?.name}</b>
        <span>Marka / Model:</span><span style={{ fontWeight: 400, paddingTop: 3 }}>{d.vessel?.model || '—'}</span>
        <span>Marina / Bağlama:</span><span style={{ fontWeight: 400, paddingTop: 3 }}>{d.vessel?.marina || '—'}</span>
        <span>Tekne sahibi:</span><span style={{ fontWeight: 400, paddingTop: 3 }}>{d.vessel?.owner || '—'}</span>
      </div>
      {!hid('summary') && (
        <>
          {H('summary', 'Haftanın Özeti')}
          <AutoText className="doc-p" value={d.summary ?? ''} disabled={disabled} onChange={(v) => { set('summary', v); set('summaryEdited', true); }} />
        </>
      )}
      <div className="weekly-tiles">{tiles.map(([l, v, t]) => <div key={l} className={`wt ${t}`}><b>{v}</b><span>{l}</span></div>)}</div>
      {Array.isArray(d.days) && !hid('timeline') && (
        <>
          {H('timeline', 'Bu Hafta — Zaman Çizelgesi')}
          <WeekTimeline days={d.days} items={d.timeline ?? []} kinds={['done', 'active', 'maint']} empty="Bu hafta takvimde iş görünmüyor." disabled={disabled} onChange={edit('timeline')} />
        </>
      )}
      {Array.isArray(d.days) && !hid('nextTimeline') && (
        <>
          {H('nextTimeline', 'Gelecek Hafta Yapılacak İşler — Zaman Çizelgesi')}
          <WeekTimeline
            days={d.nextDays ?? d.days.map((x: string) => new Date(new Date(x).getTime() + 7 * 864e5).toISOString())}
            items={d.nextTimeline ?? []}
            kinds={['planned', 'maint']}
            empty="Gelecek hafta için planlanmış iş yok. Verileri yenileyin veya satır ekleyin."
            disabled={disabled}
            onChange={edit('nextTimeline')}
          />
        </>
      )}
      {T('Bu Hafta Tamamlanan İşler', 'completed', C_DONE)}
      {T('Devam Eden İşler', 'active', C_ACTIVE)}
      {T('Gelecek Hafta Planlanan İşler', 'upcoming', C_UP)}
      {T('Periyodik Bakımlar', 'maintenance', C_MAINT)}
      {d.inspection && !hid('inspection') && (
        <>
          {H('inspection', 'Haftalık Teknik Denetim')}
          <p className="doc-p">{d.inspection.number} · {fmt(d.inspection.date)} · {d.inspection.status}{d.inspection.operational ? ` · ${d.inspection.operational}` : ''} — {d.inspection.ok} uygun, {d.inspection.attention} dikkat, {d.inspection.fault} arıza</p>
        </>
      )}
      {T('Bu Hafta Bildirilen Arızalar', 'faults', C_FAULT)}
      {T('Kullanılan Malzemeler', 'materials', C_MAT)}
      {!hid('notes') && (
        <>
          {H('notes', 'Notlar')}
          <AutoText className="doc-p" value={d.notes ?? ''} placeholder="Kaptana / tekne sahibine iletilecek notlar…" disabled={disabled} onChange={(v) => set('notes', v)} />
        </>
      )}
      <ExtraSections d={d} set={set} disabled={disabled} />
      {!disabled && hiddenList.length > 0 && (
        <div className="wk-hidden">
          <span className="xs muted">Kaldırılan bölümler:</span>
          {hiddenList.map((k) => (
            <button key={k} type="button" className="btn btn-xs" title="Bölümü geri ekle" onClick={() => set('hidden', hiddenList.filter((x) => x !== k))}>
              <RotateCcw /> {d.titles?.[k] || WEEKLY_SECTIONS[k] || k}
            </button>
          ))}
        </div>
      )}
      <p className="xs muted mt-2">Bu rapor iş emirleri, bakım planları, arıza kayıtları, malzeme kullanımı ve denetimlerden otomatik oluşturulmuştur · {d.generatedAt ? new Date(d.generatedAt).toLocaleString('tr-TR') : ''}</p>
    </Paper>
  );
}

function FragmentKV({ label, value, disabled, onLabel, onValue }: { label: string; value: string; disabled?: boolean; onLabel: (v: string) => void; onValue: (v: string) => void }) {
  return (
    <>
      <AutoText className="doc-strong" value={label} disabled={disabled} onChange={onLabel} />
      <AutoText value={value} placeholder="………………………………" disabled={disabled} onChange={onValue} />
    </>
  );
}
