import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, TONES, initials, type Tone } from '../lib/theme';

export function Screen({ children, refreshing, onRefresh, padded = true }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: 40, gap: 14 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.marine} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ title, right, children, style, padded = true }: { title?: string; right?: ReactNode; children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  return (
    <View style={[s.card, style]}>
      {title && (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>{title}</Text>
          {right}
        </View>
      )}
      <View style={padded ? { padding: 14 } : undefined}>{children}</View>
    </View>
  );
}

export function Badge({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <View style={[s.dot, { backgroundColor: fg }]} />
      <Text style={[s.badgeText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, small, style }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: boolean; small?: boolean; style?: ViewStyle }) {
  const bg = { primary: C.marine, secondary: C.card, danger: C.danger, success: C.ok, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? C.navy : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, small && { height: 36, paddingHorizontal: 12 }, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'secondary' ? 1 : 0 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={[s.btnText, { color: fg, fontSize: small ? 13 : 15 }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Row({ title, sub, right, onPress, left }: { title: string; sub?: string; right?: ReactNode; onPress?: () => void; left?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: '#F7FAFF' } : null]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={s.rowSub} numberOfLines={2}>{sub}</Text>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color="#A9B7C6" />}
    </Pressable>
  );
}

export function DateTile({ date }: { date: string }) {
  const d = new Date(date);
  return (
    <View style={s.dateTile}>
      <Text style={{ color: C.marine, fontWeight: '700', fontSize: 17 }}>{d.getDate()}</Text>
      <Text style={{ color: C.marine, fontWeight: '600', fontSize: 10 }}>{d.toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase()}</Text>
    </View>
  );
}

export function Avatar({ name, size = 38 }: { name?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.marine, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function Kpi({ label, value, icon, color, bg, onPress }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.card, { flex: 1, padding: 14, gap: 10, minWidth: 140 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '500', flex: 1 }}>{label}</Text>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
      </View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: C.navy }}>{value}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {props.label && <Text style={s.label}>{props.label}</Text>}
      <TextInput placeholderTextColor="#9AAABB" {...props} style={[s.input, props.multiline && { height: 100, textAlignVertical: 'top', paddingTop: 10 }, props.style]} />
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={[s.chip, value === k && { backgroundColor: C.navy, borderColor: C.navy }]}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: value === k ? '#fff' : C.text2 }}>{l}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Progress({ value, color = C.marine }: { value: number; color?: string }) {
  return (
    <View style={{ height: 7, borderRadius: 4, backgroundColor: C.neutralBg, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', backgroundColor: value >= 100 ? C.ok : color, borderRadius: 4 }} />
    </View>
  );
}

export const Loading = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: C.bg }}>
    <ActivityIndicator color={C.marine} size="large" />
  </View>
);

export function Empty({ title = 'Kayıt bulunamadı', text, icon = 'file-tray-outline' }: { title?: string; text?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ alignItems: 'center', padding: 26, gap: 6 }}>
      <Ionicons name={icon} size={30} color="#B4C3D3" />
      <Text style={{ fontWeight: '600', color: C.text2 }}>{title}</Text>
      {text && <Text style={{ color: C.muted, textAlign: 'center', fontSize: 13 }}>{text}</Text>}
    </View>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <Text style={{ fontSize: 22, fontWeight: '700', color: C.navy }}>{children}</Text>;
export const Muted = ({ children, style }: { children: ReactNode; style?: any }) => <Text style={[{ color: C.muted, fontSize: 13 }, style]}>{children}</Text>;

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, shadowColor: C.navy, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  cardTitle: { fontSize: 15, fontWeight: '650' as any, color: C.navy },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11.5, fontWeight: '600' },
  btn: { height: 46, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: C.border },
  btnText: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rowTitle: { fontWeight: '600', color: C.text, fontSize: 14.5 },
  rowSub: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  dateTile: { width: 46, borderRadius: 10, backgroundColor: C.sky, alignItems: 'center', paddingVertical: 5 },
  label: { fontSize: 12.5, fontWeight: '600', color: C.text2 },
  input: { height: 46, borderRadius: 11, borderWidth: 1, borderColor: '#D3DDE8', backgroundColor: '#fff', paddingHorizontal: 12, fontSize: 15, color: C.text },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' },
});
