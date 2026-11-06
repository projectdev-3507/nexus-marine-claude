import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { INSPECTION_RESULTS, INSPECTION_RESULT_LABELS, type InspectionResult } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl, uploadPhoto } from '../lib/api';
import { C, RESULT_COLOR, fmtDate } from '../lib/theme';
import { Badge, Button, Card, Empty, Loading, Muted, Progress, Row, Screen } from '../components/ui';

const STATUS: Record<string, [string, any]> = { DRAFT: ['Taslak', 'neutral'], SUBMITTED: ['Onay bekliyor', 'warn'], APPROVED: ['Onaylandı', 'ok'] };

export function InspectionsList() {
  const nav = useNavigation<any>();
  const { can } = useAuth();
  const q = useApi<any>('/inspections', { pageSize: 50 });
  const vessels = useApi<any>(can('inspections.perform') ? '/vessels' : null, { pageSize: 200 }).data?.items ?? [];
  const [pick, setPick] = useState(false);
  const start = useAction((vesselId: string) => api('/inspections', { body: { vesselId } }), { onSuccess: (r) => { setPick(false); nav.navigate('Inspection', { id: r.id }); } });
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      {can('inspections.perform') && <Button title={pick ? 'Vazgeç' : 'Yeni haftalık denetim'} icon={pick ? 'close' : 'add'} variant={pick ? 'secondary' : 'primary'} onPress={() => setPick(!pick)} />}
      {pick && (
        <Card title="Tekne seçin" padded={false}>
          {vessels.map((v: any) => <Row key={v.id} title={v.name} sub={v.marina} onPress={() => start.mutate(v.id)} />)}
        </Card>
      )}
      <Card title="Denetimler" padded={false}>
        {(q.data?.items ?? []).length === 0 && <Empty />}
        {(q.data?.items ?? []).map((i: any) => (
          <Row key={i.id} title={`${i.vessel.name}`} sub={`${i.number} · ${fmtDate(i.date)} · ${i.stats.filled}/${i.stats.total} madde${i.stats.fault ? ` · ${i.stats.fault} arıza` : ''}`} right={<Badge tone={STATUS[i.status][1]} label={STATUS[i.status][0]} />} onPress={() => nav.navigate('Inspection', { id: i.id })} />
        ))}
      </Card>
    </Screen>
  );
}

