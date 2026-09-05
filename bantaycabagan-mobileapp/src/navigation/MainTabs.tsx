import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
const PAGE_HEADER_CONTENT_HEIGHT = 54;
const TAB_BAR_MIN_BOTTOM_OFFSET = 8;
const TAB_BAR_SYSTEM_GAP = 4;

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
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(
    TAB_BAR_MIN_BOTTOM_OFFSET,
    insets.bottom + TAB_BAR_SYSTEM_GAP,
  );

  useEffect(() => {
    if (!navigationRequest) return;
    if (navigationRequest.destination === 'Tasks') openTaskModal();
    else navigation.navigate(navigationRequest.destination);
    clearNavigationRequest();
  }, [clearNavigationRequest, navigation, navigationRequest, openTaskModal]);

  return (
    <View
      style={[
        styles.floatingBar,
        { bottom: bottomOffset },
        isDark && styles.floatingBarDark,
      ]}
    >
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
                size={22}
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
  const { tasks, initialDataError, isLoading, refreshOperations } = useOperationalContext();
  const {
    navigationRequest,
    clearNavigationRequest,
  } = useNotifications();
  const { isDark } = useMobileTheme();
  const [tasksVisible, setTasksVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [mapInteracting, setMapInteracting] = useState(false);
  const headerVisibility = useRef(new Animated.Value(1)).current;
  const openTaskCount = tasks.filter((task) => task.status === 'open').length;

  useEffect(() => {
    Animated.timing(headerVisibility, {
      toValue: mapInteracting ? 0 : 1,
      duration: mapInteracting ? 180 : 250,
      easing: mapInteracting ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headerVisibility, mapInteracting]);

  const handleMapInteractionChange = useCallback((isInteracting: boolean) => {
    setMapInteracting(isInteracting);
  }, []);

  const renderMapScreen = useCallback(() => (
    <OfficerMapScreen
      headerContentHeight={PAGE_HEADER_CONTENT_HEIGHT}
      headerTopInset={insets.top}
      headerVisibility={headerVisibility}
      onMapInteractionChange={handleMapInteractionChange}
    />
  ), [handleMapInteractionChange, headerVisibility, insets.top]);

  const headerTranslateY = headerVisibility.interpolate({
    inputRange: [0, 1],
    outputRange: [-PAGE_HEADER_CONTENT_HEIGHT, 0],
  });

  return (
    <View style={[styles.appRoot, isDark && styles.appRootDark]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#0b1528' : '#ffffff'}
      />
      <Animated.View
        style={[
          styles.headerOverlay,
          isDark && styles.fixedHeaderAreaDark,
          {
            height: insets.top + PAGE_HEADER_CONTENT_HEIGHT,
            opacity: headerVisibility,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <SafeAreaView
          edges={['top']}
          style={[styles.fixedHeaderArea, isDark && styles.fixedHeaderAreaDark]}
        >
          <View>
            <PolicePageHeader onOpenNotifications={() => setNotificationsVisible(true)} />
          </View>
        </SafeAreaView>
      </Animated.View>
      {initialDataError ? (
        <View style={[styles.reliabilityBanner, { top: insets.top + PAGE_HEADER_CONTENT_HEIGHT }]}>
          <Text accessibilityRole="alert" style={styles.reliabilityMessage}>{initialDataError}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={isLoading} onPress={() => void refreshOperations()}>
            <Text style={styles.reliabilityRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.tabSceneArea}>
      <Tab.Navigator
        detachInactiveScreens={false}
        screenOptions={({ route }) => ({
          animation: 'none',
          headerShown: false,
          sceneStyle: {
            backgroundColor: isDark ? '#050b18' : '#ffffff',
            paddingTop: route.name === 'Map'
              ? 0
              : insets.top + PAGE_HEADER_CONTENT_HEIGHT,
          },
        })}
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
        <Tab.Screen name="Map" options={{ lazy: false }}>
          {renderMapScreen}
        </Tab.Screen>
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
  reliabilityBanner: { position: 'absolute', left: 12, right: 12, zIndex: 60, elevation: 12, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 12, padding: 12, backgroundColor: '#fef2f2', flexDirection: 'row', alignItems: 'center', gap: 12 },
  reliabilityMessage: { flex: 1, color: '#991b1b', fontSize: 12 },
  reliabilityRetry: { color: '#1d4ed8', fontWeight: '700', padding: 8 },
  appRoot: { flex: 1, backgroundColor: '#ffffff' },
  appRootDark: { backgroundColor: '#050b18' },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  fixedHeaderArea: { zIndex: 20, backgroundColor: '#ffffff' },
  fixedHeaderAreaDark: { backgroundColor: '#0b1528' },
  tabSceneArea: { flex: 1 },
  floatingBar: {
    position: 'absolute',
    right: 45,
    left: 45,
    height: 52,
    paddingHorizontal: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.borderSoft,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    shadowColor: mobileTheme.navy,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingBarDark: {
    borderColor: '#22314a',
    backgroundColor: '#0b1528',
  },
  tabItem: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShell: {
    width: 58,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: 11,
    overflow: 'visible',
  },
  iconShellActive: {
    backgroundColor: mobileTheme.blue,
    borderRadius: 14,
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
