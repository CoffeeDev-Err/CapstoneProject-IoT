import React, { useEffect, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';

const INDICATOR_DURATION_MS = 190;
const INDICATOR_EASING = Easing.bezier(0.2, 0, 0, 1);

function SlidingTabLabel({
  index,
  indicatorX,
  label,
  mutedColor,
  tabWidth,
}: {
  index: number;
  indicatorX: SharedValue<number>;
  label: string;
  mutedColor: string;
  tabWidth: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = tabWidth > 0
      ? Math.min(1, Math.abs(indicatorX.value - (index * tabWidth)) / tabWidth)
      : 1;
    return {
      color: interpolateColor(distance, [0, 1], [mobileTheme.blue, mutedColor]),
      transform: [{
        scale: interpolate(distance, [0, 1], [1.035, 1], Extrapolation.CLAMP),
      }],
    };
  }, [index, mutedColor, tabWidth]);

  return <Animated.Text style={[styles.label, animatedStyle]}>{label}</Animated.Text>;
}

export function SlidingUnderlineTabs<T extends string>({
  items,
  onSelect,
  selected,
  style,
}: {
  items: readonly T[];
  onSelect: (item: T) => void;
  selected: T;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useMobileTheme();
  const [width, setWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const tabWidth = width > 0 ? width / items.length : 0;
  const selectedIndex = Math.max(0, items.indexOf(selected));

  useEffect(() => {
    if (!tabWidth) return;
    cancelAnimation(indicatorX);
    indicatorX.value = withTiming(selectedIndex * tabWidth, {
      duration: INDICATOR_DURATION_MS,
      easing: INDICATOR_EASING,
    });
  }, [indicatorX, selectedIndex, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));
  const labels = useMemo(() => items.map((item) => (
    `${item.charAt(0).toUpperCase()}${item.slice(1)}`
  )), [items]);
  const measure = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };
  const selectTab = (item: T, index: number) => {
    if (tabWidth > 0) {
      cancelAnimation(indicatorX);
      indicatorX.value = withTiming(index * tabWidth, {
        duration: INDICATOR_DURATION_MS,
        easing: INDICATOR_EASING,
      });
    }
    onSelect(item);
  };

  return (
    <View onLayout={measure} style={[styles.container, style]}>
      {items.map((item, index) => {
        const active = item === selected;
        return (
          <TouchableOpacity
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            activeOpacity={0.68}
            onPress={() => selectTab(item, index)}
            style={styles.tab}
          >
            <SlidingTabLabel
              index={index}
              indicatorX={indicatorX}
              label={labels[index]}
              mutedColor={colors.textMuted}
              tabWidth={tabWidth}
            />
          </TouchableOpacity>
        );
      })}
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: tabWidth }, indicatorStyle]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    minHeight: 46,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: mobileTheme.blue,
  },
});
