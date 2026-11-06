import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { TECHNICIAN_TRANSITIONS, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TRANSITIONS, PRIORITY_LABELS, type WorkOrderStatus } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, fileUrl, uploadPhoto } from '../lib/api';
import { C, PRIORITY_TONE, WO_TONE, fmtDateTime, relTime } from '../lib/theme';
import { Avatar, Badge, Button, Card, Empty, Input, Loading, Muted, Progress, Row, Screen } from '../components/ui';
import { Tracker } from './Home';

const ACTIONS: Partial<Record<WorkOrderStatus, { label: string; icon: any; variant: any }>> = {
  IN_PROGRESS: { label: 'İşe başla', icon: 'play', variant: 'primary' },
  TECHNICAL_REVIEW: { label: 'İşi bitir · kontrole gönder', icon: 'stop-circle-outline', variant: 'primary' },
  COMPLETED: { label: 'Teknik kontrolü onayla', icon: 'checkmark-done', variant: 'success' },
  REVISION_REQUIRED: { label: 'Revizyon iste', icon: 'refresh', variant: 'secondary' },
  PUBLISHED: { label: 'Müşteriye yayınla', icon: 'paper-plane-outline', variant: 'primary' },
  CLOSED: { label: 'Kapat', icon: 'lock-closed-outline', variant: 'secondary' },
  ON_HOLD: { label: 'Beklemeye al', icon: 'pause-circle-outline', variant: 'secondary' },
  PLANNED: { label: 'Planlandı', icon: 'calendar-outline', variant: 'secondary' },
  EVALUATION: { label: 'Değerlendirmeye al', icon: 'search-outline', variant: 'secondary' },
};

