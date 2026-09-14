import { requestErrorMessage } from '../utils/requestFeedback';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { operationsSocket } from '../services/operationsApi';
import {
  fetchMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
	markMyTaskInboxRead,
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
	unreadTaskCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  notificationsHasMore: boolean;
  notificationsError: string;
  navigationRequest: NotificationNavigationRequest | null;
  clearNavigationRequest: () => void;
  markAllRead: () => Promise<void>;
	markTaskInboxRead: () => Promise<void>;
  openNotification: (notification: OfficerNotification) => void;
  refreshNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
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
    ));
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [notificationsHasMore, setNotificationsHasMore] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationCursor, setNotificationCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
	const [unreadTaskCount, setUnreadTaskCount] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState<NotificationNavigationRequest | null>(null);
  const requestIdRef = useRef(0);
  const actionBusy = useRef(false);
  const sessionGeneration = useRef(0);
  useEffect(() => {
    sessionGeneration.current += 1;
    actionBusy.current = false;
    return () => { sessionGeneration.current += 1; requestIdRef.current += 1; };
  }, [token]);

  const refreshNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      setNotificationCursor(null);
      setNotificationsHasMore(false);
      setUnreadCount(0);
		setUnreadTaskCount(0);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setNotificationsError('');
    try {
      const payload = await fetchMyNotifications(token);
      if (requestId !== requestIdRef.current) return;
      setNotifications(payload.notifications);
      setNotificationCursor(payload.pagination.nextCursor);
      setNotificationsHasMore(payload.pagination.hasNextPage);
      setUnreadCount(payload.unreadCount);
		setUnreadTaskCount(payload.unreadTaskCount ?? 0);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setNotificationsError(requestErrorMessage(error, { action: 'load notifications' }));
      }
      throw error;
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [token]);

  const updateReadState = useCallback(async (notificationId?: string) => {
    if (!token || actionBusy.current) return;
    const generation = sessionGeneration.current;
    actionBusy.current = true;
    setNotificationsError('');
    try {
      if (notificationId) await markMyNotificationRead(notificationId, token);
      else await markAllMyNotificationsRead(token);
      // Reconcile the server count, including alerts received during the request.
      if (generation === sessionGeneration.current) await refreshNotifications();
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      const message = requestErrorMessage(error, { action: 'update notification read status', write: true });
      setNotificationsError(message);
      Alert.alert('Notification update needs attention', message);
    } finally {
      if (generation === sessionGeneration.current) actionBusy.current = false;
    }
  }, [refreshNotifications, token]);

  const loadMoreNotifications = useCallback(async () => {
    if (!token || !notificationCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setNotificationsError('');
    try {
      const payload = await fetchMyNotifications(token, { cursor: notificationCursor });
      setNotifications((items) => payload.notifications.reduce(mergeNotification, items));
      setNotificationCursor(payload.pagination.nextCursor);
      setNotificationsHasMore(payload.pagination.hasNextPage);
      setUnreadCount(payload.unreadCount);
		setUnreadTaskCount(payload.unreadTaskCount ?? 0);
    } catch (error) {
      setNotificationsError(requestErrorMessage(error, { action: 'load previous notifications' }));
      throw error;
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, notificationCursor, token]);

  useEffect(() => {
    refreshNotifications().catch(() => undefined);
  }, [refreshNotifications]);

  useEffect(() => {
    const onCreated = (notification: OfficerNotification) => {
      setNotifications((items) => {
        const isNew = !items.some((item) => item.id === notification.id);
        if (isNew && !notification.isRead) setUnreadCount((count) => count + 1);
			if (isNew && !notification.isRead && notification.data?.taskInbox === true) {
				setUnreadTaskCount((count) => count + 1);
			}
        return mergeNotification(items, notification);
      });
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
        reportId?: string;
        notificationId?: string;
      };
      if (data.notificationId && token) void updateReadState(data.notificationId);
      setNavigationRequest({
        destination: data.destination || 'Map',
        referenceId: data.referenceId || data.reportId,
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
  }, [refreshNotifications, token, updateReadState]);

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

  useEffect(() => {
    if (Platform.OS !== 'web') Notifications.setBadgeCountAsync(unreadCount).catch(() => undefined);
  }, [unreadCount]);

  const openNotification = useCallback((notification: OfficerNotification) => {
    if (!notification.isRead) void updateReadState(notification.id);
    setNavigationRequest({
      destination: destinationFor(notification),
      referenceId: notification.referenceId,
      requestId: Date.now(),
    });
  }, [updateReadState]);

  const markAllRead = useCallback(() => updateReadState(), [updateReadState]);

	const markTaskInboxRead = useCallback(async () => {
		if (!token || unreadTaskCount === 0) return;
		const generation = sessionGeneration.current;
		setNotificationsError('');
		try {
			await markMyTaskInboxRead(token);
			if (generation === sessionGeneration.current) await refreshNotifications();
		} catch (error) {
			if (generation !== sessionGeneration.current) return;
			const message = requestErrorMessage(error, { action: 'update task read status', write: true });
			setNotificationsError(message);
			Alert.alert('Task badge could not be updated', message);
		}
	}, [refreshNotifications, token, unreadTaskCount]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
		unreadTaskCount,
    isLoading,
    isLoadingMore,
    notificationsHasMore,
    notificationsError,
    navigationRequest,
    clearNavigationRequest: () => setNavigationRequest(null),
    markAllRead,
		markTaskInboxRead,
    openNotification,
    refreshNotifications,
    loadMoreNotifications,
  }), [
    isLoading,
    isLoadingMore,
    loadMoreNotifications,
    markAllRead,
		markTaskInboxRead,
    navigationRequest,
    notifications,
    notificationsError,
    notificationsHasMore,
    openNotification,
    refreshNotifications,
    unreadCount,
		unreadTaskCount,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider.');
  return context;
};
