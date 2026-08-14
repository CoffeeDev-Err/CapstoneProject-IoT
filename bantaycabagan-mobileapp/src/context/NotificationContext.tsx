import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { operationsSocket } from '../services/operationsApi';
import {
  fetchMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from '../services/notificationsApi';
import type {
  NotificationNavigationRequest,
  OfficerNotification,
} from '../types/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationContextValue = {
  notifications: OfficerNotification[];
  unreadCount: number;
  isLoading: boolean;
  navigationRequest: NotificationNavigationRequest | null;
  clearNavigationRequest: () => void;
  markAllRead: () => Promise<void>;
  openNotification: (notification: OfficerNotification) => void;
  refreshNotifications: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const isNotificationPermissionGranted = (
  permission: Notifications.NotificationPermissionsStatus,
) => {
  const response = permission as Notifications.NotificationPermissionsStatus & {
    status?: string;
    granted?: boolean;
  };
  return response.status === 'granted' || response.granted === true;
};

const mergeNotification = (
  items: OfficerNotification[],
  incoming: OfficerNotification,
) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  byId.set(incoming.id, incoming);
  return [...byId.values()]
    .sort((first, second) => (
      new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime()
    ))
    .slice(0, 100);
};

const destinationFor = (notification: OfficerNotification) => {
  if (notification.data?.destination) return notification.data.destination;
  if (notification.referenceType === 'task') return 'Tasks';
  if (notification.referenceType === 'report') return 'Reports';
  return 'Map';
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<OfficerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [navigationRequest, setNavigationRequest] = useState<NotificationNavigationRequest | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    const payload = await fetchMyNotifications(token);
    setNotifications(payload.notifications);
  }, [token]);

  useEffect(() => {
    setIsLoading(true);
    refreshNotifications()
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [refreshNotifications]);

  useEffect(() => {
    const onCreated = (notification: OfficerNotification) => {
      setNotifications((items) => mergeNotification(items, notification));
    };
    operationsSocket.on('notification:created', onCreated);
    return () => {
      operationsSocket.off('notification:created', onCreated);
    };
  }, []);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      refreshNotifications().catch(() => undefined);
    });
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as {
        destination?: NotificationNavigationRequest['destination'];
        referenceId?: string;
        notificationId?: string;
      };
      if (data.notificationId && token) {
        setNotifications((items) => items.map((item) => (
          item.id === data.notificationId ? { ...item, isRead: true } : item
        )));
        markMyNotificationRead(data.notificationId, token).catch(() => undefined);
      }
      setNavigationRequest({
        destination: data.destination || 'Map',
        referenceId: data.referenceId,
        requestId: Date.now(),
      });
      refreshNotifications().catch(() => undefined);
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleResponse(response);
          Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [refreshNotifications, token]);

  useEffect(() => {
    if (!token || Platform.OS === 'web') return undefined;
    let registeredToken: string | null = null;
    let active = true;

    const register = async () => {
      const projectId = Constants.easConfig?.projectId
        || Constants.expoConfig?.extra?.eas?.projectId;

      if (isExpoGo) {
        if (!Device.isDevice || !projectId) return;
        const expoGoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await unregisterNotificationDevice(expoGoToken, token);
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('officer-alerts', {
          name: 'Officer alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      if (!Device.isDevice) return;
      const currentPermission = await Notifications.getPermissionsAsync();
      const permission = isNotificationPermissionGranted(currentPermission)
        ? currentPermission
        : await Notifications.requestPermissionsAsync();
      if (!isNotificationPermissionGranted(permission)) return;

      if (!projectId) return;
      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (!active) return;
      registeredToken = pushToken;
      await registerNotificationDevice({
        expoPushToken: pushToken,
        platform: Platform.OS as 'android' | 'ios',
        deviceName: Device.deviceName,
        token,
      });
    };

    register().catch(() => undefined);
    return () => {
      active = false;
      if (registeredToken) {
        unregisterNotificationDevice(registeredToken, token).catch(() => undefined);
      }
    };
  }, [token]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') Notifications.setBadgeCountAsync(unreadCount).catch(() => undefined);
  }, [unreadCount]);

  const openNotification = useCallback((notification: OfficerNotification) => {
    setNotifications((items) => items.map((item) => (
      item.id === notification.id ? { ...item, isRead: true } : item
    )));
    if (token && !notification.isRead) {
      markMyNotificationRead(notification.id, token).catch(() => undefined);
    }
    setNavigationRequest({
      destination: destinationFor(notification),
      referenceId: notification.referenceId,
      requestId: Date.now(),
    });
  }, [token]);

  const markAllRead = useCallback(async () => {
    if (!token) return;
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    await markAllMyNotificationsRead(token);
  }, [token]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    isLoading,
    navigationRequest,
    clearNavigationRequest: () => setNavigationRequest(null),
    markAllRead,
    openNotification,
    refreshNotifications,
  }), [
    isLoading,
    markAllRead,
    navigationRequest,
    notifications,
    openNotification,
    refreshNotifications,
    unreadCount,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider.');
  return context;
};
