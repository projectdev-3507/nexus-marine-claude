import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, type AppMode } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { C } from '../lib/theme';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/Login';
import { CaptainHome, ManagerHome, OwnerHome, TechnicianHome } from '../screens/Home';
import WorkOrderScreen from '../screens/WorkOrder';
import { InspectionForm, InspectionsList } from '../screens/Inspections';
import {
  Agenda, CustomersScreen, DocumentsScreen, MaintenanceScreen, MoreScreen, NewRequest, NotificationsScreen, ProfileScreen, QuoteScreen,
  ReportsScreen, TechniciansScreen, VesselScreen, VesselsList, WorkOrdersList,
} from '../screens/Lists';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
export const navRef = createNavigationContainerRef<any>();

type TabDef = { name: string; title: string; icon: keyof typeof Ionicons.glyphMap; component: React.ComponentType<any> };

/** Rol bazlı alt menüler — tek uygulama, farklı navigasyon */
const TABS: Record<AppMode, TabDef[]> = {
  manager: [
    { name: 'Overview', title: 'Genel Bakış', icon: 'grid-outline', component: ManagerHome },
    { name: 'Tasks', title: 'Görevler', icon: 'clipboard-outline', component: WorkOrdersList },
    { name: 'Agenda', title: 'Randevular', icon: 'calendar-outline', component: Agenda },
    { name: 'NotificationsTab', title: 'Bildirimler', icon: 'notifications-outline', component: NotificationsScreen },
    { name: 'More', title: 'Menü', icon: 'menu-outline', component: MoreScreen },
  ],
  technician: [
    { name: 'MyTasks', title: 'Görevlerim', icon: 'construct-outline', component: TechnicianHome },
    { name: 'Agenda', title: 'Takvim', icon: 'calendar-outline', component: Agenda },
    { name: 'InspectionsTab', title: 'Denetimler', icon: 'clipboard-outline', component: InspectionsList },
    { name: 'NotificationsTab', title: 'Bildirimler', icon: 'notifications-outline', component: NotificationsScreen },
    { name: 'ProfileTab', title: 'Profil', icon: 'person-circle-outline', component: ProfileScreen },
  ],
  captain: [
    { name: 'MyVessels', title: 'Teknelerim', icon: 'boat-outline', component: CaptainHome },
    { name: 'MaintenanceTab', title: 'Bakımlar', icon: 'construct-outline', component: MaintenanceScreen },
    { name: 'Requests', title: 'Talepler', icon: 'chatbox-ellipses-outline', component: WorkOrdersList },
    { name: 'Docs', title: 'Raporlar', icon: 'document-text-outline', component: DocumentsScreen },
    { name: 'NotificationsTab', title: 'Bildirimler', icon: 'notifications-outline', component: NotificationsScreen },
  ],
  owner: [
    { name: 'MyVessel', title: 'Teknem', icon: 'boat-outline', component: OwnerHome },
    { name: 'MaintenanceTab', title: 'Bakımlar', icon: 'construct-outline', component: MaintenanceScreen },
    { name: 'RequestTab', title: 'Servis Talebi', icon: 'add-circle-outline', component: NewRequest },
    { name: 'Docs', title: 'Belgeler', icon: 'folder-open-outline', component: DocumentsScreen },
    { name: 'ProfileTab', title: 'Profil', icon: 'person-circle-outline', component: ProfileScreen },
  ],
};

function Tabs() {
  const { mode } = useAuth();
  const unread = useApi<{ unread: number }>('/notifications/unread-count', undefined, { refetchInterval: 30_000 }).data?.unread ?? 0;
  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: C.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: C.marine,
        tabBarInactiveTintColor: '#8396AB',
        tabBarStyle: { borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerRight: () =>
          mode === 'captain' || mode === 'manager' ? (
            <Pressable onPress={() => navigation.navigate('Profile')} style={{ marginRight: 14 }}>
              <Ionicons name="person-circle-outline" size={26} color="#fff" />
            </Pressable>
          ) : null,
      })}
    >
      {TABS[mode].map((t) => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} size={size} color={color} />,
            tabBarBadge: t.name === 'NotificationsTab' && unread > 0 ? unread : undefined,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.marine } };

export default function RootNavigator() {
  const { user, loading } = useAuth();

  // Push bildirimine dokunulunca ilgili kayda git
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = (r.notification.request.content.data as any)?.link as string | undefined;
      const m = link?.match(/^\/(work-orders|inspections|quotes)\/([^/?]+)/);
      if (m && navRef.isReady()) navRef.navigate(m[1] === 'work-orders' ? 'WorkOrder' : m[1] === 'inspections' ? 'Inspection' : 'Quote', { id: m[2] });
    });
    return () => sub.remove();
  }, []);

  if (loading) return <Loading />;
  return (
    <NavigationContainer ref={navRef} theme={theme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: C.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' }, headerBackTitle: 'Geri' }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="WorkOrder" component={WorkOrderScreen} options={{ title: 'İş Emri' }} />
            <Stack.Screen name="Vessel" component={VesselScreen} options={{ title: 'Tekne' }} />
            <Stack.Screen name="Inspection" component={InspectionForm} options={{ title: 'Teknik Denetim' }} />
            <Stack.Screen name="Quote" component={QuoteScreen} options={{ title: 'Teklif' }} />
            <Stack.Screen name="NewRequest" component={NewRequest} options={{ title: 'Yeni Talep' }} />
            <Stack.Screen name="Vessels" component={VesselsList} options={{ title: 'Tekneler' }} />
            <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: 'Müşteriler' }} />
            <Stack.Screen name="Technicians" component={TechniciansScreen} options={{ title: 'Teknisyenler' }} />
            <Stack.Screen name="Inspections" component={InspectionsList} options={{ title: 'Denetimler' }} />
            <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Teknik Raporlar' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Bildirimler' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
