import React, { useCallback, useEffect } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const COLLAPSE_DURATION = 230;
const COLLAPSE_EASING = Easing.bezier(0.2, 0, 0, 1);

export function SmoothCollapsible({
  children,
  expanded,
}: {
  children: React.ReactNode;
  expanded: boolean;
}) {
  const measuredHeight = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: COLLAPSE_DURATION,
      easing: COLLAPSE_EASING,
    });
  }, [expanded, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: Math.max(0, measuredHeight.value * progress.value),
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0.7, 1]),
  }));

  const measureContent = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight > 0) measuredHeight.value = nextHeight;
  }, [measuredHeight]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[styles.collapsible, animatedStyle]}
    >
      <View onLayout={measureContent} style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  collapsible: { overflow: 'hidden' },
  content: { position: 'absolute', width: '100%' },
});
