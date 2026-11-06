import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, QUOTE_STATUS_LABELS, WORK_ORDER_STATUS_LABELS } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl, fileUrl, uploadPhoto } from '../lib/api';
import * as ImagePicker from 'expo-image-picker';
import { C, MAINT_TONE, PRIORITY_TONE, WO_TONE, fmtDate, fmtMoney, relTime } from '../lib/theme';
import { Avatar, Badge, Button, Card, Chips, DateTile, Empty, H1, Input, Loading, Muted, Row, Screen } from '../components/ui';

const woLabel = (s: string) => WORK_ORDER_STATUS_LABELS[s as keyof typeof WORK_ORDER_STATUS_LABELS] ?? s;

/** Görevler / servis takibi / talepler */
export function WorkOrdersList() {
  const nav = useNavigation<any>();
  const { mode, can } = useAuth();
  const [group, setGroup] = useState<'open' | 'review' | 'done' | ''>('open');
  const q = useApi<any>('/work-orders', { group: group || undefined, pageSize: 100 });
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      {can('workorders.request') && mode !== 'manager' && <Button title="Yeni talep / arıza bildirimi" icon="add" onPress={() => nav.navigate('NewRequest', {})} />}
      <Chips value={group} onChange={setGroup} options={[['open', 'Açık'], ...(mode === 'manager' ? ([['review', 'Kontrol bekleyen']] as Array<[any, string]>) : []), ['done', 'Tamamlanan'], ['', 'Tümü']]} />
      <Card padded={false}>
        {q.isLoading && <Loading />}
        {(q.data?.items ?? []).length === 0 && !q.isLoading && <Empty />}
        {(q.data?.items ?? []).map((w: any) => (
          <Row key={w.id} title={w.title} sub={`${w.number} · ${w.vessel.name}${w.technician ? ' · ' + w.technician.name : ''}`} right={<Badge tone={WO_TONE[w.status]} label={woLabel(w.status)} />} onPress={() => nav.navigate('WorkOrder', { id: w.id })} />
        ))}
      </Card>
    </Screen>
  );
}

