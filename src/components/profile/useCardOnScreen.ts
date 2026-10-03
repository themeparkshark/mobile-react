/**
 * Is one card inside a ScrollView visible? The card is measured in the
 * scroll content's coordinates (measureLayout against the content root), so
 * cards above it never skew the answer. Used to pause the XP potion's clock
 * the moment its card leaves the viewport.
 *
 *   const vis = useCardOnScreen();
 *   <ScrollView {...vis.scrollProps}><View ref={vis.contentRef} onLayout={vis.remeasure}>
 *     <View ref={vis.cardRef} onLayout={vis.remeasure}>...</View>
 *   </View></ScrollView>
 *   paused={vis.offscreen}
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';

export function isOffscreen(card: { top: number; bottom: number }, viewport: { y: number; height: number }): boolean {
  if (viewport.height <= 0 || card.bottom <= card.top) return false;
  return card.bottom <= viewport.y || card.top >= viewport.y + viewport.height;
}

export default function useCardOnScreen() {
  const contentRef = useRef<View>(null);
  const cardRef = useRef<View>(null);
  const card = useRef({ top: 0, bottom: 0 });
  const viewport = useRef({ y: 0, height: 0 });
  const [offscreen, setOffscreen] = useState(false);

  const update = useCallback(() => {
    const off = isOffscreen(card.current, viewport.current);
    setOffscreen((prev) => (prev === off ? prev : off));
  }, []);

  const remeasure = useCallback(() => {
    const target = cardRef.current;
    const content = contentRef.current;
    if (!target || !content) return;
    target.measureLayout(content, (_x, y, _w, h) => {
      card.current = { top: y, bottom: y + h };
      update();
    }, () => undefined);
  }, [update]);

  const scrollProps = useMemo(() => ({
    scrollEventThrottle: 100,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.current = { ...viewport.current, y: e.nativeEvent.contentOffset.y };
      update();
    },
    onLayout: (e: LayoutChangeEvent) => {
      viewport.current = { ...viewport.current, height: e.nativeEvent.layout.height };
      update();
    },
  }), [update]);

  return { contentRef, cardRef, remeasure, scrollProps, offscreen };
}
