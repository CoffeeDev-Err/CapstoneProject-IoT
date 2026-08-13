import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  type FlatListProps,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const OPEN_DURATION = 400;
const CLOSE_DURATION = 400;
const DISMISS_VELOCITY = 900;
const EXPANDED_EPSILON = 6;
const SCROLL_TOP_EPSILON = 1;
const SHEET_HANDOFF_DISTANCE = 14;
const INITIAL_SNAP_MIN_OFFSET = 56;
const INITIAL_SNAP_SCREEN_RATIO = 0.58;
const INITIAL_SNAP_SHEET_RATIO = 0.54;
// About one fifth of the distance between snap points is enough to commit.
// The remaining short movement still returns as a subtle accidental-drag bounce.
const EXPAND_SNAP_THRESHOLD_RATIO = 0.78;
const COLLAPSE_SNAP_THRESHOLD_RATIO = 0.22;
const DISMISS_MIN_DRAG_DISTANCE = 90;
const DISMISS_HEIGHT_RATIO = 0.18;
const VELOCITY_PROJECTION_SECONDS = 0.05;
const OPEN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const CLOSE_EASING = Easing.bezier(0.4, 0, 1, 1);
const SNAP_SPRING = {
  damping: 30,
  stiffness: 170,
  mass: 1.05,
  overshootClamping: true,
};

type SwipeDismissControls = {
  close: (afterClose?: () => void) => void;
};

type SwipeDismissSheetProps = {
  children: React.ReactNode | ((controls: SwipeDismissControls) => React.ReactNode);
  containerStyle?: StyleProp<ViewStyle>;
  handleColor?: string;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  tapOutsideToClose?: boolean;
  topInset?: number;
  visible: boolean;
};

type SwipeDismissCardProps = {
  children: React.ReactNode | ((controls: SwipeDismissControls) => React.ReactNode);
  handleColor?: string;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
};

type SheetScrollContextValue = {
  nativeGesture: ReturnType<typeof Gesture.Native>;
  scrollEnabled: boolean;
  scrollOffset: SharedValue<number>;
};

const SheetScrollContext = createContext<SheetScrollContextValue | null>(null);
const AnimatedSheetFlatList = Animated.FlatList as unknown as typeof FlatList;

export function SheetScrollView({
  alwaysBounceVertical,
  bounces,
  overScrollMode,
  scrollEnabled = true,
  ...props
}: ScrollViewProps) {
  const sheet = useContext(SheetScrollContext);
  const fallbackOffset = useSharedValue(0);
  const scrollOffset = sheet?.scrollOffset ?? fallbackOffset;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = Math.max(0, event.contentOffset.y);
    },
  });

  if (!sheet) {
    return (
      <ScrollView
        {...props}
        alwaysBounceVertical={alwaysBounceVertical}
        bounces={bounces}
        overScrollMode={overScrollMode}
        scrollEnabled={scrollEnabled}
      />
    );
  }

  return (
    <GestureDetector gesture={sheet.nativeGesture}>
      <Animated.ScrollView
        {...props}
        alwaysBounceVertical={alwaysBounceVertical ?? true}
        bounces={bounces ?? true}
        directionalLockEnabled
        nestedScrollEnabled
        overScrollMode={overScrollMode ?? 'always'}
        scrollEnabled={sheet.scrollEnabled && scrollEnabled}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      />
    </GestureDetector>
  );
}

export function SheetFlatList<ItemT>({
  alwaysBounceVertical,
  bounces,
  overScrollMode,
  scrollEnabled = true,
  ...props
}: FlatListProps<ItemT>) {
  const sheet = useContext(SheetScrollContext);
  const fallbackOffset = useSharedValue(0);
  const scrollOffset = sheet?.scrollOffset ?? fallbackOffset;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = Math.max(0, event.contentOffset.y);
    },
  });

  if (!sheet) {
    return (
      <FlatList
        {...props}
        alwaysBounceVertical={alwaysBounceVertical}
        bounces={bounces}
        overScrollMode={overScrollMode}
        scrollEnabled={scrollEnabled}
      />
    );
  }

  return (
    <GestureDetector gesture={sheet.nativeGesture}>
      <AnimatedSheetFlatList
        {...props}
        alwaysBounceVertical={alwaysBounceVertical ?? true}
        bounces={bounces ?? true}
        directionalLockEnabled
        nestedScrollEnabled
        overScrollMode={overScrollMode ?? 'always'}
        scrollEnabled={sheet.scrollEnabled && scrollEnabled}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      />
    </GestureDetector>
  );
}