/** Takvim / randevular — önümüzdeki 21 gün gündem görünümü */
export function Agenda() {
  const nav = useNavigation<any>();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 21 * 864e5);
  const q = useApi<any[]>('/calendar', { from: from.toISOString(), to: to.toISOString() });
  const days = new Map<string, any[]>();
  for (const e of q.data ?? []) {
    if (!e.start) continue;
    const k = new Date(Math.max(+new Date(e.start), +from)).toDateString();
    days.set(k, [...(days.get(k) ?? []), e]);
  }
  const sorted = [...days.entries()].sort((a, b) => +new Date(a[0]) - +new Date(b[0]));
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isLoading && <Loading />}
      {sorted.length === 0 && !q.isLoading && <Card><Empty title="Önümüzdeki 3 haftada planlı iş yok" /></Card>}
      {sorted.map(([day, items]) => (
        <View key={day} style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', color: C.text2 }}>{new Date(day).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Card padded={false}>
            {items.map((e) => (
              <Row key={e.kind + e.id} title={e.title.split(' — ')[0]} sub={`${e.vessel?.name ?? ''}${e.technician ? ' · ' + e.technician.name : ''}${e.kind === 'WORK_ORDER' ? ' · ' + new Date(e.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}`} left={<View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: e.kind === 'MAINTENANCE' ? C.violet : e.kind === 'PROJECT_PHASE' ? '#0E9488' : C.marine }} />} right={<Badge tone={e.kind === 'MAINTENANCE' ? 'violet' : 'info'} label={e.kind === 'MAINTENANCE' ? 'Bakım' : e.kind === 'PROJECT_PHASE' ? 'Proje' : 'İş emri'} />} onPress={e.kind === 'WORK_ORDER' ? () => nav.navigate('WorkOrder', { id: e.id }) : undefined} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

export function VesselsList() {
  const nav = useNavigation<any>();
  const [qs, setQs] = useState('');
  const q = useApi<any>('/vessels', { q: qs || undefined, pageSize: 200 });
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <Input placeholder="Tekne, marina veya sahip ara..." value={qs} onChangeText={setQs} />
      <Card padded={false}>
        {(q.data?.items ?? []).map((v: any) => (
          <Row key={v.id} title={v.name} sub={`${v.marina ?? ''} · ${v.owner?.name ?? ''}`} left={<View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="boat" size={18} color="#fff" /></View>} right={v._count.faults > 0 ? <Badge tone="danger" label={`${v._count.faults} arıza`} /> : v._count.workOrders > 0 ? <Badge tone="warn" label={`${v._count.workOrders} iş`} /> : undefined} onPress={() => nav.navigate('Vessel', { id: v.id })} />
        ))}
      </Card>
    </Screen>
  );
}

export function VesselScreen() {
  const { id } = useRoute<any>().params;
  const nav = useNavigation<any>();
  const { can, mode } = useAuth();
  const v = useApi<any>(`/vessels/${id}`).data;
  const timeline = useApi<any[]>(`/vessels/${id}/timeline`).data ?? [];
  const photos = useApi<any[]>('/files', { vesselId: id }).data ?? [];
  if (!v) return <Loading />;
  const cover = photos.find((p) => p.mimeType.startsWith('image/'));
  return (
    <Screen>
      <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.navy, height: 180, justifyContent: 'flex-end' }}>
        {cover && <Image source={{ uri: fileUrl(cover.id) }} style={{ position: 'absolute', width: '100%', height: '100%' }} />}
        <View style={{ padding: 16, backgroundColor: 'rgba(7,24,46,0.55)' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{v.name}</Text>
          <Text style={{ color: '#C9D9EA' }}>{[v.make, v.model, v.year].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {can('workorders.request', 'workorders.manage') && mode !== 'technician' && <Button small title="Servis talebi" icon="add" style={{ flex: 1 }} onPress={() => nav.navigate('NewRequest', { vesselId: v.id, type: 'service' })} />}
        {can('faults.report') && <Button small title="Arıza bildir" icon="warning-outline" variant="danger" style={{ flex: 1 }} onPress={() => nav.navigate('NewRequest', { vesselId: v.id, type: 'fault' })} />}
      </View>
      <Card title="Genel bilgiler" padded={false}>
        <Row title={`${v.marina ?? '—'} · ${v.berth ?? ''}`} sub="Marina / bağlama noktası" left={<Ionicons name="location-outline" size={20} color={C.marine} />} />
        <Row title={v.owner?.name ?? '—'} sub="Tekne sahibi" left={<Ionicons name="person-outline" size={20} color={C.marine} />} />
        {v.members.filter((m: any) => m.relation === 'CAPTAIN').map((m: any) => <Row key={m.id} title={m.user.name} sub={`Kaptan${m.user.phone ? ' · ' + m.user.phone : ''}`} left={<Ionicons name="navigate-outline" size={20} color={C.marine} />} onPress={m.user.phone ? () => Linking.openURL(`tel:${m.user.phone}`) : undefined} />)}
        <Row title={`${v.type ?? '—'} · ${v.lengthM ? v.lengthM + ' m' : ''} · ${v.flag ?? ''}`} sub="Tip / boy / bayrak" left={<Ionicons name="flag-outline" size={20} color={C.marine} />} />
      </Card>
      <Card title="Motor çalışma saatleri" padded={false}>
        {v.engines.map((e: any) => <Row key={e.id} title={e.position} sub={[e.make, e.model, e.serialNumber].filter(Boolean).join(' · ')} right={<Text style={{ fontWeight: '700', color: C.navy }}>{new Intl.NumberFormat('tr-TR').format(e.hours)} s</Text>} />)}
      </Card>
      <Card title="Servis geçmişi" padded={false}>
        {timeline.length === 0 && <Empty />}
        {timeline.slice(0, 25).map((e: any) => (
          <Row key={e.kind + e.id} title={e.title} sub={`${fmtDate(e.date)} · ${{ WORK_ORDER: 'İş emri', MAINTENANCE: 'Bakım', INSPECTION: 'Denetim', FAULT: 'Arıza', REPORT: 'Rapor', PROJECT: 'Proje' }[e.kind as string]}`} onPress={e.kind === 'WORK_ORDER' ? () => nav.navigate('WorkOrder', { id: e.id }) : e.kind === 'INSPECTION' && mode !== 'owner' && mode !== 'captain' ? () => nav.navigate('Inspection', { id: e.id }) : e.kind === 'REPORT' ? () => WebBrowser.openBrowserAsync(authedUrl(`/reports/${e.id}/pdf`)) : undefined} />
        ))}
      </Card>
    </Screen>
  );
}

export function MaintenanceScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const up = useApi<any>('/maintenance', { upcoming: 'true', pageSize: 100 });
  const hist = useApi<any>('/work-orders', { group: 'done', pageSize: 100 });
  return (
    <Screen refreshing={up.isFetching} onRefresh={() => { void up.refetch(); void hist.refetch(); }}>
      <Chips value={tab} onChange={setTab} options={[['upcoming', 'Planlı bakımlar'], ['history', 'Bakım geçmişi']]} />
      <Card padded={false}>
        {tab === 'upcoming'
          ? (up.data?.items ?? []).map((m: any) => <Row key={m.id} title={m.title} sub={`${m.vessel.name} · ${MAINTENANCE_CATEGORIES[m.category as keyof typeof MAINTENANCE_CATEGORIES]?.label ?? ''}`} left={<DateTile date={m.plannedDate} />} right={<Badge tone={MAINT_TONE[m.status]} label={MAINTENANCE_STATUS_LABELS[m.status as keyof typeof MAINTENANCE_STATUS_LABELS]} />} />)
          : (hist.data?.items ?? []).map((w: any) => <Row key={w.id} title={w.title} sub={`${fmtDate(w.publishedAt ?? w.finishedAt)} · ${w.vessel.name}`} left={<Ionicons name="checkmark-circle" size={22} color={C.ok} />} onPress={() => nav.navigate('WorkOrder', { id: w.id })} />)}
        {(tab === 'upcoming' ? up.data?.items : hist.data?.items)?.length === 0 && <Empty />}
      </Card>
    </Screen>
  );
}

/** Servis / bakım talebi ve arıza bildirimi */
export function NewRequest() {
  const params = (useRoute<any>().params ?? {}) as { vesselId?: string; type?: 'service' | 'fault' };
  const nav = useNavigation<any>();
  const vessels = useApi<any>('/vessels', { pageSize: 100 }).data?.items ?? [];
  const [type, setType] = useState<'service' | 'fault'>(params.type ?? 'service');
  const [vesselId, setVesselId] = useState(params.vesselId ?? '');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState<string>('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const vid = vesselId || vessels[0]?.id;
  const send = useAction(async () => {
    if (type === 'fault') {
      const f = await api('/faults', { body: { vesselId: vid, title, description: desc, severity: priority === 'MEDIUM' ? 'HIGH' : priority } });
      for (const p of photos) await uploadPhoto('FAULT', f.id, p);
      return null;
    }
    const w = await api('/work-orders', { body: { vesselId: vid, title, description: desc, category: category || null, priority } });
    for (const p of photos) await uploadPhoto('WORK_ORDER', w.id, p);
    return w;
  }, { success: type === 'fault' ? 'Arıza bildiriminiz operasyon ekibine iletildi.' : 'Talebiniz alındı.', onSuccess: (w) => (w ? nav.replace('WorkOrder', { id: w.id }) : nav.goBack()) });
  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets[0]) setPhotos([...photos, r.assets[0]]);
  };
  return (
    <Screen>
      <Chips value={type} onChange={setType} options={[['service', 'Bakım / servis talebi'], ['fault', 'Arıza bildirimi']]} />
      {vessels.length > 1 && <Chips value={vid} onChange={setVesselId} options={vessels.map((v: any) => [v.id, v.name])} />}
      {type === 'service' ? (
        <Chips value={category} onChange={setCategory} options={[['', 'Genel'], ...MAINTENANCE_CATEGORY_KEYS.map((k) => [k, MAINTENANCE_CATEGORIES[k].label] as [string, string])]} />
      ) : (
        <Chips value={priority} onChange={setPriority} options={PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as [string, string])} />
      )}
      <Input label={type === 'fault' ? 'Arıza *' : 'Talep konusu *'} value={title} onChangeText={setTitle} placeholder={type === 'fault' ? 'Örn. Sintine pompası çalışmıyor' : 'Örn. Yağ ve filtre değişimi'} />
      <Input label="Açıklama" value={desc} onChangeText={setDesc} multiline placeholder="Detaylar, konum, tercih edilen tarih..." />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 70, height: 70, borderRadius: 10 }} />)}
        <Pressable onPress={addPhoto} style={{ width: 70, height: 70, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B8C8DA', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="camera-outline" size={24} color={C.marine} /></Pressable>
      </View>
      <Button title={type === 'fault' ? 'Arızayı bildir' : 'Talebi gönder'} variant={type === 'fault' ? 'danger' : 'primary'} disabled={title.trim().length < 2 || !vid} loading={send.isPending} onPress={() => send.mutate(undefined)} />
    </Screen>
  );
}

