/**
 * News v2 filter strip: a round search button, then one chip per park family
 * (Top Stories, Disney, Universal, SeaWorld, More Parks). Picking Disney or
 * Universal slides in a second row of park chips. Search swaps the chips for a
 * text field; Done brings them back.
 *
 * Chips match Standings: white pills with a 4 px lip, gold when chosen.
 */
import * as Haptics from 'expo-haptics';
import GamePress from './GamePress';
import useTapSound from './useTapSound';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { BRAND, GameIcon, RADIUS, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { NEWS_FILTERS, filterByKey, type NewsFilterKey } from './newsModel';


function Chip({ label, icon, on, small = false, onPress, onLayout }: {
  readonly label: string; readonly icon?: GameIconName; readonly on: boolean; readonly small?: boolean; readonly onPress: () => void;
  readonly onLayout?: (x: number, w: number) => void;
}) {
  return (
    <GamePress accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Show ${label} news`} hitSlop={4}
      onLayout={onLayout}
      onPress={onPress}
      lip={small ? 4 : 5}
        style={{
        height: small ? 36 : 42, paddingHorizontal: small ? 12 : 13, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: on ? BRAND.gold : BRAND.white, borderWidth: 3, borderColor: on ? BRAND.goldLip : 'rgba(5,52,110,0.26)' }}>
      {icon && <GameIcon name={icon} size={small ? 18 : 22} />}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: small ? 13 : 15, color: BRAND.navy }}>{label}</Text>
    </GamePress>
  );
}

function ChipRow({ items, value, small, onChange, leading, endInset = 0 }: {
  readonly endInset?: number;
  readonly items: readonly { key: string; label: string; icon?: GameIconName }[]; readonly value: string; readonly small?: boolean;
  readonly onChange: (key: string) => void; readonly leading?: React.ReactNode;
}) {
  const scroller = useRef<ScrollView>(null);
  const spots = useRef(new Map<string, { x: number; w: number }>());
  const { width } = useWindowDimensions();
  // The chosen chip always scrolls fully into view.
  const reveal = useCallback((key: string) => {
    const spot = spots.current.get(key);
    if (spot) scroller.current?.scrollTo({ x: Math.max(0, spot.x - (width - spot.w) / 2), animated: true });
  }, [width]);
  useEffect(() => { reveal(value); }, [value, reveal]);
  const [atEnd, setAtEnd] = useState(false);
  return (
    // The row ends before the docked Back-to-top button, so no chip ever sits under it.
    <View style={{ marginRight: endInset, ...(endInset ? { overflow: 'hidden', borderTopRightRadius: 24, borderBottomRightRadius: 24 } : null) }}>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={64}
        onScroll={e => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const end = contentOffset.x + layoutMeasurement.width >= contentSize.width - 8;
          if (end !== atEnd) setAtEnd(end);
        }}
        contentContainerStyle={{ paddingLeft: 14, paddingRight: 14, paddingVertical: 2, gap: 8, alignItems: 'center' }}>
        {leading}
        {items.map(item => (
          <Chip key={item.key} label={item.label} icon={item.icon} on={item.key === value} small={small}
            onLayout={(x, w) => { spots.current.set(item.key, { x, w }); if (item.key === value) reveal(item.key); }}
            onPress={() => onChange(item.key)} />
        ))}
      </ScrollView>
      {/* More chips this way: a soft water fade at the edge until the row is scrolled to its end. */}
      {!atEnd && !endInset && (
        <LinearGradient pointerEvents="none" start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          colors={['rgba(14,127,217,0)', 'rgba(14,127,217,0.85)']}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36 }} />
      )}
    </View>
  );
}

export default function NewsFilterBar({ filter, park, searching, query, onFilter, onPark, onSearchOpen, onSearchClose, onQuery, endInset = 0 }: {
  /** Room at the row's end for the docked Back to top button. */
  readonly endInset?: number;
  readonly filter: NewsFilterKey;
  readonly park: string | null;
  readonly searching: boolean;
  readonly query: string;
  readonly onFilter: (key: NewsFilterKey) => void;
  readonly onPark: (key: string | null) => void;
  readonly onSearchOpen: () => void;
  readonly onSearchClose: () => void;
  readonly onQuery: (text: string) => void;
}) {
  const tap = useTapSound();
  const reduced = useUiReducedMotion();
  const tick = () => {
    tap();
    void Haptics.selectionAsync().catch(() => undefined);
  };
  const parks = filterByKey(filter).parks;
  const enter = reduced ? undefined : FadeIn.duration(160);
  const exit = reduced ? undefined : FadeOut.duration(120);
  const layout = reduced ? undefined : LinearTransition.duration(180);

  if (searching) {
    return (
      <Animated.View entering={enter} style={{ paddingTop: 10, paddingBottom: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, height: 44, borderRadius: RADIUS.pill, backgroundColor: BRAND.white, borderWidth: 2, borderBottomWidth: 4,
          borderColor: BRAND.goldLip, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <GameIcon name="search" size={22} />
          <TextInput value={query} onChangeText={onQuery} autoFocus placeholder="Search" placeholderTextColor="#7d93b3"
            returnKeyType="search" autoCorrect={false} autoCapitalize="none" maxLength={60} clearButtonMode="while-editing"
            accessibilityLabel="Search the news" maxFontSizeMultiplier={1.25}
            style={{ flex: 1, height: 40, fontFamily: 'Knockout', fontSize: 18, color: BRAND.navy }} />
        </View>
        <GamePress accessibilityRole="button" accessibilityLabel="Done searching" hitSlop={8}
          onPress={() => { tick(); onSearchClose(); }}
          lip={4}
        style={{ height: 44, paddingHorizontal: 14, borderRadius: RADIUS.pill, justifyContent: 'center', backgroundColor: BRAND.white,
            borderWidth: 2, borderColor: 'rgba(5,52,110,0.2)' }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>Done</Text>
        </GamePress>
      </Animated.View>
    );
  }

  const search = (
    <GamePress key="search" accessibilityRole="button" accessibilityLabel="Search the news" hitSlop={4}
      onPress={() => { tick(); onSearchOpen(); }}
      lip={5}
        style={{ width: 46, height: 42, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.white,
        borderWidth: 3, borderColor: 'rgba(5,52,110,0.26)' }}>
      <GameIcon name="search" size={22} />
    </GamePress>
  );

  return (
    <Animated.View layout={layout} style={{ paddingTop: 10, paddingBottom: 6, gap: 8 }}>
      <ChipRow items={NEWS_FILTERS} value={filter} leading={search} endInset={endInset}
        onChange={key => { if (key === filter && !park) return; tick(); onFilter(key as NewsFilterKey); }} />
      {parks.length > 0 && (
        <Animated.View entering={enter} exiting={exit}>
          <ChipRow small value={park ?? 'all'} items={[{ key: 'all', label: `All ${filterByKey(filter).label}` }, ...parks]}
            onChange={key => { const next = key === 'all' ? null : key; if (next === park) return; tick(); onPark(next); }} />
        </Animated.View>
      )}
    </Animated.View>
  );
}
