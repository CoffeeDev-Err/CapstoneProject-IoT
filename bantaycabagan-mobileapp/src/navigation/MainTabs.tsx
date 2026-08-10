import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileTheme } from '../constants/mobileTheme';
import OfficerMapScreen from '../screens/OfficerMapScreen';
import TasksScreen from '../screens/TasksScreen';
import ReportsScreen from '../screens/ReportsScreen';
import OfficerProfileScreen from '../screens/OfficerProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { useOperationalContext } from '../context/OperationalContext';
import { useNotifications } from '../context/NotificationContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { NotificationNavigationRequest } from '../types/notifications';

const Tab = createBottomTabNavigator();
const TASK_MODAL_TOP_OFFSET = 1;

const tabIcons: Record<string, keyof typeof Icon.glyphMap> = {
  Map: 'map',
  Tasks: 'assignment',
  Reports: 'description',
  Profile: 'person',
};

type FloatingTabBarProps = BottomTabBarProps & {
  openTaskModal: () => void;
  openTaskCount: number;
  openNotifications: () => void;
  unreadNotificationCount: number;
  navigationRequest: NotificationNavigationRequest | null;
  clearNavigationRequest: () => void;
};

function FloatingTabBar({
  state,
  navigation,
  openTaskModal,
  openTaskCount,
  openNotifications,
  unreadNotificationCount,
  navigationRequest,
  clearNavigationRequest,
}: FloatingTabBarProps) {
  const { colors, isDark } = useMobileTheme();

  useEffect(() => {
    if (!navigationRequest) return;
    if (navigationRequest.destination === 'Tasks') openTaskModal();
    else navigation.navigate(navigationRequest.destination);
    clearNavigationRequest();
  }, [clearNavigationRequest, navigation, navigationRequest, openTaskModal]);

  return (
    <View style={[styles.floatingBar, isDark && styles.floatingBarDark]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const isTasks = route.name === 'Tasks';

        const handlePress = () => {
          if (isTasks) {
            openTaskModal();
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={route.name}
            accessibilityState={{ selected: focused }}
            activeOpacity={0.75}
            style={styles.tabItem}
            onPress={handlePress}
          >
            <View style={[styles.iconShell, focused && styles.iconShellActive]}>
              <Icon
                name={tabIcons[route.name]}
                size={28}
                color={focused ? '#ffffff' : colors.textMuted}
              />
              {isTasks && openTaskCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {openTaskCount > 9 ? '9+' : openTaskCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
        activeOpacity={0.75}
        style={styles.tabItem}
        onPress={openNotifications}
      >
        <View style={styles.iconShell}>
          <Icon name="notifications" size={27} color={colors.textMuted} />
          {unreadNotificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.badgeText}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const { tasks } = useOperationalContext();
  const {
    unreadCount,
    navigationRequest,
    clearNavigationRequest,
  } = useNotifications();
  const { isDark } = useMobileTheme();
  const [tasksVisible, setTasksVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const openTaskCount = tasks.filter((task) => task.status === 'open').length;

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#0b1528' : '#ffffff'}
      />
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            openTaskCount={openTaskCount}
            openTaskModal={() => setTasksVisible(true)}
            openNotifications={() => setNotificationsVisible(true)}
            unreadNotificationCount={unreadCount}
            navigationRequest={navigationRequest}
            clearNavigationRequest={clearNavigationRequest}
          />
        )}
      >
        <Tab.Screen name="Map" component={OfficerMapScreen}/>
        <Tab.Screen name="Tasks" component={TasksScreen} />
        <Tab.Screen name="Reports" component={ReportsScreen} />
        <Tab.Screen name="Profile" component={OfficerProfileScreen} />
      </Tab.Navigator>

      <Modal
        visible={tasksVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setTasksVisible(false)}
      >
        <View style={styles.modalRoot}>
          <View style={{ height: insets.top + TASK_MODAL_TOP_OFFSET }} />
          <View style={styles.modalOverlay}>
            <Pressable
              accessibilityLabel="Close tasks"
              style={StyleSheet.absoluteFill}
              onPress={() => setTasksVisible(false)}
            />
            <View style={[styles.taskSheet, isDark && styles.taskSheetDark]}>
              <View style={styles.sheetHandle} />
              <TasksScreen presentation="modal" onClose={() => setTasksVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={notificationsVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View style={styles.modalRoot}>
          <View style={{ height: insets.top + TASK_MODAL_TOP_OFFSET }} />
          <View style={styles.modalOverlay}>
            <Pressable
              accessibilityLabel="Close notifications"
              style={StyleSheet.absoluteFill}
              onPress={() => setNotificationsVisible(false)}
            />
            <View style={[styles.taskSheet, isDark && styles.taskSheetDark]}>
              <View style={styles.sheetHandle} />
              <NotificationsScreen onClose={() => setNotificationsVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingBar: {
    position: 'absolute',
    right: 25,
    bottom: 16,
    left: 25,
    height: 55,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.borderSoft,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    shadowColor: mobileTheme.navy,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 10,
  },
  floatingBarDark: {
    borderColor: '#22314a',
    backgroundColor: '#0b1528',
  },
  tabItem: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShell: {
    width: 52,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    overflow: 'visible',
  },
  iconShellActive: {
    backgroundColor: mobileTheme.blue,
    borderRadius: 13,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -3,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 9,
    backgroundColor: mobileTheme.danger,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 9,
    backgroundColor: mobileTheme.warning,
  },
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  modalRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,15,35,0.46)',
  },
  taskSheet: {
    flex: 1,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: mobileTheme.surface,
    overflow: 'hidden',
  },
  taskSheetDark: { backgroundColor: '#0b1528' },
  sheetHandle: {
    width: 44,
    height: 5,
    marginTop: 10,
    marginBottom: -8,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: '#cbc8d8',
    zIndex: 1,
  },
});