export default function WorkOrderScreen() {
  const { id } = useRoute<any>().params;
  const nav = useNavigation<any>();
  const { user, mode, can } = useAuth();
  const q = useApi<any>(`/work-orders/${id}`);
  const w = q.data;
  const [note, setNote] = useState('');
  const [transition, setTransition] = useState<WorkOrderStatus | null>(null);
  const [assign, setAssign] = useState(false);
  const staff = mode === 'manager' || mode === 'technician';

  const setChecklist = useAction((checklist: any[]) => api(`/work-orders/${id}`, { method: 'PUT', body: { checklist } }));
  const addNote = useAction(() => api(`/work-orders/${id}/comments`, { body: { body: note, internal: false } }), { onSuccess: () => setNote('') });
  const upload = useAction(async (asset: ImagePicker.ImagePickerAsset) => uploadPhoto('WORK_ORDER', id, asset), { success: 'Fotoğraf yüklendi' });

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('İzin gerekli', 'Fotoğraf eklemek için izin vermeniz gerekiyor.');
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!r.canceled && r.assets[0]) upload.mutate(r.assets[0]);
  };

  if (!w) return <Loading />;
  const mine = w.technician?.id === user?.id;
  const allowed = (WORK_ORDER_TRANSITIONS[w.status as WorkOrderStatus] ?? []).filter((to) =>
    mode === 'manager' ? to !== 'ASSIGNED' && to !== 'CANCELLED' : mine && TECHNICIAN_TRANSITIONS.some(([f, t]) => f === w.status && t === to),
  );
  const checklist: Array<{ label: string; done: boolean }> = w.checklist ?? [];
  const canCheck = staff && (mode === 'manager' || mine) && !['COMPLETED', 'PUBLISHED', 'CLOSED'].includes(w.status);
  const photos = (w.attachments ?? []).filter((a: any) => a.mimeType.startsWith('image/'));

  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={WO_TONE[w.status]} label={WORK_ORDER_STATUS_LABELS[w.status as WorkOrderStatus]} />
          <Badge tone={PRIORITY_TONE[w.priority]} label={PRIORITY_LABELS[w.priority as keyof typeof PRIORITY_LABELS]} />
          <Text style={{ color: C.muted, fontWeight: '600' }}>{w.number}</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{w.title}</Text>
        {!staff && <Tracker status={w.status} />}
      </View>

      {allowed.length > 0 && (
        <View style={{ gap: 8 }}>
          {allowed.map((to) => ACTIONS[to] && <Button key={to} title={ACTIONS[to]!.label} icon={ACTIONS[to]!.icon} variant={ACTIONS[to]!.variant} onPress={() => setTransition(to)} />)}
        </View>
      )}
      {mode === 'manager' && ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'ON_HOLD'].includes(w.status) && (
        <Button title={w.technician ? 'Teknisyeni değiştir' : 'Teknisyen ata'} icon="person-add-outline" variant="secondary" onPress={() => setAssign(true)} />
      )}

      <Card title="İş bilgileri" padded={false}>
        <Row title={w.vessel.name} sub={[w.vessel.marina, w.vessel.berth].filter(Boolean).join(' · ')} left={<Ionicons name="boat-outline" size={20} color={C.marine} />} onPress={() => nav.navigate('Vessel', { id: w.vessel.id })} />
        <Row title={w.technician?.name ?? 'Teknisyen atanmadı'} sub="Atanan teknisyen" left={<Ionicons name="person-outline" size={20} color={C.marine} />} />
        <Row title={w.plannedStart ? fmtDateTime(w.plannedStart) : 'Planlanmadı'} sub={w.plannedHours ? `Planlanan süre ${w.plannedHours} saat` : 'Planlanan tarih'} left={<Ionicons name="calendar-outline" size={20} color={C.marine} />} />
        {w.startedAt && <Row title={`${fmtDateTime(w.startedAt)}${w.finishedAt ? ' → ' + fmtDateTime(w.finishedAt) : ''}`} sub={w.actualHours != null ? `Gerçekleşen ${w.actualHours} saat` : 'Başlangıç / bitiş'} left={<Ionicons name="time-outline" size={20} color={C.marine} />} />}
        {!!w.description && <View style={{ padding: 14 }}><Text style={{ color: C.text2 }}>{w.description}</Text></View>}
        {!!w.customerSummary && <View style={{ margin: 14, marginTop: 0, padding: 12, borderRadius: 10, backgroundColor: C.okBg }}><Text style={{ color: '#13803C', fontWeight: '600' }}>{w.customerSummary}</Text></View>}
      </Card>

      {checklist.length > 0 && (
        <Card title={`Kontrol listesi · ${checklist.filter((c) => c.done).length}/${checklist.length}`}>
          <Progress value={(checklist.filter((c) => c.done).length / checklist.length) * 100} />
          <View style={{ marginTop: 10 }}>
            {checklist.map((c, i) => (
              <Pressable key={i} disabled={!canCheck} onPress={() => setChecklist.mutate(checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Ionicons name={c.done ? 'checkbox' : 'square-outline'} size={22} color={c.done ? C.ok : '#9FB1C4'} />
                <Text style={{ flex: 1, color: c.done ? C.muted : C.text, textDecorationLine: c.done ? 'line-through' : 'none' }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      <Card title={`Fotoğraflar (${photos.length})`}>
        {(staff ? mode === 'manager' || mine : true) && !['CLOSED', 'CANCELLED'].includes(w.status) && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Button small title="Kamera" icon="camera-outline" style={{ flex: 1 }} onPress={() => pick(true)} loading={upload.isPending} />
            <Button small title="Galeri" icon="images-outline" variant="secondary" style={{ flex: 1 }} onPress={() => pick(false)} />
          </View>
        )}
        {photos.length === 0 ? <Empty title="Fotoğraf yok" icon="camera-outline" /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((p: any) => <Image key={p.id} source={{ uri: fileUrl(p.id) }} style={{ width: '31%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.neutralBg }} />)}
          </View>
        )}
      </Card>

      {staff && w.materials?.length > 0 && (
        <Card title="Kullanılacak / kullanılan malzemeler" padded={false}>
          {w.materials.map((m: any) => <Row key={m.id} title={m.material.name} right={<Text style={{ fontWeight: '700' }}>{m.quantity} {m.material.unit}</Text>} />)}
        </Card>
      )}

      <Card title="Notlar">
        {(w.comments ?? []).map((c: any) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <Avatar name={c.user.name} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 13 }}>{c.user.name} <Text style={{ color: C.muted, fontWeight: '400' }}>· {relTime(c.createdAt)}</Text></Text>
              <Text style={{ color: C.text2 }}>{c.body}</Text>
            </View>
          </View>
        ))}
        <Input placeholder="Not ekleyin..." value={note} onChangeText={setNote} multiline />
        <Button small title="Not ekle" style={{ marginTop: 8, alignSelf: 'flex-end' }} disabled={!note.trim()} onPress={() => addNote.mutate(undefined)} />
      </Card>

      {staff && (
        <Card title="İş geçmişi">
          {(w.history ?? []).map((h: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, borderWidth: 2.5, borderColor: C.marine }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 13 }}>{WORK_ORDER_STATUS_LABELS[h.toStatus as WorkOrderStatus]}</Text>
                <Muted>{fmtDateTime(h.createdAt)}{h.user ? ` · ${h.user.name}` : ''}</Muted>
              </View>
            </View>
          ))}
        </Card>
      )}
      {transition && <TransitionSheet wo={w} to={transition} onClose={() => setTransition(null)} />}
      {assign && <AssignSheet wo={w} onClose={() => setAssign(false)} />}
    </Screen>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(7,24,46,0.5)' }} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12, maxHeight: '80%' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

function TransitionSheet({ wo, to, onClose }: { wo: any; to: WorkOrderStatus; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState(wo.customerSummary ?? '');
  const go = useAction(() => api(`/work-orders/${wo.id}/status`, { body: { status: to, note: note || null, customerSummary: to === 'PUBLISHED' ? summary : undefined } }), { onSuccess: onClose });
  return (
    <Sheet title={ACTIONS[to]?.label ?? WORK_ORDER_STATUS_LABELS[to]} onClose={onClose}>
      {to === 'TECHNICAL_REVIEW' && <Muted>Bitiş zamanı kaydedilecek ve operasyon yöneticisine kontrol bildirimi gönderilecek.</Muted>}
      {to === 'PUBLISHED' && <Input label="Müşteriye görünecek özet *" value={summary} onChangeText={setSummary} multiline />}
      <Input label={to === 'REVISION_REQUIRED' ? 'Revizyon nedeni *' : 'Not (isteğe bağlı)'} value={note} onChangeText={setNote} multiline />
      <Button title="Onayla" onPress={() => go.mutate(undefined)} loading={go.isPending} disabled={(to === 'PUBLISHED' && !summary.trim()) || (to === 'REVISION_REQUIRED' && !note.trim())} />
      <Button title="Vazgeç" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

function AssignSheet({ wo, onClose }: { wo: any; onClose: () => void }) {
  const techs = useApi<any[]>('/technicians').data ?? [];
  const go = useAction((technicianId: string) => api(`/work-orders/${wo.id}/assign`, { body: { technicianId } }), { success: 'Teknisyen atandı ve bilgilendirildi', onSuccess: onClose });
  return (
    <Sheet title="Teknisyen ata" onClose={onClose}>
      <ScrollView>
        {techs.map((t) => (
          <Row key={t.id} title={t.name} sub={`${t.title ?? ''} · ${t.openCount} açık iş · bugün ${t.todayCount}`} left={<Avatar name={t.name} />} right={<Badge tone={t.status === 'AVAILABLE' ? 'ok' : t.status === 'ON_TASK' ? 'warn' : 'info'} label={t.status === 'AVAILABLE' ? 'Müsait' : t.status === 'ON_TASK' ? 'Görevde' : 'Atanmış'} />} onPress={() => go.mutate(t.id)} />
        ))}
      </ScrollView>
    </Sheet>
  );
}
