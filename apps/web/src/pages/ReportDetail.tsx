import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, Save, Send, CheckCircle2, Globe, Plus, Trash2, Download, ShieldAlert } from 'lucide-react';
import { REPORT_TYPES, type ReportType } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { Gallery, Uploader } from '../components/media';
import { fmtDate, fmtDateTime, toInputDate } from '../lib/format';
import { REPORT_STATUS_LABELS, REPORT_TONE } from '../lib/labels';

export default function ReportDetail() {
  const { id } = useParams();
  const { can, staff } = useAuth();
  const { data: r } = useApi<any>(`/reports/${id}`);
  const files = useApi<any[]>('/files', { entityType: 'REPORT', entityId: id }).data ?? [];
  const latest = r?.versions?.[0];
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [approve, setApprove] = useState(false);
  useEffect(() => {
    if (latest) setData(structuredClone(latest.data));
    if (r) setTitle(r.title);
  }, [latest?.id, latest?.version, r?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(() => api(`/reports/${id}`, { method: 'PUT', body: { title, data } }), { success: latest && ['APPROVED', 'PUBLISHED'].includes(latest.status) ? 'Yeni sürüm oluşturuldu' : 'Taslak kaydedildi' });
  const submit = useAction(() => api(`/reports/${id}/submit`, { body: {} }), { success: 'Rapor kontrole gönderildi' });
  const publish = useAction(() => api(`/reports/${id}/publish`, { body: {} }), { success: 'Rapor müşteriye yayınlandı' });

  if (!r || !data) return <Loading />;
  const editable = can('reports.manage') && r.type !== 'INSPECTION';
  const approvedVersion = latest && ['APPROVED', 'PUBLISHED'].includes(latest.status);
  const set = (k: string, v: any) => setData({ ...data, [k]: v });

  return (
    <div>
      <PageHeader
        crumbs={staff ? <><Link to="/reports">Teknik Raporlar</Link> / {r.number}</> : undefined}
        title={r.title}
        sub={<span className="row-wrap" style={{ gap: 8 }}><span className="mono strong">{r.number}</span><span>{REPORT_TYPES[r.type as ReportType]}</span><StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={r.status} /><Link to={`/vessels/${r.vessel.id}`}>{r.vessel.name}</Link></span>}
        actions={
          <>
            <a className="btn" href={authedUrl(`/reports/${id}/pdf`)} target="_blank" rel="noreferrer"><FileText /> PDF önizle</a>
            {!staff && <a className="btn btn-primary" href={authedUrl(`/reports/${id}/pdf?download=1`)}><Download /> PDF indir</a>}
            {editable && <button className="btn" onClick={() => save.mutate(undefined)}><Save /> {approvedVersion ? 'Yeni sürüm olarak kaydet' : 'Kaydet'}</button>}
            {editable && latest?.status === 'DRAFT' && <button className="btn" onClick={() => submit.mutate(undefined)}><Send /> Kontrole gönder</button>}
            {can('reports.approve') && latest && ['DRAFT', 'IN_REVIEW'].includes(latest.status) && r.type !== 'INSPECTION' && <button className="btn btn-success" onClick={() => setApprove(true)}><CheckCircle2 /> Onayla</button>}
            {can('reports.approve') && latest && latest.status === 'APPROVED' && <button className="btn btn-primary" onClick={() => publish.mutate(undefined)}><Globe /> Müşteriye yayınla</button>}
          </>
        }
      />
      {approvedVersion && editable && <div className="notice warn mb-2"><ShieldAlert /> Bu sürüm onaylıdır. Değişiklikler kaydedildiğinde yeni bir sürüm (v{latest.version + 1}) taslak olarak oluşturulur; onaylı sürüm korunur.</div>}
      <div className="grid g-side">
        <div className="stack">
          {r.type === 'INSPECTION' ? (
            <Card title="Denetim raporu">
              <p className="muted">Bu rapor <Link to={`/inspections/${r.inspection?.id}`}>{r.inspection?.number}</Link> numaralı dijital denetimden otomatik oluşturulmuştur. PDF, denetim verileri, fotoğraflar ve onay bilgilerini içerir.</p>
            </Card>
          ) : (
            <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <Card title="Rapor başlığı"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Card>
              {r.type === 'POST_SCRAPING' && <PostScraping d={data} set={set} />}
              {r.type === 'HULL_RESTORATION' && <HullRestoration d={data} set={set} />}
              {r.type === 'TEAK_CARPENTRY' && <Teak d={data} set={set} />}
              {r.type === 'DELIVERY_PROTOCOL' && <Delivery d={data} set={set} />}
              <Card title="Ek açıklamalar"><textarea className="textarea" value={data.preparedNotes ?? ''} onChange={(e) => set('preparedNotes', e.target.value)} /></Card>
            </fieldset>
          )}
          {r.type !== 'INSPECTION' && (
            <Card title="Rapor fotoğrafları">
              {editable && <div className="mb-2"><Uploader entityType="REPORT" entityId={r.id} tagOptions /></div>}
              <Gallery items={files} editable={editable} />
              <p className="xs muted mt-2">İlgili iş emri ve proje aşamalarının müşteriye onaylı fotoğrafları da PDF'e otomatik eklenir.</p>
            </Card>
          )}
        </div>
        <div className="stack">
          <Card title="Sürüm geçmişi" pad={false}>
            {r.versions.map((v: any) => (
              <div key={v.id} className="list-item">
                <div className="grow">
                  <div className="row"><b>v{v.version}</b><StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={v.status} /></div>
                  <div className="xs muted">{fmtDateTime(v.createdAt)} · {r.users?.[v.createdById] ?? ''}</div>
                  {v.approvedAt && <div className="xs" style={{ color: 'var(--ok)' }}>Onay: {r.users?.[v.approvedById]} · {fmtDate(v.approvedAt)}</div>}
                  {v.changeNote && <div className="xs muted">{v.changeNote}</div>}
                  {(v.clauses ?? []).length > 0 && <div className="row-wrap mt-1" style={{ gap: 4 }}>{v.clauses.map((c: any) => <Badge key={c.key} tone="violet" plain>{c.key === 'TECHNICAL_COMPLIANCE' ? 'Teknik uygunluk' : c.key === 'DEFECT_FREE_DELIVERY' ? 'Ayıpsız teslim' : c.key === 'WARRANTY' ? 'Garanti' : 'İbra'}</Badge>)}</div>}
                </div>
                <a className="btn btn-sm" href={authedUrl(`/reports/${id}/pdf?version=${v.version}`)} target="_blank" rel="noreferrer">PDF</a>
              </div>
            ))}
          </Card>
          <Card title="Bağlantılar">
            <div className="stack small" style={{ gap: 6 }}>
              <div>Tekne: <Link to={`/vessels/${r.vessel.id}`}>{r.vessel.name}</Link></div>
              {r.project && <div>Proje: <Link to={`/projects/${r.project.id}`}>{r.project.name}</Link></div>}
              {r.workOrder && <div>İş emri: <Link to={`/work-orders/${r.workOrder.id}`}>{r.workOrder.number}</Link></div>}
              <div>Müşteriye görünür: <b>{r.customerVisible ? 'Evet' : 'Hayır'}</b></div>
            </div>
          </Card>
        </div>
      </div>
      {approve && <ApproveModal id={r.id} type={r.type} onClose={() => setApprove(false)} />}
    </div>
  );
}

function ApproveModal({ id, type, onClose }: { id: string; type: string; onClose: () => void }) {
  const catalog = useApi<Record<string, { label: string; text: string }>>('/reports/clauses').data ?? {};
  const [sel, setSel] = useState<Record<string, string | undefined>>({});
  const approve = useAction(() => api(`/reports/${id}/approve`, { body: { clauses: Object.entries(sel).filter(([, v]) => v !== undefined).map(([key, text]) => ({ key, text })) } }), { success: 'Rapor onaylandı', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} size="lg" title="Raporu onayla" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-success" onClick={() => approve.mutate(undefined)}><CheckCircle2 /> Onayla</button></>}>
      <div className="notice warn mb-2"><ShieldAlert />Aşağıdaki beyanlar sistem tarafından otomatik eklenmez. Yalnızca seçtiğiniz beyanlar adınıza ve onay tarihiyle rapora eklenir.</div>
      <div className="stack">
        {Object.entries(catalog).filter(([k]) => type === 'DELIVERY_PROTOCOL' || ['TECHNICAL_COMPLIANCE', 'WARRANTY'].includes(k)).map(([k, c]) => (
          <div key={k} className="card card-pad" style={{ borderColor: sel[k] !== undefined ? 'var(--marine)' : undefined }}>
            <label className="checkbox"><input type="checkbox" checked={sel[k] !== undefined} onChange={(e) => setSel({ ...sel, [k]: e.target.checked ? c.text : undefined })} /> <b>{c.label}</b></label>
            {sel[k] !== undefined ? <textarea className="textarea mt-2" value={sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.value })} /> : <p className="small muted mt-1">{c.text}</p>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

type P = { d: any; set: (k: string, v: any) => void };

function RowsEditor({ rows, onChange, cols, addLabel, blank }: { rows: any[]; onChange: (r: any[]) => void; cols: Array<{ key: string; label: string; type?: string; width?: string }>; addLabel: string; blank: any }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="form-grid" style={{ gridTemplateColumns: `${cols.map((c) => c.width ?? '1fr').join(' ')} 34px` }}>
        {cols.map((c) => <span key={c.key} className="xs muted strong" style={{ textTransform: 'uppercase' }}>{c.label}</span>)}
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="form-grid" style={{ gridTemplateColumns: `${cols.map((c) => c.width ?? '1fr').join(' ')} 34px` }}>
          {cols.map((c) => (
            <input key={c.key} className="input sm" type={c.type ?? 'text'} value={c.type === 'date' ? toInputDate(row[c.key]) : row[c.key] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.key]: c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value } : x)))} />
          ))}
          <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 /></button>
        </div>
      ))}
      <div><button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { ...blank }])}><Plus /> {addLabel}</button></div>
    </div>
  );
}

