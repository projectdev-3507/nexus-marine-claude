import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, login } from './helpers';
import { prisma } from '../src/db';
import { notify } from '../src/services/notify';
import { runScheduledJobs } from '../src/services/scheduler';

type Client = Awaited<ReturnType<typeof login>>;
let admin: Client, ops: Client, tech: Client, captain: Client, owner: Client;

beforeAll(async () => {
  [admin, ops, tech, captain, owner] = await Promise.all([
    login('admin@nexusmarine.com'),
    login('operasyon@nexusmarine.com'),
    login('teknisyen@nexusmarine.com'),
    login('kaptan@nexusmarine.com'),
    login('musteri@nexusmarine.com'),
  ]);
});

describe('kimlik doğrulama', () => {
  it('hatalı şifreyi reddeder', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@nexusmarine.com', password: 'yanlis' });
    expect(r.status).toBe(401);
  });
  it('token olmadan erişimi engeller', async () => {
    expect((await request(app).get('/api/vessels')).status).toBe(401);
  });
  it('me uç noktası yetkileri döner', async () => {
    const r = await owner.get('/api/auth/me');
    expect(r.body.permissions).toContain('quotes.respond');
    expect(r.body.permissions).not.toContain('finance.view');
  });
});

describe('rol bazlı veri izolasyonu', () => {
  it('tekne sahibi yalnızca kendi teknelerini görür', async () => {
    const r = await owner.get('/api/vessels');
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'musteri@nexusmarine.com' } });
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const v of r.body.items) expect(v.owner.id).toBe(me.customerId);
  });
  it('başka müşterinin teknesine URL ile erişilemez', async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'musteri@nexusmarine.com' } });
    const other = await prisma.vessel.findFirstOrThrow({ where: { ownerId: { not: me.customerId } } });
    expect((await owner.get(`/api/vessels/${other.id}`)).status).toBe(404);
    const wo = await prisma.workOrder.findFirstOrThrow({ where: { vesselId: other.id } });
    expect((await owner.get(`/api/work-orders/${wo.id}`)).status).toBe(404);
    expect((await owner.post('/api/work-orders', { vesselId: other.id, title: 'Sızma denemesi' })).status).toBe(404);
  });
  it('müşteri finans, kullanıcı ve stok verisine erişemez', async () => {
    for (const p of ['/api/payments/summary', '/api/users', '/api/inventory', '/api/customers', `/api/vessels/x/costs`]) {
      expect((await owner.get(p)).status).toBe(403);
    }
  });
  it('müşteri iş emrinde dahili yorum ve malzeme maliyetini görmez', async () => {
    const r = await owner.get('/api/work-orders?pageSize=50');
    const detail = await owner.get(`/api/work-orders/${r.body.items[0].id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.materials).toBeUndefined();
    for (const c of detail.body.comments ?? []) expect(c.internal).toBe(false);
  });
  it('teknisyen yalnızca kendisine atanmış iş emirlerini görür', async () => {
    const r = await tech.get('/api/work-orders?pageSize=200');
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const w of r.body.items) expect(w.technicianId).toBe(tech.user.id);
  });
  it('kaptan yalnızca ilişkilendirildiği tekneleri görür', async () => {
    const r = await captain.get('/api/vessels?pageSize=100');
    const links = await prisma.vesselMember.findMany({ where: { userId: captain.user.id } });
    expect(r.body.total).toBe(links.length);
  });
  it('operasyon yöneticisi finans verisini göremez', async () => {
    expect((await ops.get('/api/payments/summary')).status).toBe(403);
    expect((await admin.get('/api/payments/summary')).status).toBe(200);
  });
});

describe('iş emri akışı', () => {
  it('talep → atama → işlem → kontrol → tamamlandı → yayın akışını ve geçmişi kaydeder', async () => {
    const vessel = (await owner.get('/api/vessels')).body.items[0];
    const created = await owner.post('/api/work-orders', { vesselId: vessel.id, title: 'Klima su damlatıyor', priority: 'HIGH' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('REQUESTED');
    const id = created.body.id;

    // Yöneticiye müşteri talebi bildirimi
    expect(await prisma.notification.count({ where: { userId: ops.user.id, entityId: id, type: 'CUSTOMER_REQUEST' } })).toBe(1);

    // Teknisyen başkasının işini başlatamaz
    expect((await tech.post(`/api/work-orders/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(404);

    const assigned = await ops.post(`/api/work-orders/${id}/assign`, { technicianId: tech.user.id });
    expect(assigned.body.status).toBe('ASSIGNED');
    expect(await prisma.notification.count({ where: { userId: tech.user.id, entityId: id, type: 'TASK_ASSIGNED' } })).toBe(1);

    // Geçersiz geçiş
    expect((await tech.post(`/api/work-orders/${id}/status`, { status: 'COMPLETED' })).status).toBe(400);
    expect((await tech.post(`/api/work-orders/${id}/status`, { status: 'IN_PROGRESS' })).body.startedAt).toBeTruthy();
    const review = await tech.post(`/api/work-orders/${id}/status`, { status: 'TECHNICAL_REVIEW' });
    expect(review.body.status).toBe('TECHNICAL_REVIEW');
    expect(await prisma.notification.count({ where: { userId: ops.user.id, entityId: id, type: 'REVIEW_REQUIRED' } })).toBe(1);

    // Teknisyen kendi işini onaylayamaz
    expect((await tech.post(`/api/work-orders/${id}/status`, { status: 'COMPLETED' })).status).toBe(403);
    expect((await ops.post(`/api/work-orders/${id}/status`, { status: 'COMPLETED' })).status).toBe(200);

    // Müşteri özeti olmadan yayınlanamaz
    expect((await ops.post(`/api/work-orders/${id}/status`, { status: 'PUBLISHED' })).status).toBe(400);
    const pub = await ops.post(`/api/work-orders/${id}/status`, { status: 'PUBLISHED', customerSummary: 'Drenaj hattı temizlendi.' });
    expect(pub.body.status).toBe('PUBLISHED');
    expect(await prisma.notification.count({ where: { userId: owner.user.id, entityId: id, type: 'SERVICE_COMPLETED' } })).toBe(1);

    const history = await prisma.workOrderHistory.findMany({ where: { workOrderId: id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.toStatus)).toEqual(['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED']);
    expect(history.every((h) => h.userId)).toBe(true);
    expect(history[3].fromStatus).toBe('ASSIGNED');

    const ownerView = await owner.get(`/api/work-orders/${id}`);
    expect(ownerView.body.customerSummary).toBe('Drenaj hattı temizlendi.');
  });

  it('malzeme kullanımı stoktan düşer', async () => {
    const wo = await prisma.workOrder.findFirstOrThrow({ where: { technicianId: tech.user.id, status: 'IN_PROGRESS' } });
    const m = await prisma.material.findFirstOrThrow();
    const r = await tech.post(`/api/work-orders/${wo.id}/materials`, { materialId: m.id, quantity: 2 });
    expect(r.status).toBe(201);
    expect((await prisma.material.findUniqueOrThrow({ where: { id: m.id } })).stock).toBe(m.stock - 2);
  });
});

