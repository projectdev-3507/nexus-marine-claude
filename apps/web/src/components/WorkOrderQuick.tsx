import { useNavigate } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { Badge, KV, Loading, Modal, StatusBadge } from './ui';
import { CATEGORY_SHORT, PRIORITY_LABELS, PRIORITY_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';
import { fmtDateTime } from '../lib/format';

/** Takvim ve panelden açılan iş emri detay modalı */
export function WorkOrderQuick({ id, onClose }: { id: string | null; onClose: () => void }) {
  const nav = useNavigate();
  const { data } = useApi<any>(id ? `/work-orders/${id}` : null);
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={data ? `${data.number} · ${data.title}` : 'İş emri'}
      footer={
        <>
          <button className="btn" onClick={onClose}>Kapat</button>
          <button className="btn btn-primary" onClick={() => nav(`/work-orders/${id}`)}>Detaya git</button>
        </>
      }
    >
      {!data ? (
        <Loading />
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="row-wrap">
            <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={data.status} />
            <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={data.priority} />
            {data.category && <Badge tone="info" plain>{CATEGORY_SHORT[data.category]}</Badge>}
          </div>
          {data.description && <p className="muted">{data.description}</p>}
          <KV
            items={[
              ['Tekne', data.vessel?.name],
              ['Marina', [data.vessel?.marina, data.vessel?.berth].filter(Boolean).join(' · ')],
              ['Teknisyen', data.technician?.name],
              ['Planlanan başlangıç', fmtDateTime(data.plannedStart)],
              ['Planlanan bitiş', fmtDateTime(data.plannedEnd)],
              ['Planlanan süre', data.plannedHours ? `${data.plannedHours} saat` : null],
            ]}
          />
        </div>
      )}
    </Modal>
  );
}