function PostScraping({ d, set }: P) {
  return (
    <>
      <Card title="İnceleme bilgileri">
        <div className="form-grid cols-3">
          <Field label="İnceleme tarihi"><input className="input" type="date" value={toInputDate(d.inspectionDate)} onChange={(e) => set('inspectionDate', e.target.value)} /></Field>
          <Field label="İnceleme yeri"><input className="input" value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="İnceleyen"><input className="input" value={d.inspector ?? ''} onChange={(e) => set('inspector', e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Bulgular">
        <div className="form-grid">
          <Field label="İskele (port) tarafı bulguları"><textarea className="textarea" value={d.portFindings ?? ''} onChange={(e) => set('portFindings', e.target.value)} /></Field>
          <Field label="Sancak (starboard) tarafı bulguları"><textarea className="textarea" value={d.starboardFindings ?? ''} onChange={(e) => set('starboardFindings', e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Tespit edilen hasarlar">
        <RowsEditor rows={d.damages ?? []} onChange={(v) => set('damages', v)} addLabel="Hasar ekle" blank={{ location: '', side: 'İskele', description: '', severity: 'Orta' }} cols={[{ key: 'location', label: 'Konum', width: '1.4fr' }, { key: 'side', label: 'Taraf', width: '0.7fr' }, { key: 'description', label: 'Açıklama', width: '2fr' }, { key: 'severity', label: 'Derece', width: '0.8fr' }]} />
      </Card>
      <Card title="Nem ölçümleri (%)">
        <RowsEditor rows={d.moistureReadings ?? []} onChange={(v) => set('moistureReadings', v)} addLabel="Ölçüm ekle" blank={{ point: '', side: 'İskele', value: '' }} cols={[{ key: 'point', label: 'Ölçüm noktası', width: '1.6fr' }, { key: 'side', label: 'Taraf', width: '0.8fr' }, { key: 'value', label: 'Değer %', type: 'number', width: '0.7fr' }, { key: 'note', label: 'Not', width: '1.4fr' }]} />
        <p className="xs muted mt-2">PDF'de %15 üzeri turuncu, %20 üzeri kırmızı olarak vurgulanır.</p>
      </Card>
      <Card title="Değerlendirme ve öneri">
        <div className="stack">
          <Field label="Teknik değerlendirme"><textarea className="textarea" value={d.assessment ?? ''} onChange={(e) => set('assessment', e.target.value)} /></Field>
          <Field label="Önerilen onarım"><textarea className="textarea" value={d.recommendation ?? ''} onChange={(e) => set('recommendation', e.target.value)} /></Field>
          <div className="form-grid"><Field label="Hazırlayan"><input className="input" value={d.preparedBy ?? ''} onChange={(e) => set('preparedBy', e.target.value)} /></Field></div>
        </div>
      </Card>
    </>
  );
}

function HullRestoration({ d, set }: P) {
  return (
    <>
      <Card title="Proje özeti"><textarea className="textarea" value={d.summary ?? ''} onChange={(e) => set('summary', e.target.value)} /></Card>
      <Card title="Aşamalar">
        <RowsEditor rows={d.phases ?? []} onChange={(v) => set('phases', v)} addLabel="Aşama ekle" blank={{ name: '', status: 'NOT_STARTED' }} cols={[{ key: 'name', label: 'Aşama', width: '1.3fr' }, { key: 'responsible', label: 'Sorumlu' }, { key: 'startDate', label: 'Başlangıç', type: 'date' }, { key: 'endDate', label: 'Bitiş', type: 'date' }, { key: 'status', label: 'Durum (NOT_STARTED/IN_PROGRESS/DONE)', width: '1.2fr' }, { key: 'materials', label: 'Malzeme', width: '1.3fr' }]} />
        <div className="form-grid cols-3 mt-2"><Field label="Genel ilerleme (%)"><input className="input" type="number" value={d.progress ?? 0} onChange={(e) => set('progress', Number(e.target.value))} /></Field></div>
      </Card>
      <Card title="Teknik notlar"><textarea className="textarea" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Card>
    </>
  );
}

function Teak({ d, set }: P) {
  return (
    <>
      <Card title="Çalışma özeti"><textarea className="textarea" value={d.summary ?? ''} onChange={(e) => set('summary', e.target.value)} /></Card>
      <Card title="Çalışma alanları">
        <RowsEditor rows={d.areas ?? []} onChange={(v) => set('areas', v)} addLabel="Alan ekle" blank={{ area: '', quantity: '', unit: 'm²', material: 'Burma teak', products: '', labourHours: '', progress: 0 }} cols={[{ key: 'area', label: 'Alan', width: '1.3fr' }, { key: 'quantity', label: 'Miktar', type: 'number', width: '0.6fr' }, { key: 'unit', label: 'Birim', width: '0.5fr' }, { key: 'material', label: 'Malzeme' }, { key: 'products', label: 'Kullanılan ürünler', width: '1.3fr' }, { key: 'labourHours', label: 'İşçilik (s)', type: 'number', width: '0.6fr' }, { key: 'progress', label: 'İlerleme %', type: 'number', width: '0.6fr' }]} />
        <p className="xs muted mt-2">Önce/sonra fotoğraflarını aşağıdan "Önce" / "Sonra" etiketiyle yükleyin.</p>
      </Card>
    </>
  );
}

function Delivery({ d, set }: P) {
  return (
    <>
      <Card title="Yapılan işler">
        <RowsEditor rows={d.works ?? []} onChange={(v) => set('works', v)} addLabel="İş ekle" blank={{ description: '', ref: '', date: '' }} cols={[{ key: 'description', label: 'İş tanımı', width: '2.5fr' }, { key: 'ref', label: 'Referans' }, { key: 'date', label: 'Tarih', type: 'date' }]} />
      </Card>
      <Card title="Ek kaptan talepleri ve onaylanan ek işler">
        <RowsEditor rows={d.captainRequests ?? []} onChange={(v) => set('captainRequests', v)} addLabel="Talep ekle" blank={{ title: '', status: 'Bekliyor' }} cols={[{ key: 'title', label: 'Talep', width: '2.5fr' }, { key: 'status', label: 'Durum' }]} />
        <div className="divider" />
        <RowsEditor rows={d.approvedExtras ?? []} onChange={(v) => set('approvedExtras', v)} addLabel="Onaylı ek iş" blank={{ title: '', decidedAt: '' }} cols={[{ key: 'title', label: 'Onaylanan ek iş', width: '2.5fr' }, { key: 'decidedAt', label: 'Onay tarihi', type: 'date' }]} />
      </Card>
      <Card title="Kullanılan malzemeler">
        <RowsEditor rows={d.materials ?? []} onChange={(v) => set('materials', v)} addLabel="Malzeme" blank={{ name: '', quantity: '', unit: '' }} cols={[{ key: 'name', label: 'Malzeme', width: '2.5fr' }, { key: 'quantity', label: 'Miktar', type: 'number' }, { key: 'unit', label: 'Birim' }]} />
      </Card>
      <Card title="Teslim bilgileri">
        <div className="form-grid">
          <Field label="Teslim tarihi"><input className="input" type="date" value={toInputDate(d.deliveryDate)} onChange={(e) => set('deliveryDate', e.target.value)} /></Field>
          <Field label="Garanti bilgisi"><input className="input" value={d.warranty ?? ''} onChange={(e) => set('warranty', e.target.value)} placeholder="Örn. 12 ay işçilik garantisi" /></Field>
          <Field label="Ödeme durumu"><input className="input" value={d.paymentStatus ?? ''} onChange={(e) => set('paymentStatus', e.target.value)} /></Field>
          <Field label="Teslim alan (kaptan / sahip)"><input className="input" value={d.receivedBy ?? ''} onChange={(e) => set('receivedBy', e.target.value)} /></Field>
          <Field label="Notlar" full><textarea className="textarea" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      </Card>
    </>
  );
}