/** Belgeler, onaylı raporlar ve teklifler */
export function DocumentsScreen() {
  const nav = useNavigation<any>();
  const { can } = useAuth();
  const docs = useApi<any>('/documents', { pageSize: 100 });
  const reports = useApi<any>('/reports', { pageSize: 100 }).data?.items ?? [];
  const quotes = useApi<any>(can('quotes.respond') ? '/quotes' : null, { pageSize: 50 }).data?.items ?? [];
  return (
    <Screen refreshing={docs.isFetching} onRefresh={docs.refetch}>
      {quotes.length > 0 && (
        <Card title="Teklifler" padded={false}>
          {quotes.map((q: any) => <Row key={q.id} title={q.title} sub={`${q.number} · ${fmtMoney(q.total, q.currency)}`} right={<Badge tone={q.status === 'APPROVED' ? 'ok' : q.status === 'REJECTED' ? 'danger' : 'info'} label={QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS]} />} onPress={() => nav.navigate('Quote', { id: q.id })} />)}
        </Card>
      )}
      <Card title="Onaylı teknik raporlar" padded={false}>
        {reports.length === 0 && <Empty title="Yayınlanmış rapor yok" />}
        {reports.map((r: any) => <Row key={r.id} title={r.title} sub={`${r.number} · ${fmtDate(r.updatedAt)}`} left={<Ionicons name="document-text" size={22} color={C.navy} />} right={<Ionicons name="download-outline" size={20} color={C.marine} />} onPress={() => WebBrowser.openBrowserAsync(authedUrl(`/reports/${r.id}/pdf`))} />)}
      </Card>
      <Card title="Belgeler ve sözleşmeler" padded={false}>
        {(docs.data?.items ?? []).length === 0 && <Empty />}
        {(docs.data?.items ?? []).map((d: any) => <Row key={d.id} title={d.title} sub={`${d.vessel?.name ?? ''}${d.expiryDate ? ' · Geçerlilik ' + fmtDate(d.expiryDate) : ''}`} left={<Ionicons name="folder-open-outline" size={22} color={C.marine} />} onPress={d.attachment ? () => WebBrowser.openBrowserAsync(fileUrl(d.attachment.id)) : undefined} />)}
      </Card>
    </Screen>
  );
}

