import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Send, CheckCircle2, AlertTriangle, ClipboardList, History } from 'lucide-react';
import { INSPECTION_RESULTS, INSPECTION_RESULT_HINTS, INSPECTION_RESULT_LABELS, type InspectionResult } from '@nexus/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, Field, KV, Loading, PageHeader, Progress, StatusBadge, useToast } from '../components/ui';
import { Gallery, Uploader } from '../components/media';
import { fmtDate } from '../lib/format';
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
  const allItems = useMemo(() => (insp?.sections ?? []).flatMap((s: any) => s.items), [insp]);
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
  const saveMeta = useAction((body: any) => api(`/inspections/${id}`, { method: 'PUT', body }), { invalidate: false });
  const submit = useAction(() => api(`/inspections/${id}/submit`, { body: {} }), { success: 'Denetim onaya gönderildi' });
  const approve = useAction(() => api(`/inspections/${id}/approve`, { body: {} }), { success: 'Denetim onaylandı, rapor oluşturuldu' });
  const openWO = useAction((itemId: string) => api(`/inspections/${id}/items/${itemId}/work-order`, { body: {} }), { success: 'Kontrol maddesinden iş emri açıldı', onSuccess: (w) => nav(`/work-orders/${w.id}`) });

  if (!insp) return <Loading />;
  const prev = insp.previous?.items ?? {};
  const visible = (i: any) => filter === 'all' || (filter === 'issues' ? ['FAULT', 'ATTENTION'].includes(i.result) : !i.result);

  return (
    <div>
      <PageHeader
        crumbs={<><Link to="/inspections">Dijital Denetimler</Link> / {insp.number}</>}
        title={`${insp.vessel.name} — Teknik Denetim`}
        sub={<span className="row-wrap" style={{ gap: 8 }}><span className="mono strong">{insp.number}</span><StatusBadge map={INSP_TONE} labels={INSP_STATUS_LABELS} value={insp.status} /><span>{fmtDate(insp.date)}</span></span>}
        actions={
          <>
            <a className="btn" href={authedUrl(`/inspections/${id}/pdf`)} target="_blank" rel="noreferrer"><FileText /> PDF Rapor</a>
            {editable && insp.status === 'DRAFT' && <button className="btn btn-primary" disabled={stats.filled < allItems.length} onClick={() => submit.mutate(undefined)}><Send /> Onaya gönder</button>}
            {manager && insp.status === 'SUBMITTED' && <button className="btn btn-success" onClick={() => approve.mutate(undefined)}><CheckCircle2 /> Denetimi onayla</button>}
            {insp.report && <Link className="btn" to={`/reports/${insp.report.id}`}>Rapor {insp.report.number}</Link>}
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

          {insp.sections.map((sec: any, si: number) => {
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
                    <h3>{sec.title}</h3>
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
                          <div className="strong"><span className="muted mono xs" style={{ marginRight: 6 }}>{it.itemCode.split('.')[1]}</span>{it.label}</div>
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
            <KV cols={2} items={[['Tekne', insp.vessel.name], ['Marina', insp.vessel.marina], ['Denetçi', insp.inspector.name], ['Tarih', fmtDate(insp.date)]]} />
            <div className="stack mt-2">
              <Field label="Kaptan"><input className="input" disabled={!editable} defaultValue={insp.captainName ?? ''} onBlur={(e) => saveMeta.mutate({ captainName: e.target.value })} /></Field>
              <Field label="Genel operasyonel değerlendirme"><textarea className="textarea" disabled={!editable} defaultValue={insp.generalNotes ?? ''} onBlur={(e) => saveMeta.mutate({ generalNotes: e.target.value })} /></Field>
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