describe('dijital denetim otomasyonu', () => {
  it('ARIZA işaretlenince arıza kaydı + bildirim oluşur, iş emri açılabilir', async () => {
    const vessel = await prisma.vessel.findFirstOrThrow({ where: { name: 'M/Y ANY' } });
    const insp = await tech.post('/api/inspections', { vesselId: vessel.id });
    expect(insp.status).toBe(201);
    const detail = await tech.get(`/api/inspections/${insp.body.id}`);
    expect(detail.body.sections).toHaveLength(19);
    expect(detail.body.previous).not.toBeNull();
    const item = detail.body.sections[5].items[0];

    const before = await prisma.notification.count({ where: { userId: ops.user.id, type: 'CRITICAL_FAULT' } });
    const r = await tech.put(`/api/inspections/${insp.body.id}/items/${item.id}`, { result: 'FAULT', note: 'Akü voltajı düşük', measurement: '21.4' });
    expect(r.body.fault).toBeTruthy();
    const fault = await prisma.fault.findUniqueOrThrow({ where: { inspectionItemId: item.id } });
    expect(fault.vesselId).toBe(vessel.id);
    expect(await prisma.notification.count({ where: { userId: ops.user.id, type: 'CRITICAL_FAULT' } })).toBe(before + 1);

    // Tekrar kaydetme yeni arıza/bildirim üretmez
    await tech.put(`/api/inspections/${insp.body.id}/items/${item.id}`, { result: 'FAULT', note: 'Akü voltajı düşük (tekrar)' });
    expect(await prisma.fault.count({ where: { inspectionItemId: item.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ops.user.id, type: 'CRITICAL_FAULT' } })).toBe(before + 1);

    // Servis geçmişinde görünür
    const timeline = await ops.get(`/api/vessels/${vessel.id}/timeline`);
    expect(timeline.body.some((e: any) => e.kind === 'FAULT' && e.id === fault.id)).toBe(true);

    // Kontrol maddesinden iş emri
    const wo = await ops.post(`/api/inspections/${insp.body.id}/items/${item.id}/work-order`, {});
    expect(wo.status).toBe(201);
    expect((await prisma.fault.findUniqueOrThrow({ where: { id: fault.id } })).workOrderId).toBe(wo.body.id);

    // Eksik maddeyle gönderilemez
    expect((await tech.post(`/api/inspections/${insp.body.id}/submit`)).status).toBe(400);
    const all = detail.body.sections.flatMap((s: any) => s.items).filter((i: any) => i.id !== item.id).map((i: any) => ({ id: i.id, result: 'OK' }));
    expect((await tech.put(`/api/inspections/${insp.body.id}/items`, { items: all })).status).toBe(200);
    expect((await tech.post(`/api/inspections/${insp.body.id}/submit`)).status).toBe(200);
    const approved = await ops.post(`/api/inspections/${insp.body.id}/approve`);
    expect(approved.body.reportId).toBeTruthy();
    const pdf = await ops.get(`/api/inspections/${insp.body.id}/pdf`);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.length ?? Number(pdf.headers['content-length'] ?? 1)).toBeGreaterThan(0);
  });
});