export function QuoteScreen() {
  const { id } = useRoute<any>().params;
  const { can } = useAuth();
  const q = useApi<any>(`/quotes/${id}`).data;
  const [note, setNote] = useState('');
  const respond = useAction((decision: 'APPROVED' | 'REJECTED') => api(`/quotes/${id}/respond`, { body: { decision, note } }), { success: 'Yanıtınız iletildi' });
  if (!q) return <Loading />;
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Muted>{q.number}</Muted>
        <H1>{q.title}</H1>
        <Badge tone={q.status === 'APPROVED' ? 'ok' : q.status === 'REJECTED' ? 'danger' : 'info'} label={QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS]} />
      </View>
      <Card title="İş kalemleri" padded={false}>
        {q.items.map((i: any) => <Row key={i.id} title={i.description} sub={`${i.quantity} ${i.unit} × ${fmtMoney(i.unitPrice, q.currency)}`} right={<Text style={{ fontWeight: '700' }}>{fmtMoney(i.quantity * i.unitPrice, q.currency)}</Text>} />)}
        <View style={{ padding: 14, gap: 4, alignItems: 'flex-end' }}>
          <Muted>Ara toplam {fmtMoney(q.subtotal, q.currency)} · KDV %{q.vatRate} {fmtMoney(q.vat, q.currency)}</Muted>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{fmtMoney(q.total, q.currency)}</Text>
          <Muted>Geçerlilik: {fmtDate(q.validUntil)}</Muted>
        </View>
      </Card>
      {can('quotes.respond') && q.status === 'SENT' && (
        <Card title="Yanıtınız">
          <Input placeholder="Not (isteğe bağlı)" value={note} onChangeText={setNote} multiline />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button title="Reddet" variant="secondary" style={{ flex: 1 }} onPress={() => respond.mutate('REJECTED')} />
            <Button title="Onayla" variant="success" icon="checkmark" style={{ flex: 1 }} onPress={() => respond.mutate('APPROVED')} />
          </View>
        </Card>
      )}
      {q.approvedAt && <Muted>Onay tarihi: {fmtDate(q.approvedAt)}</Muted>}
    </Screen>
  );
}

