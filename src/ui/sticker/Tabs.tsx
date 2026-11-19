/**
 * Tabs and filter chips (DIRECTION.md kit: Tabs; kit.css .seg and .chip). Level 2, never a white
 * edge, and the pick is never gold.
 *
 * Tabs: a groove (navy line, the blue lip colour, an inset shadow) holding equal tabs; the picked
 * one is a white sticker lifted on a hard drop, its words plain navy, the others outlined white.
 * FilterChips: a row of groove pills with Alex's small icons; the picked chip is white, lifted 2 pt
 * (by translateY) on a hard drop.
 * Every tab is at least 44 pt to touch, squishes when pressed (UI thread), says "tab" and
 * "selected"; handlers are stable so a memoised row never re-renders for a press.
 */
import { memo, useCallback, type ReactNode } from 'react';
import { Image, Pressable, View, type ImageSourcePropType, type StyleProp } from 'react-native';
import type { LayoutStyle } from './style';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import StickerText from './StickerText';
import { usePress } from './motion';
import { BUTTON_TEXT, TEXT } from './textRoles';
import { BUTTON, DROP, INK, LINE, SHADE } from './tokens';

export type TabItem = {
  readonly key: string;
  readonly label: string;
  readonly accessibilityLabel?: string;
  /** Alex's small icon before the words (filter chips). */
  readonly icon?: ImageSourcePropType;
  readonly iconRatio?: number;
  /** A kit piece before the words instead of an icon (a small dashed spot for "to find"). */
  readonly leading?: ReactNode;
};

const PICKED = [INK.white, INK.cream] as const;
const TAB_H = 36;
const TAB_TEXT = { ...BUTTON_TEXT.row, size: 18, spacing: 0.05 };

const Tab = memo(function Tab({ item, picked, onPick }: { item: TabItem; picked: boolean; onPick?: (key: string) => void }) {
  const { p, pressIn, pressOut } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * p.value }] }));
  const press = useCallback(() => { haptic('tapLight'); onPick?.(item.key); }, [item.key, onPick]);
  const slop = (BUTTON.minTouch - TAB_H) / 2;
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={item.accessibilityLabel ?? item.label} accessibilityState={{ selected: picked }}
      onPressIn={pressIn} onPressOut={pressOut} onPress={press} hitSlop={{ top: slop, bottom: slop }}
      style={{ flex: 1, minWidth: BUTTON.minTouch, height: TAB_H + 3 }}>
      <Animated.View style={[{ height: TAB_H }, squish]}>
        {picked ? (
          <>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 3, height: TAB_H, borderRadius: TAB_H / 2, backgroundColor: DROP.knob }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TAB_H, borderRadius: TAB_H / 2, borderWidth: LINE.chip, borderColor: INK.navy, overflow: 'hidden' }}>
              <LinearGradient colors={PICKED} style={{ flex: 1 }} />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: INK.creamDeep }} />
            </View>
          </>
        ) : null}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2, paddingHorizontal: 6 }}>
          <StickerText spec={TAB_TEXT} tone={picked ? 'navy' : 'auto'} role="none" fit>{item.label}</StickerText>
        </View>
      </Animated.View>
    </Pressable>
  );
});

function TabsImpl({ items, picked, onPick, style }: { readonly items: readonly TabItem[]; readonly picked: string; readonly onPick?: (key: string) => void; readonly style?: StyleProp<LayoutStyle> }) {
  return (
    <View accessibilityRole="tablist" style={[{ borderRadius: 999, borderWidth: LINE.card, borderColor: INK.navy, backgroundColor: INK.blueLip, padding: 5 }, style]}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999, borderTopWidth: 4, borderColor: SHADE.grooveInset }} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {items.map(item => <Tab key={item.key} item={item} picked={item.key === picked} onPick={onPick} />)}
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, bottom: -1.5 - LINE.card, height: 1.5, borderRadius: 1, backgroundColor: SHADE.grooveRim }} />
    </View>
  );
}

export const Tabs = memo(TabsImpl);
export default Tabs;

const CHIP_H = 30;
const LIFT = 2;
const CHIP_TEXT = { ...TEXT.tag, size: 13, maxScale: 1.15 };

const Chip = memo(function Chip({ item, picked, onPick }: { item: TabItem; picked: boolean; onPick?: (key: string) => void }) {
  const { p, pressIn, pressOut } = usePress();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: (picked ? -LIFT : 0) + 1.5 * p.value }, { scale: 1 - 0.04 * p.value }] }));
  const press = useCallback(() => { haptic('tapLight'); onPick?.(item.key); }, [item.key, onPick]);
  const slop = (BUTTON.minTouch - CHIP_H) / 2;
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={item.accessibilityLabel ?? item.label} accessibilityState={{ selected: picked }}
      onPressIn={pressIn} onPressOut={pressOut} onPress={press} hitSlop={{ top: slop, bottom: slop, left: 2, right: 2 }}
      style={{ flexShrink: 1, minWidth: BUTTON.minTouch, height: CHIP_H + 3 + LIFT, paddingTop: LIFT }}>
      <Animated.View style={lift}>
        {picked ? <View style={{ position: 'absolute', left: 0, right: 0, top: 3, height: CHIP_H, borderRadius: CHIP_H / 2, backgroundColor: DROP.knob }} /> : null}
        <View style={{ height: CHIP_H, borderRadius: CHIP_H / 2, borderWidth: LINE.chip, borderColor: INK.navy, overflow: 'hidden', backgroundColor: INK.blueLip,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingLeft: item.icon || item.leading ? 6 : 10, paddingRight: 9, gap: 3 }}>
          {picked ? <LinearGradient colors={PICKED} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: CHIP_H / 2,
            borderTopWidth: picked ? 0 : 3, borderBottomWidth: picked ? 3 : 0, borderColor: picked ? INK.creamDeep : SHADE.grooveInset }} />
          {item.leading ?? (item.icon ? <Image source={item.icon} resizeMode="contain" fadeDuration={0} style={{ height: 22, width: 22 * (item.iconRatio ?? 1), marginTop: -2 }} /> : null)}
          <View style={{ flexShrink: 1, paddingTop: 2 }}>
            <StickerText spec={CHIP_TEXT} tone={picked ? 'navy' : 'auto'} align="left" lineHeight={16} role="none" fit>{item.label}</StickerText>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

function FilterChipsImpl({ items, picked, onPick, style }: { readonly items: readonly TabItem[]; readonly picked: string; readonly onPick?: (key: string) => void; readonly style?: StyleProp<LayoutStyle> }) {
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }, style]}>
      {items.map(item => <Chip key={item.key} item={item} picked={item.key === picked} onPick={onPick} />)}
    </View>
  );
}

export const FilterChips = memo(FilterChipsImpl);