const useExpandableSheetMotion = ({
  active,
  dismissDistance,
  onClose,
}: {
  active: boolean;
  dismissDistance: number;
  onClose: () => void;
}) => {
  const translateY = useSharedValue(dismissDistance);
  const entranceOpacity = useSharedValue(0);
  const lowerSnap = useSharedValue(dismissDistance * INITIAL_SNAP_SHEET_RATIO);
  const measuredHeight = useSharedValue(dismissDistance * 0.92);
  const scrollOffset = useSharedValue(0);
  const gestureStartY = useSharedValue(0);
  const handoffTranslationY = useSharedValue(-1);
  const sheetWasDragged = useSharedValue(false);
  const scrollLocked = useSharedValue(true);
  const isClosing = useSharedValue(false);
  const [contentScrollEnabled, setContentScrollEnabled] = useState(false);
  const closingRef = useRef(false);
  const openedRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  const nativeGesture = useMemo(() => Gesture.Native(), []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const updateScrollEnabled = useCallback((enabled: boolean) => {
    setContentScrollEnabled(enabled);
  }, []);

  const finishClose = useCallback(() => {
    onCloseRef.current();
    afterCloseRef.current?.();
    afterCloseRef.current = undefined;
  }, []);

  useLayoutEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(entranceOpacity);
    closingRef.current = false;
    openedRef.current = false;
    afterCloseRef.current = undefined;
    isClosing.value = false;
    scrollOffset.value = 0;
    scrollLocked.value = true;
    setContentScrollEnabled(false);
    translateY.value = dismissDistance;
    entranceOpacity.value = 0;
  }, [active, dismissDistance, entranceOpacity, isClosing, scrollLocked, scrollOffset, translateY]);

  const handleSheetLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;

    measuredHeight.value = height;
    lowerSnap.value = Math.max(
      INITIAL_SNAP_MIN_OFFSET,
      Math.min(
        dismissDistance * INITIAL_SNAP_SCREEN_RATIO,
        height * INITIAL_SNAP_SHEET_RATIO,
      ),
    );

    if (!active || openedRef.current) return;
    openedRef.current = true;
    translateY.value = dismissDistance;
    entranceOpacity.value = 0;
    translateY.value = withTiming(lowerSnap.value, {
      duration: OPEN_DURATION,
      easing: OPEN_EASING,
    });
    entranceOpacity.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, dismissDistance, entranceOpacity, lowerSnap, measuredHeight, translateY]);

  const close = useCallback((afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = afterClose;
    isClosing.value = true;
    setContentScrollEnabled(false);
    scrollLocked.value = true;

    cancelAnimation(translateY);
    cancelAnimation(entranceOpacity);
    entranceOpacity.value = withTiming(0, {
      duration: 170,
      easing: Easing.in(Easing.cubic),
    });
    translateY.value = withTiming(
      dismissDistance,
      { duration: CLOSE_DURATION, easing: CLOSE_EASING },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [dismissDistance, entranceOpacity, finishClose, isClosing, scrollLocked, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-3, 3])
    .failOffsetX([-32, 32])
    .simultaneousWithExternalGesture(nativeGesture)
    .onTouchesDown(() => {
      if (isClosing.value) return;

      // A snap animation can be interrupted by a new touch before its
      // completion callback runs. Repair the native scroll state as soon as
      // the sheet is effectively at the expanded position.
      if (translateY.value <= EXPANDED_EPSILON && scrollLocked.value) {
        scrollLocked.value = false;
        runOnJS(updateScrollEnabled)(true);
      }
    })
    .onBegin(() => {
      // Never cancel the closing timing animation. Its completion callback
      // removes the native Modal that otherwise blocks the whole app.
      if (isClosing.value) return;

      cancelAnimation(translateY);
      gestureStartY.value = translateY.value;
      sheetWasDragged.value = false;

      // Keep the JS and UI-thread lock states synchronized even when a
      // previous spring was interrupted by this gesture.
      const startedExpanded = gestureStartY.value <= EXPANDED_EPSILON;
      if (scrollLocked.value === startedExpanded) {
        scrollLocked.value = !startedExpanded;
        runOnJS(updateScrollEnabled)(startedExpanded);
      }

      handoffTranslationY.value = (
        gestureStartY.value <= EXPANDED_EPSILON
        && scrollOffset.value <= SCROLL_TOP_EPSILON
      ) ? 0 : -1;
    })
    .onUpdate((event) => {
      if (isClosing.value) return;

      const startedExpanded = gestureStartY.value <= EXPANDED_EPSILON;

      if (startedExpanded) {
        if (event.translationY <= 0 || scrollOffset.value > SCROLL_TOP_EPSILON) return;

        if (handoffTranslationY.value < 0) {
          handoffTranslationY.value = event.translationY;
        }

        const intentionalDrag = event.translationY - handoffTranslationY.value;
        if (intentionalDrag <= SHEET_HANDOFF_DISTANCE) return;

        const nextY = intentionalDrag - SHEET_HANDOFF_DISTANCE;
        if (nextY <= 0) return;
        sheetWasDragged.value = true;
        translateY.value = Math.min(dismissDistance, nextY);
      } else {
        sheetWasDragged.value = true;
        translateY.value = Math.max(
          0,
          Math.min(dismissDistance, gestureStartY.value + event.translationY),
        );
      }
    })
    .onEnd((event) => {
      if (isClosing.value) return;
      if (!sheetWasDragged.value) return;

      const currentY = translateY.value;
      const projectedY = currentY + (event.velocityY * VELOCITY_PROJECTION_SECONDS);
      const dismissThreshold = lowerSnap.value + Math.max(
        DISMISS_MIN_DRAG_DISTANCE,
        measuredHeight.value * DISMISS_HEIGHT_RATIO,
      );

      if (
        projectedY >= dismissThreshold
        || (event.velocityY >= DISMISS_VELOCITY && currentY > lowerSnap.value)
      ) {
        runOnJS(close)();
        return;
      }

      const startedExpanded = gestureStartY.value <= EXPANDED_EPSILON;
      const snapThresholdRatio = startedExpanded
        ? COLLAPSE_SNAP_THRESHOLD_RATIO
        : EXPAND_SNAP_THRESHOLD_RATIO;
      const target = projectedY < lowerSnap.value * snapThresholdRatio
        ? 0
        : lowerSnap.value;

      // Commit the next scroll state before starting the spring. That keeps
      // content scrolling deterministic if the spring is interrupted.
      const expanded = target === 0;
      scrollLocked.value = !expanded;
      runOnJS(updateScrollEnabled)(expanded);
      translateY.value = withSpring(target, SNAP_SPRING);
    })
    .onFinalize((_event, success) => {
      if (isClosing.value) return;
      if (success || !sheetWasDragged.value) return;
      const startedExpanded = gestureStartY.value <= EXPANDED_EPSILON;
      const snapThresholdRatio = startedExpanded
        ? COLLAPSE_SNAP_THRESHOLD_RATIO
        : EXPAND_SNAP_THRESHOLD_RATIO;
      const target = translateY.value < lowerSnap.value * snapThresholdRatio
        ? 0
        : lowerSnap.value;
      const expanded = target === 0;
      scrollLocked.value = !expanded;
      runOnJS(updateScrollEnabled)(expanded);
      translateY.value = withSpring(target, SNAP_SPRING);
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value * interpolate(
      translateY.value,
      [0, lowerSnap.value, dismissDistance],
      [1, 0.72, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return {
    backdropAnimatedStyle,
    close,
    handleSheetLayout,
    nativeGesture,
    panGesture,
    scrollEnabled: contentScrollEnabled,
    scrollOffset,
    sheetAnimatedStyle,
  };
};

const useCardDismissMotion = ({
  dismissDistance,
  entranceOffset,
  onClose,
  threshold,
}: {
  dismissDistance: number;
  entranceOffset: number;
  onClose: () => void;
  threshold: number;
}) => {
  const translateY = useSharedValue(entranceOffset);
  const opacity = useSharedValue(0);
  const closingRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | undefined>(undefined);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const finishClose = useCallback(() => {
    onCloseRef.current();
    afterCloseRef.current?.();
    afterCloseRef.current = undefined;
  }, []);

  useEffect(() => {
    closingRef.current = false;
    translateY.value = entranceOffset;
    opacity.value = 0;
    translateY.value = withTiming(0, { duration: 260, easing: OPEN_EASING });
    opacity.value = withTiming(1, { duration: 180 });
  }, [entranceOffset, opacity, translateY]);

  const close = useCallback((afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = afterClose;
    opacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(
      dismissDistance,
      { duration: 220, easing: CLOSE_EASING },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [dismissDistance, finishClose, opacity, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(4)
    .failOffsetX([-18, 18])
    .onBegin(() => cancelAnimation(translateY))
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY >= threshold || event.velocityY >= 900) {
        runOnJS(close)();
        return;
      }
      translateY.value = withSpring(0, SNAP_SPRING);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return { animatedStyle, close, panGesture };
};

const DragHandle = ({
  close,
  color,
  gesture,
}: {
  close: () => void;
  color: string;
  gesture?: ReturnType<typeof Gesture.Pan>;
}) => {
  const handle = (
    <View
      accessibilityActions={[{ name: 'dismiss', label: 'Close panel' }]}
      accessibilityHint="Swipe the sheet up to expand or down to collapse and dismiss"
      accessibilityLabel="Sheet drag handle"
      accessibilityRole="adjustable"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'dismiss') close();
      }}
      style={styles.handleTouchArea}
    >
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );

  return gesture ? <GestureDetector gesture={gesture}>{handle}</GestureDetector> : handle;
};

export function SwipeDismissSheet({
  children,
  containerStyle,
  handleColor = '#cbd5e1',
  onClose,
  sheetStyle,
  tapOutsideToClose = true,
  topInset = 0,
  visible,
}: SwipeDismissSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const motion = useExpandableSheetMotion({
    active: visible,
    dismissDistance: screenHeight,
    onClose,
  });
  const scrollContext = useMemo<SheetScrollContextValue>(() => ({
    nativeGesture: motion.nativeGesture,
    scrollEnabled: motion.scrollEnabled,
    scrollOffset: motion.scrollOffset,
  }), [motion.nativeGesture, motion.scrollEnabled, motion.scrollOffset]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={() => motion.close()}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <View style={[styles.modalRoot, { paddingTop: topInset }, containerStyle]}>
          <Animated.View style={[styles.backdrop, motion.backdropAnimatedStyle]}>
            {tapOutsideToClose && (
              <Pressable
                accessibilityLabel="Close panel"
                accessibilityRole="button"
                style={StyleSheet.absoluteFill}
                onPress={() => motion.close()}
              />
            )}
          </Animated.View>
          <GestureDetector gesture={motion.panGesture}>
            <Animated.View
              onLayout={motion.handleSheetLayout}
              style={[
                styles.sheet,
                sheetStyle,
                motion.sheetAnimatedStyle,
              ]}
            >
              <SheetScrollContext.Provider value={scrollContext}>
                <DragHandle close={motion.close} color={handleColor} />
                {typeof children === 'function' ? children({ close: motion.close }) : children}
              </SheetScrollContext.Provider>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function SwipeDismissCard({
  children,
  handleColor = 'rgba(255,255,255,0.36)',
  onClose,
  style,
}: SwipeDismissCardProps) {
  const motion = useCardDismissMotion({
    dismissDistance: 360,
    entranceOffset: 44,
    onClose,
    threshold: 80,
  });

  return (
    <Animated.View style={[style, motion.animatedStyle]}>
      <DragHandle close={motion.close} color={handleColor} gesture={motion.panGesture} />
      {typeof children === 'function' ? children({ close: motion.close }) : children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,35,0.46)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  handleTouchArea: {
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: 3,
  },
});
