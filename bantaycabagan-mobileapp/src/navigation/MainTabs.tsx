import React, { useState } from 'react';
import {
  Modal,
  Pressable,
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
import { mobileTheme } from '../constants/mobileTheme';
import OfficerMapScreen from '../screens/OfficerMapScreen';
import TasksScreen from '../screens/TasksScreen';
import ReportsScreen from '../screens/ReportsScreen';
import OfficerProfileScreen from '../screens/OfficerProfileScreen';
import { useOperationalContext } from '../context/OperationalContext';

const Tab = createBottomTabNavigator();

const tabIcons: Record<string, keyof typeof Icon.glyphMap> = {
  Map: 'map',
  Tasks: 'assignment',
  Reports: 'description',
  Profile: 'person',
};

type FloatingTabBarProps = BottomTabBarProps & {
  openTaskModal: () => void;
  openTaskCount: number;
};

function FloatingTabBar({
  state,
  navigation,
  openTaskModal,
  openTaskCount,
}: FloatingTabBarProps) {
  return (
    <View style={styles.floatingBar}>
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
            <View style={styles.iconShell}>
              <Icon
                name={tabIcons[route.name]}
                size={29}
                color={focused ? '#ffffff' : '#bfc1ed'}
              />
              {isTasks && openTaskCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {openTaskCount > 9 ? '9+' : openTaskCount}
                  </Text>
                </View>
              )}
              {focused && <View style={styles.activeDot} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function MainTabs() {
  const { tasks } = useOperationalContext();
  const [tasksVisible, setTasksVisible] = useState(false);
  const openTaskCount = tasks.filter((task) => task.status === 'open').length;

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            openTaskCount={openTaskCount}
            openTaskModal={() => setTasksVisible(true)}
          />
        )}
      >
        <Tab.Screen name="Map" component={OfficerMapScreen} />
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
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Close tasks"
            style={StyleSheet.absoluteFill}
            onPress={() => setTasksVisible(false)}
          />
          <View style={styles.taskSheet}>
            <View style={styles.sheetHandle} />
            <TasksScreen presentation="modal" onClose={() => setTasksVisible(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingBar: {
    position: 'absolute',
    right: 38,
    bottom: 18,
    left: 38,
    height: 66,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 34,
    backgroundColor: mobileTheme.blue,
    shadowColor: '#11113f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 12,
  },
  tabItem: {
    width: '25%',
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShell: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 3,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: mobileTheme.blue,
    borderRadius: 9,
    backgroundColor: mobileTheme.danger,
  },
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,15,35,0.46)',
  },
  taskSheet: {
    height: '84%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: mobileTheme.surface,
    overflow: 'hidden',
  },
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