export function InspectionForm() {
  const { id } = useRoute<any>().params;
  const { user, mode, can } = useAuth();
  const qc = useQueryClient();
  const key = [`/inspections/${id}`, undefined];
  const q = useApi<any>(`/inspections/${id}`);
  const insp = q.data;
  const [open, setOpen] = useState<string | null>(null);
  const editable = insp && insp.status !== 'APPROVED' && can('inspections.perform') && (mode === 'manager' || insp.inspector.id === user?.id);
  const all = useMemo(() => (insp?.sections ?? []).flatMap((s: any) => s.items), [insp]);
  const filled = all.filter((i: any) => i.result).length;

  const save = async (itemId: string, patch: Record<string, unknown>) => {
    qc.setQueryData(key, (old: any) => old && { ...old, sections: old.sections.map((s: any) => ({ ...s, items: s.items.map((i: any) => (i.id === itemId ? { ...i, ...patch } : i)) })) });
    try {
      const r = await api(`/inspections/${id}/items/${itemId}`, { method: 'PUT', body: patch });
      if (patch.result === 'FAULT' && r.fault) Alert.alert('Arıza kaydı oluşturuldu', 'Operasyon yöneticisine bildirim gönderildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
      void q.refetch();
    }
  };
  const photo = async (itemId: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets[0]) {
      try {
        await uploadPhoto('INSPECTION_ITEM', itemId, r.assets[0]);
        void q.refetch();
      } catch (e) {
        Alert.alert('Hata', (e as Error).message);
      }
    }
  };
  const submit = useAction(() => api(`/inspections/${id}/submit`, { body: {} }), { success: 'Denetim onaya gönderildi' });
  const approve = useAction(() => api(`/inspections/${id}/approve`, { body: {} }), { success: 'Denetim onaylandı' });

  if (!insp) return <Loading />;
  return (
    <Screen refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{insp.vessel.name}</Text>
        <Muted>{insp.number} · {fmtDate(insp.date)} · Denetçi {insp.inspector.name}</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1 }}><Progress value={(filled / all.length) * 100} /></View>
          <Text style={{ fontWeight: '700' }}>{filled}/{all.length}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small title="PDF" icon="document-text-outline" variant="secondary" style={{ flex: 1 }} onPress={() => WebBrowser.openBrowserAsync(authedUrl(`/inspections/${id}/pdf`))} />
        {editable && insp.status === 'DRAFT' && <Button small title="Onaya gönder" icon="send" style={{ flex: 2 }} disabled={filled < all.length} onPress={() => submit.mutate(undefined)} />}
        {mode === 'manager' && insp.status === 'SUBMITTED' && <Button small title="Onayla" icon="checkmark-done" variant="success" style={{ flex: 2 }} onPress={() => approve.mutate(undefined)} />}
      </View>
      {insp.sections.map((sec: any, si: number) => {
        const f = sec.items.filter((i: any) => i.result).length;
        const faults = sec.items.filter((i: any) => i.result === 'FAULT').length;
        const isOpen = open === sec.code;
        return (
          <View key={sec.code} style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            <Pressable onPress={() => setOpen(isOpen ? null : sec.code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: f === sec.items.length ? C.okBg : C.sky, alignItems: 'center', justifyContent: 'center' }}>
                {f === sec.items.length ? <Ionicons name="checkmark" size={17} color={C.ok} /> : <Text style={{ color: C.marine, fontWeight: '700' }}>{si + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: C.navy }}>{sec.title}</Text>
                <Muted>{f}/{sec.items.length} değerlendirildi</Muted>
              </View>
              {faults > 0 && <Badge tone="danger" label={`${faults} arıza`} />}
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
            </Pressable>
            {isOpen && sec.items.map((it: any) => {
              const prev = insp.previous?.items?.[it.itemCode];
              return (
                <View key={it.id} style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 14, gap: 10 }}>
                  <Text style={{ fontWeight: '600', color: C.text }}>{it.label}</Text>
                  {prev?.result && <Muted>Önceki: {INSPECTION_RESULT_LABELS[prev.result as InspectionResult]}{prev.measurement ? ` · ${prev.measurement} ${it.unit ?? ''}` : ''}</Muted>}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {INSPECTION_RESULTS.map((r) => {
                      const on = it.result === r;
                      return (
                        <Pressable key={r} disabled={!editable} onPress={() => save(it.id, { result: on ? null : r })} style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? RESULT_COLOR[r] : '#D3DDE8', backgroundColor: on ? RESULT_COLOR[r] : '#fff' }}>
                          <Text style={{ fontWeight: '700', fontSize: 12, color: on ? '#fff' : C.text2 }}>{INSPECTION_RESULT_LABELS[r]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput editable={!!editable} placeholder={it.unit ? `Ölçüm (${it.unit})` : 'Ölçüm'} defaultValue={it.measurement ?? ''} onEndEditing={(e) => e.nativeEvent.text !== (it.measurement ?? '') && save(it.id, { measurement: e.nativeEvent.text })} style={{ flex: 1, height: 40, borderWidth: 1, borderColor: '#D3DDE8', borderRadius: 9, paddingHorizontal: 10 }} />
                    {editable && (
                      <Pressable onPress={() => photo(it.id)} style={{ width: 44, height: 40, borderRadius: 9, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="camera" size={19} color={C.marine} />
                        {it.attachments?.length > 0 && <Text style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, fontWeight: '700', color: C.marine }}>{it.attachments.length}</Text>}
                      </Pressable>
                    )}
                  </View>
                  <TextInput editable={!!editable} placeholder="Açıklama" defaultValue={it.note ?? ''} multiline onEndEditing={(e) => e.nativeEvent.text !== (it.note ?? '') && save(it.id, { note: e.nativeEvent.text })} style={{ minHeight: 40, borderWidth: 1, borderColor: '#D3DDE8', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 }} />
                  {it.result === 'FAULT' && <Text style={{ color: C.danger, fontSize: 12.5, fontWeight: '600' }}><Ionicons name="alert-circle" size={13} /> Arıza kaydı oluşturuldu{it.fault?.workOrderId ? ' · iş emri açıldı' : ''}</Text>}
                </View>
              );
            })}
          </View>
        );
      })}
    </Screen>
  );
}