export function NotificationsScreen() {
  const nav = useNavigation<any>();
  const q = useApi<any>('/notifications', { pageSize: 50 }, { refetchInterval: 30_000 });
  const readAll = useAction(() => api('/notifications/read-all', { body: {} }));
  const read = useAction((id: string) => api(`/notifications/${id}/read`, { body: {} }));
  const open = (n: any) => {
    if (!n.readAt) read.mutate(n.id);
    const m = n.link?.match(/^\/(work-orders|inspections|quotes)\/([^/?]+)/);
    if (m) nav.navigate(m[1] === 'work-orders' ? 'WorkOrder' : m[1] === 'inspections' ? 'Inspection' : 'Quote', { id: m[2] });
  };
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      {(q.data?.unread ?? 0) > 0 && <Button small variant="secondary" title={`Tümünü okundu yap (${q.data.unread})`} icon="checkmark-done" onPress={() => readAll.mutate(undefined)} />}
      <Card padded={false}>
        {(q.data?.items ?? []).length === 0 && <Empty title="Bildirim yok" icon="notifications-outline" />}
        {(q.data?.items ?? []).map((n: any) => (
          <Pressable key={n.id} onPress={() => open(n)} style={{ flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: n.readAt ? '#fff' : '#F5FAFF' }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: n.type === 'CRITICAL_FAULT' ? C.dangerBg : C.sky, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={n.type === 'CRITICAL_FAULT' ? 'alert-circle' : n.type === 'TASK_ASSIGNED' ? 'person-add' : n.type.startsWith('QUOTE') ? 'receipt' : n.type === 'SERVICE_COMPLETED' ? 'checkmark-circle' : 'notifications'} size={19} color={n.type === 'CRITICAL_FAULT' ? C.danger : C.marine} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: n.readAt ? '500' : '700', color: C.text }}>{n.title}</Text>
              {!!n.body && <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={2}>{n.body}</Text>}
              <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{relTime(n.createdAt)}</Text>
            </View>
            {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.marine, marginTop: 6 }} />}
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const roles: Record<string, string> = { SUPER_ADMIN: 'Süper Admin', OPERATIONS_MANAGER: 'Operasyon Yöneticisi', TECHNICIAN: 'Teknisyen', CAPTAIN: 'Kaptan', OWNER: 'Tekne Sahibi' };
  return (
    <Screen>
      <Card>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar name={user?.name} size={72} />
          <H1>{user?.name}</H1>
          <Muted>{user?.email}</Muted>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>{user?.roles.map((r) => <Badge key={r} tone="info" label={roles[r]} />)}</View>
        </View>
      </Card>
      <Card padded={false}>
        {user?.phone && <Row title={user.phone} sub="Telefon" left={<Ionicons name="call-outline" size={20} color={C.marine} />} />}
        {user?.title && <Row title={user.title} sub="Unvan" left={<Ionicons name="briefcase-outline" size={20} color={C.marine} />} />}
        <Row title="Nexus Marine destek" sub="info@nexusmarine.com" left={<Ionicons name="help-buoy-outline" size={20} color={C.marine} />} onPress={() => Linking.openURL('mailto:info@nexusmarine.com')} />
      </Card>
      <Button title="Çıkış yap" variant="secondary" icon="log-out-outline" onPress={logout} />
      <Muted style={{ textAlign: 'center' }}>Nexus Marine v1.0</Muted>
    </Screen>
  );
}

