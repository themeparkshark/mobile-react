/**
 * One LinePlay activity page: a framed window that stays put above the STORY
 * rail while the page's content scrolls inside it.
 *
 * The frame (white rim, rounded corners, its own light fill) never moves, so
 * its bottom edge always sits cleanly above the rail and nothing looks drawn
 * over. While more is below, the content melts into a pale mist of the frame's
 * own fill (a yellow card goes cream, never olive over the dark water) and a
 * small round arrow in the corner says "more below"; tapping it scrolls down. At the end
 * there is no fade at all.
 *
 * Cheap: the fade and arrow mount only while there is more to see, they fade
 * in and out on the UI thread, and the scroll check only flips one boolean.
 */
import { forwardRef, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { borderRadius, shadows, spacing } from '../../../design-system';
import { GameIcon } from '../../../ui';
import { fadeHeight, frameFade, moreBelow } from '../../../services/lineplay/lineLayout';

const RIM = 3;
const ARROW = 22;

export interface PageScrollProps {
  /** The frame's own fill; the fade ends in exactly this color. */
  readonly fill: string;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange?: (width: number, height: number) => void;
  readonly testID?: string;
}

const PageScroll = forwardRef<ScrollView, PageScrollProps>(function PageScroll(
  { fill, contentStyle, children, onLayout, onContentSizeChange, testID }, ref) {
  const inner = useRef<ScrollView | null>(null);
  const size = useRef({ view: 0, content: 0, y: 0 });
  const [more, setMore] = useState(false);
  const [viewHeight, setViewHeight] = useState(0);
  const fade = frameFade(fill);
  const check = useCallback(() => {
    const s = size.current;
    setMore(moreBelow(s.content, s.view, s.y));
  }, []);
  const setRef = useCallback((node: ScrollView | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  return (
    <View style={[styles.frame, { backgroundColor: fill }]} testID={testID}>
      <View style={styles.clip}>
        <ScrollView ref={setRef} style={styles.scroll} contentContainerStyle={[styles.content, contentStyle]}
          scrollEventThrottle={48}
          onLayout={(event) => {
            size.current.view = event.nativeEvent.layout.height;
            setViewHeight(event.nativeEvent.layout.height);
            check();
            onLayout?.(event);
          }}
          onContentSizeChange={(width, height) => {
            size.current.content = height;
            check();
            onContentSizeChange?.(width, height);
          }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            size.current.y = event.nativeEvent.contentOffset.y;
            check();
          }}>
          {children}
        </ScrollView>
        {more && <Animated.View pointerEvents="none" entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)}
          style={[styles.fade, { height: fadeHeight(viewHeight) }]}>
          <LinearGradient colors={fade.colors} locations={fade.locations} style={StyleSheet.absoluteFill} />
        </Animated.View>}
      </View>
      {/* "More below" sits ON the frame's bottom rim, like a tab, so it never covers a card's text or button. */}
      {more && <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.moreWrap} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="More below. Scroll down."
          hitSlop={{ top: 10, bottom: 6, left: 16, right: 16 }}
          onPress={() => {
            const s = size.current;
            inner.current?.scrollTo({ y: s.y + Math.max(80, s.view * 0.6), animated: true });
          }}
          style={styles.moreArrow}>
          <GameIcon name="arrow" size={ARROW} />
        </Pressable>
      </Animated.View>}
    </View>
  );
});

export default PageScroll;

const styles = StyleSheet.create({
  // Lines up with the wait card's edges and stops just above the rail.
  frame: { flex: 1, marginBottom: 10, borderRadius: borderRadius.xxl, borderWidth: RIM, borderColor: '#ffffff',
    ...shadows.lg },
  clip: { flex: 1, borderRadius: borderRadius.xxl - RIM, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // Centered on the bottom rim (half inside the frame, half in the gap above the rail).
  moreWrap: { position: 'absolute', left: 0, right: 0, bottom: -(RIM / 2 + ARROW / 2), alignItems: 'center' },
  moreArrow: { transform: [{ rotate: '90deg' }] },
});
