import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
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
  const remotePushReadyRef = useRef(false);

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
      if (
        Platform.OS !== 'web'
        && AppState.currentState !== 'active'
        && !remotePushReadyRef.current
      ) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: notification.title,
            body: notification.message,
            data: {
              notificationId: notification.id,
              referenceId: notification.referenceId,
              ...notification.data,
            },
            sound: notification.priority === 'low' ? undefined : 'default',
          },
          trigger: null,
        }).catch(() => undefined);
      }
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
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('officer-alerts', {
          name: 'Officer alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      if (!Device.isDevice) return;
      const currentPermission = await Notifications.getPermissionsAsync();
      const permission = currentPermission.status === 'granted'
        ? currentPermission
        : await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      const projectId = Constants.easConfig?.projectId
        || Constants.expoConfig?.extra?.eas?.projectId;
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
      remotePushReadyRef.current = true;
    };

    register().catch(() => undefined);
    return () => {
      active = false;
      remotePushReadyRef.current = false;
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
