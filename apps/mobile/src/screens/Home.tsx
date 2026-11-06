import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WORK_ORDER_STATUS_LABELS, PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from '@nexus/shared';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { fileUrl } from '../lib/api';
import { C, MAINT_TONE, PRIORITY_TONE, WO_TONE, fmtDate, relTime } from '../lib/theme';
import { Avatar, Badge, Button, Card, DateTile, Empty, H1, Kpi, Loading, Muted, Progress, Row, Screen } from '../components/ui';

const greet = () => (new Date().getHours() < 12 ? 'Günaydın' : new Date().getHours() < 18 ? 'İyi günler' : 'İyi akşamlar');

/** Operasyon yöneticisi — genel bakış */
export function ManagerHome() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const q = useApi<any>('/dashboard', undefined, { refetchInterval: 60_000 });
  const d = q.data;
  if (!d) return <Loading />;
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 18, gap: 4 }}>
        <Text style={{ color: '#8FB3D9', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{greet()}, {user?.name.split(' ')[0]}</Text>
        <Text style={{ color: '#B9CDE4' }}>{d.kpis.reviewPending} iş teknik kontrol bekliyor · {d.kpis.overdueMaintenance} gecikmiş bakım</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Kpi label="Aktif Tekneler" value={d.kpis.activeVessels} icon="boat-outline" color={C.marine} bg={C.sky} onPress={() => nav.navigate('Vessels')} />
        <Kpi label="Bu Haftaki Bakımlar" value={d.kpis.weekMaintenance} icon="calendar-outline" color={C.violet} bg={C.violetBg} onPress={() => nav.navigate('Agenda')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Kpi label="Açık İş Emirleri" value={d.kpis.openWorkOrders} icon="clipboard-outline" color={C.warn} bg={C.warnBg} onPress={() => nav.navigate('Tasks')} />
        <Kpi label="Tamamlanan (ay)" value={d.kpis.completedTasks} icon="checkmark-circle-outline" color={C.ok} bg={C.okBg} />
      </View>
      {d.criticalFaults.length > 0 && (
        <Card title="Kritik Arızalar" padded={false}>
          {d.criticalFaults.map((f: any) => (
            <Row key={f.id} title={f.title} sub={`${f.vessel.name} · ${relTime(f.createdAt)}`} left={<Ionicons name="alert-circle" size={22} color={f.severity === 'CRITICAL' ? C.danger : C.warn} />} right={f.workOrder ? <Badge tone="info" label={f.workOrder.number} /> : <Badge tone="danger" label="İş emri yok" />} onPress={() => (f.workOrder ? nav.navigate('WorkOrder', { id: f.workOrder.id }) : nav.navigate('Vessel', { id: f.vessel.id }))} />
          ))}
        </Card>
      )}
      <Card title="Yaklaşan İşler" padded={false}>
        {d.upcoming.length === 0 && <Empty title="Yaklaşan iş yok" />}
        {d.upcoming.map((w: any) => (
          <Row key={w.id} title={w.title} sub={`${w.vessel.name} · ${w.technician?.name ?? 'Atanmadı'}`} left={<DateTile date={w.plannedStart} />} right={<Badge tone={PRIORITY_TONE[w.priority]} label={PRIORITY_LABELS[w.priority as keyof typeof PRIORITY_LABELS]} />} onPress={() => nav.navigate('WorkOrder', { id: w.id })} />
        ))}
      </Card>
      <Card title="Teknisyen Durumları" padded={false} right={<Pressable onPress={() => nav.navigate('Technicians')}><Text style={{ color: C.marine, fontWeight: '600' }}>Tümü</Text></Pressable>}>
        {d.technicians.slice(0, 6).map((t: any) => (
          <Row key={t.id} title={t.name} sub={t.current ? `${t.current.vessel.name} · ${t.current.title}` : t.title} left={<Avatar name={t.name} />} right={<Badge tone={t.status === 'ON_TASK' ? 'warn' : t.status === 'ASSIGNED' ? 'info' : 'ok'} label={t.status === 'ON_TASK' ? 'Görevde' : t.status === 'ASSIGNED' ? 'Atanmış' : 'Müsait'} />} />
        ))}
      </Card>
    </Screen>
  );
}

/** Teknisyen — Görevlerim */
export function TechnicianHome() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const q = useApi<any>('/work-orders', { group: 'open', pageSize: 100, sort: 'plannedStart', order: 'asc' });
  const items = q.data?.items ?? [];
  const active = items.filter((w: any) => w.status === 'IN_PROGRESS');
  const todo = items.filter((w: any) => ['ASSIGNED', 'REVISION_REQUIRED'].includes(w.status));
  const waiting = items.filter((w: any) => ['TECHNICAL_REVIEW', 'ON_HOLD'].includes(w.status));
  const card = (w: any) => (
    <Pressable key={w.id} onPress={() => nav.navigate('WorkOrder', { id: w.id })} style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8, borderLeftWidth: 4, borderLeftColor: w.priority === 'CRITICAL' ? C.danger : w.status === 'IN_PROGRESS' ? C.warn : C.marine }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={2}>{w.title}</Text>
        <Badge tone={WO_TONE[w.status]} label={WORK_ORDER_STATUS_LABELS[w.status as keyof typeof WORK_ORDER_STATUS_LABELS]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <Muted><Ionicons name="boat-outline" size={13} /> {w.vessel.name}</Muted>
        <Muted><Ionicons name="location-outline" size={13} /> {w.vessel.marina}</Muted>
        {w.plannedStart && <Muted><Ionicons name="time-outline" size={13} /> {new Date(w.plannedStart).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Muted>}
      </View>
    </Pressable>
  );
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <View>
        <Muted>{greet()}</Muted>
        <H1>{user?.name}</H1>
      </View>
      {q.isLoading && <Loading />}
      {active.length > 0 && <Text style={{ fontWeight: '700', color: C.text2 }}>Devam eden ({active.length})</Text>}
      {active.map(card)}
      <Text style={{ fontWeight: '700', color: C.text2 }}>Sıradaki görevler ({todo.length})</Text>
      {todo.length === 0 && !q.isLoading && <Card><Empty title="Atanmış yeni görev yok" icon="checkmark-done-outline" /></Card>}
      {todo.map(card)}
      {waiting.length > 0 && <Text style={{ fontWeight: '700', color: C.text2 }}>Kontrol / beklemede ({waiting.length})</Text>}
      {waiting.map(card)}
    </Screen>
  );
}