export function TechniciansScreen() {
  const q = useApi<any[]>('/technicians', undefined, { refetchInterval: 30_000 });
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <Card padded={false}>
        {(q.data ?? []).map((t) => (
          <Row key={t.id} title={t.name} sub={t.current ? `${t.current.vessel.name} · ${t.current.title}` : `${t.title ?? ''} · ${t.openCount} açık iş`} left={<Avatar name={t.name} />} right={<Badge tone={t.status === 'AVAILABLE' ? 'ok' : t.status === 'ON_TASK' ? 'warn' : 'info'} label={t.status === 'AVAILABLE' ? 'Müsait' : t.status === 'ON_TASK' ? 'Görevde' : 'Atanmış'} />} onPress={t.phone ? () => Linking.openURL(`tel:${t.phone}`) : undefined} />
        ))}
      </Card>
    </Screen>
  );
}

export function CustomersScreen() {
  const [qs, setQs] = useState('');
  const q = useApi<any>('/customers', { q: qs || undefined, pageSize: 200 });
  const nav = useNavigation<any>();
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <Input placeholder="Müşteri veya tekne ara..." value={qs} onChangeText={setQs} />
      <Card padded={false}>
        {(q.data?.items ?? []).map((c: any) => (
          <Row key={c.id} title={c.name} sub={`${c.vessels.map((v: any) => v.name).join(', ') || '—'}${c.nextMaintenanceAt ? ' · Bakım ' + fmtDate(c.nextMaintenanceAt) : ''}`} left={<Avatar name={c.name} />} right={c.phone ? <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)}><Ionicons name="call" size={20} color={C.marine} /></Pressable> : undefined} onPress={c.vessels[0] ? () => nav.navigate('Vessel', { id: c.vessels[0].id }) : undefined} />
        ))}
      </Card>
    </Screen>
  );
}

export function ReportsScreen() {
  const q = useApi<any>('/reports', { pageSize: 100 });
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <Card padded={false}>
        {(q.data?.items ?? []).length === 0 && <Empty />}
        {(q.data?.items ?? []).map((r: any) => <Row key={r.id} title={r.title} sub={`${r.number} · ${r.vessel.name} · v${r.currentVersion}`} left={<Ionicons name="document-text" size={22} color={C.navy} />} onPress={() => WebBrowser.openBrowserAsync(authedUrl(`/reports/${r.id}/pdf`))} />)}
      </Card>
    </Screen>
  );
}

export function MoreScreen() {
  const nav = useNavigation<any>();
  const items: Array<[string, any, string]> = [
    ['Müşteriler', 'people-outline', 'Customers'],
    ['Tekne listesi', 'boat-outline', 'Vessels'],
    ['Teknisyen durumu ve atama', 'construct-outline', 'Technicians'],
    ['Dijital denetimler', 'clipboard-outline', 'Inspections'],
    ['Teknik raporlar', 'document-text-outline', 'Reports'],
    ['Bildirimler', 'notifications-outline', 'Notifications'],
    ['Profil', 'person-circle-outline', 'Profile'],
  ];
  return (
    <Screen>
      <Card padded={false}>
        {items.map(([t, icon, route]) => <Row key={route} title={t} left={<Ionicons name={icon} size={21} color={C.marine} />} onPress={() => nav.navigate(route)} />)}
      </Card>
    </Screen>
  );
}
