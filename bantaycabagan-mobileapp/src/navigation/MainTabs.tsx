import React, { useEffect, useState } from 'react';
import {
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { SwipeDismissSheet } from '../components/SwipeDismissSheet';
import { PolicePageHeader } from '../components/PolicePageHeader';

const Tab = createBottomTabNavigator();
const TASK_MODAL_TOP_OFFSET = 1;

const tabIcons: Record<string, keyof typeof Icon.glyphMap> = {
  Map: 'map',
  Tasks: 'assignment',
  Reports: 'description',
  Profile: 'person',
};

const tabLabels: Record<string, string> = {
  Map: 'Map',
  Tasks: 'Tasks',
  Reports: 'Reports',
  Profile: 'Account',
};

type FloatingTabBarProps = BottomTabBarProps & {
  openTaskModal: () => void;
  openTaskCount: number;
  navigationRequest: NotificationNavigationRequest | null;
  clearNavigationRequest: () => void;
};

function FloatingTabBar({
  state,
  navigation,
  openTaskModal,
  openTaskCount,
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
        const label = tabLabels[route.name] || route.name;

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
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            activeOpacity={0.75}
            style={styles.tabItem}
            onPress={handlePress}
          >
            <View style={[styles.iconShell, focused && styles.iconShellActive]}>
              <Icon
                name={tabIcons[route.name]}
                size={24}
                color={focused ? '#ffffff' : colors.textMuted}
              />
              {isTasks && openTaskCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {openTaskCount > 9 ? '9+' : openTaskCount}
                  </Text>
                </View>
              )}
              <Text style={[
                styles.tabLabel,
                { color: focused ? '#ffffff' : colors.textMuted },
                focused && styles.tabLabelActive,
              ]}>
                {label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const { tasks } = useOperationalContext();
  const {
    navigationRequest,
    clearNavigationRequest,
  } = useNotifications();
  const { isDark } = useMobileTheme();
  const [tasksVisible, setTasksVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const openTaskCount = tasks.filter((task) => task.status === 'open').length;

  return (
    <View style={[styles.appRoot, isDark && styles.appRootDark]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#0b1528' : '#ffffff'}
      />
      <SafeAreaView
        edges={['top']}
        style={[styles.fixedHeaderArea, isDark && styles.fixedHeaderAreaDark]}
      >
        <PolicePageHeader onOpenNotifications={() => setNotificationsVisible(true)} />
      </SafeAreaView>
      <View style={styles.tabSceneArea}>
      <Tab.Navigator
        detachInactiveScreens={false}
        screenOptions={{
          animation: 'none',
          headerShown: false,
          sceneStyle: {
            backgroundColor: isDark ? '#050b18' : '#ffffff',
          },
        }}
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            openTaskCount={openTaskCount}
            openTaskModal={() => setTasksVisible(true)}
            navigationRequest={navigationRequest}
            clearNavigationRequest={clearNavigationRequest}
          />
        )}
      >
        <Tab.Screen name="Map" component={OfficerMapScreen} options={{ lazy: false }} />
        <Tab.Screen name="Tasks" component={TasksScreen} options={{ animation: 'none', lazy: true }} />
        <Tab.Screen name="Reports" component={ReportsScreen} options={{ lazy: false }} />
        <Tab.Screen name="Profile" component={OfficerProfileScreen} options={{ lazy: false }} />
      </Tab.Navigator>
      </View>

      <SwipeDismissSheet
        visible={tasksVisible}
        topInset={insets.top + TASK_MODAL_TOP_OFFSET}
        onClose={() => setTasksVisible(false)}
        sheetStyle={[styles.taskSheet, isDark && styles.taskSheetDark]}
      >
        <TasksScreen presentation="modal" />
      </SwipeDismissSheet>

      <SwipeDismissSheet
        visible={notificationsVisible}
        topInset={insets.top + TASK_MODAL_TOP_OFFSET}
        onClose={() => setNotificationsVisible(false)}
        sheetStyle={[styles.taskSheet, isDark && styles.taskSheetDark]}
      >
        {({ close }) => <NotificationsScreen onClose={close} />}
      </SwipeDismissSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: '#ffffff' },
  appRootDark: { backgroundColor: '#050b18' },
  fixedHeaderArea: { zIndex: 20, backgroundColor: '#ffffff' },
  fixedHeaderAreaDark: { backgroundColor: '#0b1528' },
  tabSceneArea: { flex: 1 },
  floatingBar: {
    position: 'absolute',
    right: 45,
    bottom: 16,
    left: 45,
    height: 50,
    paddingHorizontal: 1,
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
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShell: {
    width: 58,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: 11,
    overflow: 'visible',
  },
  iconShellActive: {
    backgroundColor: mobileTheme.blue,
    borderRadius: 15,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 9,
  },
  tabLabelActive: { fontWeight: '800' },
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
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  taskSheet: {
    height: '92%',
    backgroundColor: mobileTheme.surface,
  },
  taskSheetDark: { backgroundColor: '#0b1528' },
});