/** Tekne sahibi — Teknem */
export function OwnerHome() {
  const nav = useNavigation<any>();
  const { user, can } = useAuth();
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items;
  const [idx, setIdx] = useState(0);
  const v = vessels?.[idx];
  const photos = useApi<any[]>(v ? '/files' : null, { vesselId: v?.id }).data ?? [];
  const wq = useApi<any>(v ? '/work-orders' : null, { vesselId: v?.id, pageSize: 50 });
  const maint = useApi<any>(v ? '/maintenance' : null, { vesselId: v?.id, upcoming: 'true', pageSize: 3 }).data?.items ?? [];
  const projects = useApi<any>(v ? '/projects' : null, { vesselId: v?.id }).data?.items ?? [];
  const quotes = useApi<any>(can('quotes.respond') ? '/quotes' : null, { status: 'SENT' }).data?.items ?? [];
  if (!vessels) return <Loading />;
  if (!v) return <Screen><Empty title="Hesabınıza bağlı tekne yok" text="Nexus Marine operasyon ekibiyle iletişime geçin." /></Screen>;
  const open = (wq.data?.items ?? []).filter((w: any) => !['CLOSED', 'CANCELLED', 'PUBLISHED'].includes(w.status));
  const current = open.find((w: any) => w.status === 'IN_PROGRESS') ?? open[0];
  const cover = photos.find((p) => p.mimeType.startsWith('image/'));
  return (
    <Screen refreshing={wq.isFetching} onRefresh={wq.refetch}>
      <View><Muted>Hoş geldiniz</Muted><H1>{user?.name}</H1></View>
      <Pressable onPress={() => nav.navigate('Vessel', { id: v.id })} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: C.navy, height: 210, justifyContent: 'flex-end' }}>
        {cover ? <Image source={{ uri: fileUrl(cover.id) }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : <Ionicons name="boat" size={140} color="rgba(255,255,255,0.08)" style={{ position: 'absolute', right: -10, top: 10 }} />}
        <View style={{ padding: 18, backgroundColor: 'rgba(7,24,46,0.55)' }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{v.name}</Text>
          <Text style={{ color: '#C9D9EA' }}>{[v.make, v.model].filter(Boolean).join(' ')} · {v.marina}</Text>
        </View>
      </Pressable>
      {vessels.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {vessels.map((x: any, i: number) => <Button key={x.id} small title={x.name} variant={i === idx ? 'primary' : 'secondary'} onPress={() => setIdx(i)} />)}
        </View>
      )}
      {quotes.length > 0 && (
        <Pressable onPress={() => nav.navigate('Quote', { id: quotes[0].id })} style={{ backgroundColor: C.sky, padding: 14, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="receipt-outline" size={20} color={C.marine} />
          <Text style={{ color: '#0F4C85', flex: 1 }}><Text style={{ fontWeight: '700' }}>{quotes.length} teklif</Text> onayınızı bekliyor</Text>
          <Ionicons name="chevron-forward" size={18} color={C.marine} />
        </Pressable>
      )}
      <Card title="Güncel servis durumu">
        {current ? (
          <Pressable onPress={() => nav.navigate('WorkOrder', { id: current.id })} style={{ gap: 8 }}>
            <Text style={{ fontWeight: '700', color: C.navy }}>{current.title}</Text>
            <Muted>{current.number} · {current.technician?.name ?? 'Planlanıyor'}</Muted>
            <Tracker status={current.status} />
          </Pressable>
        ) : <Empty title="Aktif servis yok" icon="checkmark-circle-outline" />}
      </Card>
      <Card title="Yaklaşan bakım" padded={false}>
        {maint.length === 0 && <Empty title="Planlı bakım yok" />}
        {maint.map((m: any) => <Row key={m.id} title={m.title} sub={fmtDate(m.plannedDate)} left={<DateTile date={m.plannedDate} />} right={<Badge tone={MAINT_TONE[m.status]} label={MAINTENANCE_STATUS_LABELS[m.status as keyof typeof MAINTENANCE_STATUS_LABELS]} />} />)}
      </Card>
      <Card title={`Açık talepler (${open.length})`} padded={false}>
        {open.length === 0 && <Empty title="Açık talep yok" />}
        {open.slice(0, 5).map((w: any) => <Row key={w.id} title={w.title} sub={w.number} right={<Badge tone={WO_TONE[w.status]} label={WORK_ORDER_STATUS_LABELS[w.status as keyof typeof WORK_ORDER_STATUS_LABELS]} />} onPress={() => nav.navigate('WorkOrder', { id: w.id })} />)}
      </Card>
      {projects.map((p: any) => (
        <Card key={p.id} title="Restorasyon projesi">
          <Text style={{ fontWeight: '700', color: C.navy }}>{p.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}><View style={{ flex: 1 }}><Progress value={p.progress} /></View><Text style={{ fontWeight: '700' }}>%{p.progress}</Text></View>
          <Muted style={{ marginTop: 6 }}>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const STEPS = ['Talep alındı', 'Planlandı', 'İşlemde', 'Kontrolde', 'Tamamlandı'];
const stepOf = (s: string) => ({ REQUESTED: 0, EVALUATION: 0, PLANNED: 1, ASSIGNED: 1, IN_PROGRESS: 2, ON_HOLD: 2, REVISION_REQUIRED: 2, TECHNICAL_REVIEW: 3, COMPLETED: 3, PUBLISHED: 4, CLOSED: 4 } as Record<string, number>)[s] ?? 0;
export function Tracker({ status }: { status: string }) {
  const n = stepOf(status);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>{STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= n ? (n === 4 ? C.ok : C.marine) : C.neutralBg }} />)}</View>
      <Text style={{ color: C.marine, fontWeight: '700', fontSize: 13 }}>{STEPS[n]}</Text>
    </View>
  );
}

/** Kaptan — sorumlu olduğu tekneler */
export function CaptainHome() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const q = useApi<any>('/vessels', { pageSize: 50 });
  const upcoming = useApi<any>('/maintenance', { upcoming: 'true', pageSize: 5 }).data?.items ?? [];
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <View><Muted>{greet()}</Muted><H1>{user?.name}</H1></View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Arıza bildir" icon="warning-outline" variant="danger" style={{ flex: 1 }} onPress={() => nav.navigate('NewRequest', { type: 'fault' })} />
        <Button title="Bakım talebi" icon="construct-outline" style={{ flex: 1 }} onPress={() => nav.navigate('NewRequest', { type: 'service' })} />
      </View>
      <Card title="Sorumlu olduğum tekneler" padded={false}>
        {(q.data?.items ?? []).map((v: any) => (
          <Row key={v.id} title={v.name} sub={`${v.marina ?? ''} · ${v.berth ?? ''}`} left={<View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="boat" size={18} color="#fff" /></View>} right={v._count.faults > 0 ? <Badge tone="danger" label={`${v._count.faults} arıza`} /> : v._count.workOrders > 0 ? <Badge tone="warn" label={`${v._count.workOrders} açık iş`} /> : <Badge tone="ok" label="Sorunsuz" />} onPress={() => nav.navigate('Vessel', { id: v.id })} />
        ))}
      </Card>
      <Card title="Yaklaşan bakımlar" padded={false}>
        {upcoming.length === 0 && <Empty title="Planlı bakım yok" />}
        {upcoming.map((m: any) => <Row key={m.id} title={m.title} sub={m.vessel.name} left={<DateTile date={m.plannedDate} />} right={<Badge tone={MAINT_TONE[m.status]} label={MAINTENANCE_STATUS_LABELS[m.status as keyof typeof MAINTENANCE_STATUS_LABELS]} />} />)}
      </Card>
    </Screen>
  );
}
