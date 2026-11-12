import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Send, CheckCircle2, AlertTriangle, ClipboardList, History, Globe, EyeOff } from 'lucide-react';
import { FINDING_PRIORITIES, FINDING_PRIORITY_LABELS, INSPECTION_DOC, INSPECTION_RESULTS, INSPECTION_RESULT_HINTS, INSPECTION_RESULT_LABELS, OPERATIONAL_STATUSES, OPERATIONAL_STATUS_LABELS, type InspectionResult, type OperationalStatus } from '@nexus/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, Field, KV, Loading, PageHeader, Progress, StatusBadge, useToast } from '../components/ui';
import '../styles/doc.css';
import { Gallery, Uploader } from '../components/media';
import { fmtDate, toInputDateTime } from '../lib/format';
import { INSP_STATUS_LABELS, INSP_TONE, RESULT_TONE } from '../lib/labels';

export default function InspectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, manager, can } = useAuth();
  const key = `/inspections/${id}`;
  const { data: insp } = useApi<any>(key);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'issues' | 'empty'>('all');

  const editable = insp && insp.status !== 'APPROVED' && can('inspections.perform') && (manager || insp.inspector.id === user?.id);
  // Yalnızca Bölüm 1–16 (UYGUN/DİKKAT/ARIZA/N/A) ilerlemeye sayılır
  const allItems = useMemo(() => (insp?.sections ?? []).filter((s: any) => (s.kind ?? 'CHECK') === 'CHECK').flatMap((s: any) => s.items), [insp]);
  const stats = useMemo(() => {
    const c = { OK: 0, ATTENTION: 0, FAULT: 0, NA: 0, filled: 0 } as Record<string, number>;
    for (const i of allItems) if (i.result) { c[i.result]++; c.filled++; }
    return c;
  }, [allItems]);

  const updateItem = async (itemId: string, patch: Record<string, unknown>) => {
    // İyimser güncelleme
    qc.setQueryData([key, undefined], (old: any) => old && { ...old, sections: old.sections.map((s: any) => ({ ...s, items: s.items.map((i: any) => (i.id === itemId ? { ...i, ...patch } : i)) })) });
    try {
      const r = await api(`/inspections/${id}/items/${itemId}`, { method: 'PUT', body: patch });
      if (patch.result === 'FAULT' && r.fault) toast('ARIZA kaydı oluşturuldu, operasyon yöneticisi bilgilendirildi', 'info');
      qc.setQueryData([key, undefined], (old: any) => old && { ...old, sections: old.sections.map((s: any) => ({ ...s, items: s.items.map((i: any) => (i.id === itemId ? { ...i, ...r, attachments: i.attachments } : i)) })) });
    } catch (e) {
      toast((e as Error).message, 'error');
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
  const setAll = useAction(async (sectionCode: string) => {
    const sec = insp.sections.find((s: any) => s.code === sectionCode);
    await api(`/inspections/${id}/items`, { method: 'PUT', body: { items: sec.items.filter((i: any) => !i.result).map((i: any) => ({ id: i.id, result: 'OK' })) } });
  }, { success: 'Boş maddeler UYGUN olarak işaretlendi' });
  const saveMeta = useAction((body: any) => api(`/inspections/${id}`, { method: 'PUT', body }));
  const submit = useAction(() => api(`/inspections/${id}/submit`, { body: {} }), { success: 'Denetim onaya gönderildi' });
  const approve = useAction(() => api(`/inspections/${id}/approve`, { body: {} }), { success: 'Denetim onaylandı' });
  const publish = useAction((on: boolean) => api(`/reports/${insp.report.id}/${on ? 'publish' : 'unpublish'}`, { body: {} }), { success: 'Kaydedildi' });
  const openWO = useAction((itemId: string) => api(`/inspections/${id}/items/${itemId}/work-order`, { body: {} }), { success: 'Kontrol maddesinden iş emri açıldı', onSuccess: (w) => nav(`/work-orders/${w.id}`) });

  if (!insp) return <Loading />;
  const prev = insp.previous?.items ?? {};
  const visible = (i: any) => filter === 'all' || (filter === 'issues' ? ['FAULT', 'ATTENTION'].includes(i.result) : !i.result);

  return (
    <div>
      <PageHeader
        crumbs={<><Link to="/inspections">Dijital Denetimler</Link> / {insp.number}</>}
        title={`${insp.vessel.name} — Teknik Denetim`}
        sub={<span className="row-wrap" style={{ gap: 8 }}><span className="mono strong">{insp.number}</span><span title={insp.approverName ? `${insp.approverName}${insp.approvedAt ? ' · ' + fmtDate(insp.approvedAt) : ''}` : undefined}><StatusBadge map={INSP_TONE} labels={INSP_STATUS_LABELS} value={insp.status} /></span>{insp.report?.status === 'PUBLISHED' && <Badge tone="info"><Globe size={12} /> Yayınlandı</Badge>}<span>{fmtDate(insp.date)}</span></span>}
        actions={
          <>
            <a className="btn" href={authedUrl(`/inspections/${id}/pdf`)} target="_blank" rel="noreferrer"><FileText /> PDF Rapor</a>
            {editable && insp.status === 'DRAFT' && <button className="btn btn-primary" disabled={stats.filled < allItems.length} onClick={() => submit.mutate(undefined)}><Send /> Onaya gönder</button>}
            {manager && insp.status === 'SUBMITTED' && <button className="btn btn-success" onClick={() => approve.mutate(undefined)}><CheckCircle2 /> Denetimi onayla</button>}
            {insp.report && can('reports.approve') && (insp.report.status === 'PUBLISHED'
              ? <button className="btn" disabled={publish.isPending} onClick={() => confirm('Denetim raporu müşteri portalından kaldırılsın mı?') && publish.mutate(false)}><EyeOff /> Yayınlamayı kaldır</button>
              : <button className="btn btn-primary" disabled={publish.isPending} onClick={() => publish.mutate(true)}><Globe /> Müşteriye yayınla</button>)}
          </>
        }
      />
      <div className="grid g-side">
        <div>
          <div className="card card-pad mb-2 row-wrap" style={{ position: 'sticky', top: 72, zIndex: 5, gap: 14 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row small"><b>{stats.filled}/{allItems.length}</b><span className="muted">madde değerlendirildi</span></div>
              <div className="mt-1"><Progress value={(stats.filled / allItems.length) * 100} /></div>
            </div>
            <div className="row-wrap" style={{ gap: 6 }}>
              {INSPECTION_RESULTS.map((r) => <Badge key={r} tone={RESULT_TONE[r]}>{INSPECTION_RESULT_LABELS[r]} {stats[r]}</Badge>)}
            </div>
            <div className="seg">
              {([['all', 'Tümü'], ['issues', 'Arıza / Dikkat'], ['empty', 'Boş']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
          </div>

          <div className="card card-pad mb-2 matrix-head">
            <div className="mh-title">
              <b>{INSPECTION_DOC.company}</b>
              <span>{INSPECTION_DOC.title}</span>
              <em>{INSPECTION_DOC.subtitle}</em>
            </div>
            <div className="mh-grid">
              <label><span>Tekne Adı</span><b>{insp.vessel.name}</b></label>
              <label><span>Marka &amp; Model</span><b>{[insp.vessel.make, insp.vessel.model].filter(Boolean).join(' ') || '—'}</b></label>
              <label><span>İşletmeci Şirket</span><b>Nexus Marin ve Yatçılık Ltd. Şti.</b></label>
              <label><span>Kaptan / Enspektör</span><input className="input sm" disabled={!editable} defaultValue={insp.captainName ?? ''} placeholder="Kaptan adı" onBlur={(e) => e.target.value !== (insp.captainName ?? '') && saveMeta.mutate({ captainName: e.target.value })} /></label>
              <label><span>Kontrol Tarihi / Saati</span><input className="input sm" type="datetime-local" disabled={!editable} defaultValue={toInputDateTime(insp.date)} onBlur={(e) => e.target.value && saveMeta.mutate({ date: e.target.value })} /></label>
              <label><span>Lokasyon / Bağlama · Peron</span>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input sm" disabled={!editable} defaultValue={insp.location ?? ''} placeholder="Marina" onBlur={(e) => e.target.value !== (insp.location ?? '') && saveMeta.mutate({ location: e.target.value })} />
                  <input className="input sm" style={{ width: 90 }} disabled={!editable} defaultValue={insp.pier ?? ''} placeholder="Peron" onBlur={(e) => e.target.value !== (insp.pier ?? '') && saveMeta.mutate({ pier: e.target.value })} />
                </div>
              </label>
            </div>
            <div className="xs muted mt-1"><b>Durum Sütunları Açıklaması:</b> {INSPECTION_DOC.legend}</div>
          </div>

          {insp.sections.map((sec: any, si: number) => {
            if (sec.kind === 'READINGS') return <ReadingsSection key={sec.code} sec={sec} insp={insp} editable={!!editable} onItem={updateItem} onMeta={(b: any) => saveMeta.mutate(b)} />;
            if (sec.kind === 'FINDINGS') return <FindingsSection key={sec.code} insp={insp} editable={!!editable} onSave={(findings: any[]) => saveMeta.mutate({ findings })} />;
            if (sec.kind === 'APPROVAL') return <ApprovalSection key={sec.code} insp={insp} editable={!!editable} onMeta={(b: any) => saveMeta.mutate(b)} />;
            const items = sec.items.filter(visible);
            if (!items.length && filter !== 'all') return null;
            const filled = sec.items.filter((i: any) => i.result).length;
            const faults = sec.items.filter((i: any) => i.result === 'FAULT').length;
            const attention = sec.items.filter((i: any) => i.result === 'ATTENTION').length;
            const isOpen = open[sec.code] ?? (filter !== 'all' || filled < sec.items.length);
            return (
              <div key={sec.code} className="card insp-sec">
                <div className="insp-sec-head" onClick={() => setOpen({ ...open, [sec.code]: !isOpen })}>
                  <span className="num">{si + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>BÖLÜM {si + 1}: {sec.title}</h3>
                    <div className="xs muted">{filled}/{sec.items.length} değerlendirildi</div>
                  </div>
                  {faults > 0 && <Badge tone="danger">{faults} arıza</Badge>}
                  {attention > 0 && <Badge tone="warn">{attention} dikkat</Badge>}
                  {filled === sec.items.length && !faults && !attention && <Badge tone="ok">Tamam</Badge>}
                  {editable && filled < sec.items.length && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setAll.mutate(sec.code); }}>Kalanları UYGUN yap</button>}
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
                {isOpen &&
                  items.map((it: any) => {
                    const p = prev[it.itemCode];
                    return (
                      <div key={it.id} className="insp-item">
                        <div style={{ minWidth: 0 }}>
                          <div className="strong"><span className="muted mono xs" style={{ marginRight: 6 }}>{si + 1}.{it.itemCode.split('.')[1]}</span>{it.label}</div>
                          {it.description && <div className="xs muted item-desc">{it.description}</div>}
                          {p?.result && (
                            <div className="prev row" style={{ gap: 6, marginTop: 3 }}>
                              <History size={12} /> Önceki ({fmtDate(insp.previous.date, { day: '2-digit', month: 'short' })}):
                              <Badge tone={RESULT_TONE[p.result]} plain>{INSPECTION_RESULT_LABELS[p.result as InspectionResult]}</Badge>
                              {p.measurement && <span>{p.measurement} {it.unit}</span>}
                              {p.note && <span className="truncate" style={{ maxWidth: 260 }}>· {p.note}</span>}
                            </div>
                          )}
                        </div>
                        <div className="result-group">
                          {INSPECTION_RESULTS.map((r) => (
                            <button key={r} title={INSPECTION_RESULT_HINTS[r]} disabled={!editable} className={`result-btn ${r}${it.result === r ? ' on' : ''}`} onClick={() => updateItem(it.id, { result: it.result === r ? null : r })}>
                              {INSPECTION_RESULT_LABELS[r]}
                            </button>
                          ))}
                        </div>
                        {(editable || it.note || it.measurement || it.attachments?.length > 0 || it.result === 'FAULT') && (
                          <div className="extra">
                            <input className="input sm" disabled={!editable} placeholder={it.unit ? `Ölçüm (${it.unit})` : 'Ölçüm değeri'} defaultValue={it.measurement ?? ''} onBlur={(e) => e.target.value !== (it.measurement ?? '') && updateItem(it.id, { measurement: e.target.value })} />
                            <input className="input sm" disabled={!editable} placeholder="Açıklama" defaultValue={it.note ?? ''} onBlur={(e) => e.target.value !== (it.note ?? '') && updateItem(it.id, { note: e.target.value })} />
                            <div className="row" style={{ gap: 6 }}>
                              {editable && <div style={{ width: 140 }}><Uploader compact entityType="INSPECTION_ITEM" entityId={it.id} accept="image/*,video/*" /></div>}
                              {it.result === 'FAULT' && it.fault && (it.fault.workOrderId ? <Link className="btn btn-sm" to={`/work-orders/${it.fault.workOrderId}`}><ClipboardList /> İş emri</Link> : can('workorders.manage') ? <button className="btn btn-sm btn-danger" onClick={() => openWO.mutate(it.id)}><ClipboardList /> İş emri aç</button> : <Badge tone="danger"><AlertTriangle size={12} /> Arıza kaydı</Badge>)}
                              {it.result === 'ATTENTION' && can('workorders.manage') && !it.fault && <button className="btn btn-sm" onClick={() => openWO.mutate(it.id)}>İş emri aç</button>}
                            </div>
                            {it.attachments?.length > 0 && <div style={{ gridColumn: '1 / -1' }}><Gallery items={it.attachments} editable={!!editable} /></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
        <div className="stack">
          <Card title="Denetim bilgileri">
            <KV cols={2} items={[['Tekne', insp.vessel.name], ['Marina', insp.vessel.marina], ['Denetçi', insp.inspectorName || insp.inspector.name], ['Tarih', fmtDate(insp.date)]]} />
            <div className="stack mt-2">
              <Field label="Genel değerlendirme notu"><textarea className="textarea" disabled={!editable} defaultValue={insp.generalNotes ?? ''} onBlur={(e) => saveMeta.mutate({ generalNotes: e.target.value })} /></Field>
              {insp.operationalStatus && <div className="small">Operasyonel statü: <Badge tone={insp.operationalStatus === 'READY' ? 'ok' : insp.operationalStatus === 'FOLLOW_UP' ? 'warn' : 'danger'}>{OPERATIONAL_STATUS_LABELS[insp.operationalStatus as OperationalStatus]}</Badge></div>}
            </div>
          </Card>
          <Card title="Değerlendirme anahtarı">
            <div className="stack" style={{ gap: 8 }}>
              {INSPECTION_RESULTS.map((r) => <div key={r} className="row small"><Badge tone={RESULT_TONE[r]}>{INSPECTION_RESULT_LABELS[r]}</Badge><span className="muted">{INSPECTION_RESULT_HINTS[r]}</span></div>)}
            </div>
            <div className="notice mt-2"><AlertTriangle />ARIZA işaretlenen her madde için otomatik arıza kaydı oluşturulur, teknenin servis geçmişine eklenir ve operasyon yöneticisine bildirim gider.</div>
          </Card>
          {insp.previous && <Card title="Önceki denetim"><Link to={`/inspections/${insp.previous.id}`} className="strong">{insp.previous.number}</Link><div className="small muted">{fmtDate(insp.previous.date)}</div></Card>}
        </div>
      </div>
    </div>
  );
}

/** Bölüm 17 — Haftalık ekipman saatleri ve tank kapasite matrisi */
function ReadingsSection({ sec, insp, editable, onItem, onMeta }: { sec: any; insp: any; editable: boolean; onItem: (id: string, p: Record<string, unknown>) => void; onMeta: (b: any) => void }) {
  const diff = (a?: string, b?: string) => {
    const x = Number(String(a ?? '').replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0]);
    const y = Number(String(b ?? '').replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0]);
    return a && b && Number.isFinite(x) && Number.isFinite(y) ? x - y : null;
  };
  return (
    <div className="card insp-sec">
      <div className="insp-sec-head"><span className="num">17</span><div style={{ flex: 1 }}><h3>BÖLÜM 17: {sec.title}</h3><div className="xs muted">Önceki hafta değerleri bir önceki denetimden otomatik gelir</div></div></div>
      <div className="table-wrap">
        <table className="table matrix-table">
          <thead><tr><th>Ekipman / Donanım / Tank Tanımı</th><th>Bu Hafta Okunan Değer</th><th>Önceki Hafta Değeri</th><th>Haftalık Fark / Teknik Not</th></tr></thead>
          <tbody>
            {sec.items.map((it: any) => {
              const d = diff(it.measurement, it.previousMeasurement);
              return (
                <tr key={it.id}>
                  <td><b>{it.label}</b></td>
                  <td><div className="row" style={{ gap: 6 }}><input className="input sm" disabled={!editable} defaultValue={it.measurement ?? ''} placeholder="………" onBlur={(e) => e.target.value !== (it.measurement ?? '') && onItem(it.id, { measurement: e.target.value })} /><span className="xs muted nowrap">{it.unit}</span></div></td>
                  <td><div className="row" style={{ gap: 6 }}><input className="input sm" disabled={!editable} defaultValue={it.previousMeasurement ?? ''} placeholder="………" onBlur={(e) => e.target.value !== (it.previousMeasurement ?? '') && onItem(it.id, { previousMeasurement: e.target.value })} /><span className="xs muted nowrap">{it.unit}</span></div></td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {d !== null && <Badge tone={d >= 0 ? 'info' : 'warn'} plain>Fark: {d.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</Badge>}
                      {it.itemCode === 'S17.7' ? (
                        <label className="checkbox small"><input type="checkbox" disabled={!editable} checked={!!insp.pumpOutDone} onChange={(e) => onMeta({ pumpOutDone: e.target.checked })} /> Boşaltım (Pump-out) Yapıldı</label>
                      ) : (
                        <input className="input sm" disabled={!editable} defaultValue={it.note ?? ''} placeholder="Teknik not" onBlur={(e) => e.target.value !== (it.note ?? '') && onItem(it.id, { note: e.target.value })} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bölüm 18 — Tespit edilen arızalar, eksikler ve teknik servis ihtiyaçları */
function FindingsSection({ insp, editable, onSave }: { insp: any; editable: boolean; onSave: (rows: any[]) => void }) {
  const [rows, setRows] = useState<any[]>(() => (insp.findings?.length ? insp.findings : Array.from({ length: 6 }, () => ({ description: '', priority: null, responsible: '', serviceStatus: '' }))));
  const faultItems = insp.sections.filter((s: any) => (s.kind ?? 'CHECK') === 'CHECK').flatMap((s: any) => s.items).filter((i: any) => ['FAULT', 'ATTENTION'].includes(i.result));
  const update = (i: number, patch: any, save = false) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setRows(next);
    if (save) onSave(next);
  };
  const importFaults = () => {
    const existing = new Set(rows.map((r) => r.description));
    const add = faultItems
      .map((i: any) => ({ description: `${i.label}${i.note ? ` — ${i.note}` : ''}`, priority: i.result === 'FAULT' ? 'URGENT' : 'MEDIUM', responsible: '', serviceStatus: i.fault?.workOrderId ? 'İş emri açıldı' : 'Bekliyor' }))
      .filter((r: any) => !existing.has(r.description));
    const filled = rows.filter((r) => r.description || r.responsible || r.serviceStatus);
    const next = [...filled, ...add];
    while (next.length < 6) next.push({ description: '', priority: null, responsible: '', serviceStatus: '' });
    setRows(next);
    onSave(next);
  };
  return (
    <div className="card insp-sec">
      <div className="insp-sec-head">
        <span className="num">18</span>
        <div style={{ flex: 1 }}><h3>BÖLÜM 18: TESPİT EDİLEN ARIZALAR, EKSİKLER VE TEKNİK SERVİS İHTİYAÇLARI</h3></div>
        {editable && faultItems.length > 0 && <button className="btn btn-sm" onClick={importFaults}>ARIZA / DİKKAT maddelerini ekle ({faultItems.length})</button>}
      </div>
      <div className="table-wrap">
        <table className="table matrix-table">
          <thead><tr><th style={{ width: 40 }}>No</th><th>Arıza / Eksik / Yapılması Gereken İş Açıklaması</th><th>Öncelik Derecesi</th><th>Sorumlu Kişi</th><th>Servis Durumu</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td><input className="input sm" disabled={!editable} value={r.description ?? ''} onChange={(e) => update(i, { description: e.target.value })} onBlur={() => onSave(rows)} /></td>
                <td>
                  <div className="prio-group">
                    {FINDING_PRIORITIES.map((p) => (
                      <label key={p} className={`prio ${p}${r.priority === p ? ' on' : ''}`}><input type="radio" disabled={!editable} checked={r.priority === p} onChange={() => update(i, { priority: p }, true)} /> {FINDING_PRIORITY_LABELS[p]}</label>
                    ))}
                  </div>
                </td>
                <td><input className="input sm" disabled={!editable} value={r.responsible ?? ''} onChange={(e) => update(i, { responsible: e.target.value })} onBlur={() => onSave(rows)} /></td>
                <td><input className="input sm" disabled={!editable} value={r.serviceStatus ?? ''} onChange={(e) => update(i, { serviceStatus: e.target.value })} onBlur={() => onSave(rows)} /></td>
                <td>{editable && rows.length > 1 && <button className="btn btn-sm btn-ghost" title="Satırı sil" onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); onSave(next); }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <div className="card-body"><button className="btn btn-sm" onClick={() => setRows([...rows, { description: '', priority: null, responsible: '', serviceStatus: '' }])}>+ Satır ekle</button></div>}
    </div>
  );
}

/** Bölüm 19 — Genel operasyonel değerlendirme ve denetim onayı */
function ApprovalSection({ insp, editable, onMeta }: { insp: any; editable: boolean; onMeta: (b: any) => void }) {
  const model = [insp.vessel.make, insp.vessel.model].filter(Boolean).join(' ');
  return (
    <div className="card insp-sec">
      <div className="insp-sec-head"><span className="num">19</span><div style={{ flex: 1 }}><h3>BÖLÜM 19: GENEL OPERASYONEL DEĞERLENDİRME VE DENETİM ONAYI</h3></div></div>
      <div className="card-body stack">
        <div>
          <div className="small strong mb-1">Tekne Genel Operasyonel Statüsü:</div>
          <div className="op-status">
            {OPERATIONAL_STATUSES.map((s) => (
              <label key={s} className={`op ${s}${insp.operationalStatus === s ? ' on' : ''}`}>
                <input type="radio" name="opstatus" disabled={!editable} checked={insp.operationalStatus === s} onChange={() => onMeta({ operationalStatus: s })} /> {OPERATIONAL_STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ fontStyle: 'italic' }}>{INSPECTION_DOC.statement(insp.vessel.name, model)}</p>
        <div className="grid g-2">
          <div className="sign-box">
            <b>Denetimi Yapan Kaptan / Enspektör</b>
            <div className="row" style={{ gap: 6 }}>İsim - Soyisim: <input className="input sm" style={{ maxWidth: 240 }} disabled={!editable} defaultValue={insp.inspectorName || insp.inspector.name} placeholder="Ad Soyad" onBlur={(e) => e.target.value !== (insp.inspectorName || insp.inspector.name) && onMeta({ inspectorName: e.target.value })} /></div>
            <div className="row" style={{ gap: 6 }}>Görevi: <input className="input sm" style={{ maxWidth: 220 }} disabled={!editable} defaultValue={insp.inspectorTitle ?? ''} placeholder="Ör. Teknik Enspektör" onBlur={(e) => e.target.value !== (insp.inspectorTitle ?? '') && onMeta({ inspectorTitle: e.target.value })} /></div>
            <div>İmza: {insp.submittedAt ? <span className="ok-text">✓ Elektronik onay · {fmtDate(insp.submittedAt)}</span> : <span className="muted">Onaya gönderildiğinde imzalanır</span>}</div>
          </div>
          <div className="sign-box">
            <b>Nexus Marin ve Yatçılık Yetkilisi Onayı</b>
            <div>İsim - Soyisim: <b>{insp.approverName ?? '—'}</b></div>
            <div>Kaşe &amp; İmza: {insp.approvedAt ? <span className="ok-text">✓ Elektronik onay · {fmtDate(insp.approvedAt)}</span> : <span className="muted">Yönetici onayında imzalanır</span>}</div>
            <div>Denetim Tarihi: <b>{fmtDate(insp.date)}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
