import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Trash2, Upload, FileText, Download } from 'lucide-react';
import { api, fileUrl, uploadFiles } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { Badge, Empty } from './ui';

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  caption?: string | null;
  tag?: string | null;
  customerVisible: boolean;
  createdAt: string;
  uploadedById?: string | null;
}

export function Uploader({ entityType, entityId, onDone, compact, tagOptions, accept = 'image/*,application/pdf' }: { entityType: string; entityId: string; onDone?: () => void; compact?: boolean; tagOptions?: boolean; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [tag, setTag] = useState('GENERAL');
  const { manager } = useAuth();
  const [visible, setVisible] = useState(false);
  const up = useAction((files: FileList) => uploadFiles(entityType, entityId, files, { tag: tagOptions ? tag : undefined, customerVisible: manager ? visible : undefined }), { success: 'Dosya yüklendi', onSuccess: onDone });
  const handle = (files?: FileList | null) => files?.length && up.mutate(files);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {(tagOptions || manager) && !compact && (
        <div className="row-wrap">
          {tagOptions && (
            <select className="select sm" style={{ width: 160 }} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="GENERAL">Genel</option>
              <option value="BEFORE">Önce</option>
              <option value="AFTER">Sonra</option>
            </select>
          )}
          {manager && (
            <label className="checkbox small">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Müşteriye görünür (onaylı)
            </label>
          )}
        </div>
      )}
      <div
        className={`dropzone${over ? ' over' : ''}`}
        style={compact ? { padding: 8 } : undefined}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        <input ref={ref} type="file" accept={accept} multiple hidden capture={undefined} onChange={(e) => handle(e.target.files)} />
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          {up.isPending ? <span>Yükleniyor...</span> : (
            <>
              {compact ? <Camera size={16} /> : <Upload size={18} />}
              <span className="small strong">{compact ? 'Fotoğraf ekle' : 'Fotoğraf / belge yükle — sürükleyip bırakın veya tıklayın'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Gallery({ items, editable }: { items: Attachment[]; editable?: boolean }) {
  const { manager, user } = useAuth();
  const [zoom, setZoom] = useState<string | null>(null);
  const toggle = useAction((a: Attachment) => api(`/files/${a.id}`, { method: 'PATCH', body: { customerVisible: !a.customerVisible } }), { success: 'Görünürlük güncellendi' });
  const del = useAction((a: Attachment) => api(`/files/${a.id}`, { method: 'DELETE' }), { success: 'Dosya silindi' });
  const images = items.filter((i) => i.mimeType.startsWith('image/'));
  const docs = items.filter((i) => !i.mimeType.startsWith('image/'));
  if (!items.length) return <Empty title="Henüz dosya yok" icon={<Camera />} />;
  return (
    <>
      {images.length > 0 && (
        <div className="photo-grid">
          {images.map((a) => (
            <div className="photo" key={a.id}>
              <img src={fileUrl(a.id)} alt={a.caption ?? a.fileName} loading="lazy" onClick={() => setZoom(fileUrl(a.id))} />
              <div className="ph-tag row" style={{ gap: 4 }}>
                {a.tag === 'BEFORE' && <Badge tone="navy" plain>ÖNCE</Badge>}
                {a.tag === 'AFTER' && <Badge tone="ok" plain>SONRA</Badge>}
                {manager && !a.customerVisible && <Badge tone="warn" plain>Dahili</Badge>}
              </div>
              {editable && (manager || a.uploadedById === user?.id) && (
                <div className="ph-actions">
                  {manager && (
                    <button className="btn btn-sm btn-icon" title={a.customerVisible ? 'Müşteriden gizle' : 'Müşteriye yayınla'} onClick={() => toggle.mutate(a)}>
                      {a.customerVisible ? <Eye /> : <EyeOff />}
                    </button>
                  )}
                  <button className="btn btn-sm btn-icon" title="Sil" onClick={() => confirm('Dosya silinsin mi?') && del.mutate(a)}>
                    <Trash2 />
                  </button>
                </div>
              )}
              {a.caption && <div className="ph-cap">{a.caption}</div>}
            </div>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="stack mt-2" style={{ gap: 6 }}>
          {docs.map((a) => (
            <div key={a.id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
              <FileText size={18} color="var(--marine)" />
              <span className="grow truncate strong" style={{ flex: 1 }}>{a.fileName}</span>
              {manager && !a.customerVisible && <Badge tone="warn" plain>Dahili</Badge>}
              <a className="btn btn-sm" href={fileUrl(a.id, true)}>
                <Download />
              </a>
            </div>
          ))}
        </div>
      )}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
        </div>
      )}
    </>
  );
}
