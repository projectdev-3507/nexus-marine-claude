import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { API_URL } from '../lib/api';
import { C } from '../lib/theme';
import { Button, Input } from '../components/ui';

const DEMO: Array<[string, string]> = [
  ['operasyon@nexusmarine.com', 'Operasyon'],
  ['teknisyen@nexusmarine.com', 'Teknisyen'],
  ['kaptan@nexusmarine.com', 'Kaptan'],
  ['musteri@nexusmarine.com', 'Tekne sahibi'],
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e = email, p = password) => {
    setErr('');
    setBusy(true);
    try {
      await login(e, p);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
            <View style={{ padding: 28, gap: 10 }}>
              <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: C.marine, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="boat" size={28} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 2, marginTop: 8 }}>NEXUS MARINE</Text>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 34 }}>Teknik operasyonlarınız cebinizde.</Text>
              <Text style={{ color: '#A9C0DA', fontSize: 14 }}>Bakım, servis, denetim ve raporlar — gerçek zamanlı.</Text>
            </View>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, gap: 14 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>Giriş yapın</Text>
              {!!err && <Text style={{ backgroundColor: C.dangerBg, color: '#B01D1D', padding: 10, borderRadius: 10 }}>{err}</Text>}
              <Input label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              <Input label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
              <Button title="Giriş yap" onPress={() => submit()} loading={busy} disabled={!email || !password} />
              {__DEV__ && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>DEMO HESAPLAR · {API_URL}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {DEMO.map(([e, l]) => (
                      <Pressable key={e} onPress={() => submit(e, 'Nexus2026!')} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: C.sky }}>
                        <Text style={{ color: C.marine, fontWeight: '600', fontSize: 12.5 }}>{l}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
