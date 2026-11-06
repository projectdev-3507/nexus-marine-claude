import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/** Cihazı Expo push bildirimleri için kaydeder ve token'ı backend'e iletir. */
export async function registerForPush() {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Nexus Marine', importance: Notifications.AndroidImportance.HIGH, lightColor: '#1767AD' });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('/auth/push-token', { body: { token: data, platform: Platform.OS } });
  } catch (e) {
    console.warn('push kayıt hatası', e);
  }
}
