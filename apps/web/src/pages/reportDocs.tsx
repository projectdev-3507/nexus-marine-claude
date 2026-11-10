import { AutoText, ItemList, Paper, SectionList, SignBoxes, TextList } from '../components/docEditor';

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

// ───────────────────── Kazıma Sonrası Teknik İnceleme ─────────────────────
export function ScrapingDoc({ d, set, disabled }: P) {
  return (
    <Paper>
      <div className="doc-company">NEXUS MARİN VE YATÇILIK LTD. ŞTİ.</div>
      <div className="doc-title">KAZIMA SONRASI TEKNİK İNCELEME RAPORU</div>
      <hr className="doc-hr" />
      <AutoText className="doc-h3" value={d.heading ?? ''} disabled={disabled} onChange={(v) => set('heading', v)} />
      <AutoText className="doc-strong" value={d.starboardIntro ?? ''} disabled={disabled} onChange={(v) => set('starboardIntro', v)} />
      <TextList items={d.starboard ?? []} disabled={disabled} addLabel="Sancak bulgusu ekle" onChange={(v) => set('starboard', v)} />
      <AutoText className="doc-h3" value={d.portTitle ?? ''} disabled={disabled} onChange={(v) => set('portTitle', v)} />
      <TextList items={d.port ?? []} disabled={disabled} addLabel="İskele bulgusu ekle" onChange={(v) => set('port', v)} />
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

function FragmentKV({ label, value, disabled, onLabel, onValue }: { label: string; value: string; disabled?: boolean; onLabel: (v: string) => void; onValue: (v: string) => void }) {
  return (
    <>
      <AutoText className="doc-strong" value={label} disabled={disabled} onChange={onLabel} />
      <AutoText value={value} placeholder="………………………………" disabled={disabled} onChange={onValue} />
    </>
  );
}