describe('rapor sürümleme ve onay', () => {
  it('onaylı rapor düzenlenince yeni sürüm oluşur; beyanlar yalnızca onayla eklenir', async () => {
    const vessel = await prisma.vessel.findFirstOrThrow({ where: { name: 'M/Y ANY' } });
    const r = await ops.post('/api/reports', { type: 'TEAK_CARPENTRY', vesselId: vessel.id });
    expect(r.status).toBe(201);
    const id = r.body.id;
    // Taslağı düzenle: aynı sürüm
    await ops.put(`/api/reports/${id}`, { data: { summary: 'Kıç güverte', areas: [{ area: 'Kıç güverte', quantity: 18, progress: 50 }] } });
    expect(await prisma.reportVersion.count({ where: { reportId: id } })).toBe(1);
    // Operasyon yöneticisi onaylayabilir
    const ap = await ops.post(`/api/reports/${id}/approve`, { clauses: [{ key: 'WARRANTY' }, { key: 'GEÇERSİZ' }] });
    expect(ap.status).toBe(200);
    const v1 = await prisma.reportVersion.findFirstOrThrow({ where: { reportId: id, version: 1 } });
    expect(v1.status).toBe('APPROVED');
    expect((v1.clauses as any[]).map((c) => c.key)).toEqual(['WARRANTY']);
    // Onaylı sürüm düzenlenirse v2 taslak açılır
    await ops.put(`/api/reports/${id}`, { data: { summary: 'Revize', areas: [] } });
    const versions = await prisma.reportVersion.findMany({ where: { reportId: id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => [v.version, v.status])).toEqual([[1, 'APPROVED'], [2, 'DRAFT']]);
    expect((versions[1].data as any).summary).toBe('Revize');
    // Müşteri yayınlanmamış raporu göremez
    expect((await owner.get(`/api/reports/${id}`)).status).toBe(404);
    await ops.post(`/api/reports/${id}/approve`, {});
    await ops.post(`/api/reports/${id}/publish`);
    const v = await prisma.reportVersion.findMany({ where: { reportId: id }, orderBy: { version: 'asc' } });
    expect(v.map((x) => x.status)).toEqual(['SUPERSEDED', 'PUBLISHED']);
    const ownerView = await owner.get(`/api/reports/${id}`);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.versions).toHaveLength(1);
    // Teknisyen rapor onaylayamaz
    expect((await tech.post(`/api/reports/${id}/approve`)).status).toBe(403);
  });
});

describe('teklif onayı', () => {
  it('müşteri kendisine gönderilen teklifi onaylar, yönetici bilgilendirilir', async () => {
    const list = await owner.get('/api/quotes');
    const sent = list.body.items.find((q: any) => q.status === 'SENT');
    expect(sent.total).toBeCloseTo(sent.subtotal * 1.2, 2);
    const r = await owner.post(`/api/quotes/${sent.id}/respond`, { decision: 'APPROVED', note: 'Uygundur' });
    expect(r.body.status).toBe('APPROVED');
    expect((await owner.post(`/api/quotes/${sent.id}/respond`, { decision: 'REJECTED' })).status).toBe(400);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, entityId: sent.id, type: 'QUOTE_RESPONSE' } })).toBe(1);
  });
});

describe('bildirimler', () => {
  it('aynı dedupeKey ile tekrar bildirim üretmez', async () => {
    const n1 = await notify([ops.user.id], { type: 'OVERDUE', title: 'Test', dedupeKey: 'test-dedupe' });
    const n2 = await notify([ops.user.id], { type: 'OVERDUE', title: 'Test', dedupeKey: 'test-dedupe' });
    expect([n1, n2]).toEqual([1, 0]);
  });
  it('zamanlayıcı tekrar çalıştığında yeni bildirim üretmez', async () => {
    await runScheduledJobs();
    const c1 = await prisma.notification.count();
    await runScheduledJobs();
    expect(await prisma.notification.count()).toBe(c1);
  });
  it('okundu işaretleme', async () => {
    const r = await ops.get('/api/notifications?unread=true');
    expect(r.body.unread).toBeGreaterThan(0);
    await ops.post('/api/notifications/read-all');
    expect((await ops.get('/api/notifications/unread-count')).body.unread).toBe(0);
  });
});

describe('proje ilerlemesi', () => {
  it('ilerleme tamamlanan iş kalemlerinden hesaplanır, ek işler süreye yansır', async () => {
    const p = await prisma.project.findFirstOrThrow({ where: { name: { contains: 'SEA RODS' } } });
    const r = await admin.get(`/api/projects/${p.id}`);
    expect(r.body.progress).toBeGreaterThan(30);
    expect(r.body.progress).toBeLessThan(70);
    expect(r.body.impact.extraDays).toBe(2);
    expect(r.body.finance.balance).toBe(68500 + 2400 - 35000);
    const ownerSide = await login('sahip2@example.com');
    const o = await ownerSide.get(`/api/projects/${p.id}`);
    expect(o.body.budget).toBeUndefined();
    expect(o.body.payments).toBeUndefined();
  });
});
