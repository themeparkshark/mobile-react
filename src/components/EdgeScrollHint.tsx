import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from 'react-native';
import GameIcon from '../ui/GameIcon';

/**
 * "There is more this way" for a sideways chip row (T144: the Wait Times resort tabs and the Shark Shop
 * gear chips ran off an iPhone SE edge with nothing to say so). Feed it the row's scroll events; it shows
 * a soft fade in the row's own colour with Alex's arrow while chips are hidden to the right, and goes away
 * at the end of the row.
 */
export function useEdgeScrollHint(): {
  readonly more: boolean;
  readonly onLayout: (e: LayoutChangeEvent) => void;
  readonly onContentSizeChange: (w: number) => void;
  readonly onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const [box, setBox] = useState({ view: 0, content: 0, x: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const view = e.nativeEvent.layout.width;
    setBox(b => (Math.abs(b.view - view) < 1 ? b : { ...b, view }));
  }, []);
  const onContentSizeChange = useCallback((content: number) => setBox(b => (Math.abs(b.content - content) < 1 ? b : { ...b, content })), []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setBox(b => (moreToTheRight(b.view, b.content, x) === moreToTheRight(b.view, b.content, b.x) ? b : { ...b, x }));
  }, []);
  return { more: moreToTheRight(box.view, box.content, box.x), onLayout, onContentSizeChange, onScroll };
}

/** Pure: are chips still hidden to the right? (8 pt of slack, so a row that just fits shows no hint.) */
export function moreToTheRight(view: number, content: number, x: number): boolean {
  return view > 0 && content - view - x > 8;
}

export default function EdgeScrollHint({ more, color, fadeFrom, style }: {
  readonly more: boolean;
  /** The row's background colour. */
  readonly color: string;
  /** The same colour fully transparent (rgba), so the fade never greys out. */
  readonly fadeFrom: string;
  readonly style?: ViewStyle;
}) {
  if (!more) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <LinearGradient colors={[fadeFrom, color]} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }} style={StyleSheet.absoluteFill} />
      <GameIcon name="arrow" size={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 52, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
});
