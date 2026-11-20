/**
 * NEAR ME (arcade plan, section 6, Nov 20 2026): every coin here not yet won, one identical row each, A to Z by
 * default, a Distance switch the phone remembers, and one chip, "I can play now". No top pick, no gold row, no
 * headline: the player picks (Dustin, Nov 20: "it's their choice to play"). Tapping a row makes it YOUR PICK.
 * Opened from the map card's NEAR ME and from Get Tickets (with "I can play now" already on).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import TicketPips from '../tickets/TicketPips';
import { cleanSort, nearMeLine, nearMeRows, nearMeSortKey, type NearMeInput, type NearMeRow, type NearMeSort } from './nearMeModel';

const COIN_FALLBACK = require('../../../assets/images/coingold.png');

export interface NearMeSheetProps {
  readonly visible: boolean;
  readonly playerId: number | null;
  readonly parkName: string | null;
  readonly tasks: NearMeInput['tasks'];
  readonly ownedTaskIds: ReadonlySet<number>;
  readonly here: NearMeInput['here'];
  readonly live: NearMeInput['live'];
  readonly tickets: number;
  /** Open with "I can play now" on (from Get Tickets). */
  readonly canPlayFirst?: boolean;
  readonly onPick: (taskId: number) => void;
  readonly onClose: () => void;
}

function Row({ row, tickets, onPress }: { row: NearMeRow; tickets: number; onPress: () => void }) {
  const line = nearMeLine(row);
  return <Pressable testID={`near-me-row-${row.taskId}`} accessibilityRole="button"
    accessibilityLabel={`${row.name}. ${row.price != null ? `${row.price} ${row.price === 1 ? 'Ticket' : 'Tickets'}. ` : ''}${line}. Make this my pick`}
    onPress={() => { haptic('tapLight'); onPress(); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Image source={row.coinUrl ? { uri: row.coinUrl } : COIN_FALLBACK} style={styles.coin} contentFit="contain" />
    <View style={styles.rowCopy}>
      <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={1.3}>{row.name}</Text>
      {!!line && <Text style={styles.line} numberOfLines={1} maxFontSizeMultiplier={1.3}>{line}</Text>}
    </View>
    <TicketPips price={row.price} held={tickets} size="island" showNumber tone="onDark" />
  </Pressable>;
}

function Switch({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
    hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} onPress={() => { haptic('tapLight'); onPress(); }}
    style={({ pressed }) => [styles.switch, on && styles.switchOn, pressed && styles.pressed]}>
    <Text style={[styles.switchText, on && styles.switchTextOn]} maxFontSizeMultiplier={1.3}>{label}</Text>
  </Pressable>;
}

export default function NearMeSheet({ visible, playerId, parkName, tasks, ownedTaskIds, here, live, tickets, canPlayFirst = false,
  onPick, onClose }: NearMeSheetProps) {
  const reduced = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<NearMeSort>('az');
  const [canPlayOnly, setCanPlayOnly] = useState(canPlayFirst);
  // The sort the player chose last time on this phone.
  useEffect(() => {
    let live = true;
    try {
      AsyncStorage.getItem(nearMeSortKey(playerId)).then(raw => { if (live) setSort(cleanSort(raw)); }).catch(() => undefined);
    } catch { /* storage unavailable: A to Z */ }
    return () => { live = false; };
  }, [playerId]);
  useEffect(() => { if (visible) setCanPlayOnly(canPlayFirst); }, [visible, canPlayFirst]);
  const chooseSort = (next: NearMeSort) => {
    setSort(next);
    try { void AsyncStorage.setItem(nearMeSortKey(playerId), next).catch(() => undefined); } catch { /* not remembered */ }
  };
  const rows = useMemo(() => visible ? nearMeRows({ tasks, ownedTaskIds, here, live, tickets, sort, canPlayOnly }) : [],
    [visible, tasks, ownedTaskIds, here?.latitude, here?.longitude, live, tickets, sort, canPlayOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Modal isVisible={visible} onBackdropPress={onClose} onBackButtonPress={onClose} onSwipeComplete={onClose}
    style={styles.modal} backdropColor={BRAND.navy} backdropOpacity={0.3} useNativeDriver hideModalContentWhileAnimating
    animationIn={reduced ? 'fadeIn' : 'slideInUp'} animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
    backdropTransitionInTiming={reduced ? 0 : 180} backdropTransitionOutTiming={reduced ? 0 : 180}>
    <View testID="near-me-sheet" style={[styles.sheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <View style={styles.header}>
        <GameIcon name="map" size={26} />
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>NEAR ME{parkName ? ` · ${parkName.toUpperCase()}` : ''}</Text>
        <Pressable testID="near-me-close" accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <GameIcon name="close" size={22} />
        </Pressable>
      </View>
      <View style={styles.controls}>
        <Switch testID="near-me-sort-az" label="A TO Z" on={sort === 'az'} onPress={() => chooseSort('az')} />
        <Switch testID="near-me-sort-distance" label="DISTANCE" on={sort === 'distance'} onPress={() => chooseSort('distance')} />
        <Pressable testID="near-me-can-play" accessibilityRole="button" accessibilityState={{ selected: canPlayOnly }}
          accessibilityLabel="I can play now" hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          onPress={() => { haptic('tapLight'); setCanPlayOnly(on => !on); }}
          style={({ pressed }) => [styles.chip, canPlayOnly && styles.chipOn, pressed && styles.pressed]}>
          <GameIcon name="ticket" size={16} />
          <Text style={[styles.switchText, canPlayOnly && styles.switchTextOn]} maxFontSizeMultiplier={1.3}>I CAN PLAY NOW</Text>
        </Pressable>
      </View>
      <FlatList data={rows} keyExtractor={row => String(row.taskId)} style={styles.list} contentContainerStyle={styles.listBody}
        showsVerticalScrollIndicator={false} initialNumToRender={12}
        renderItem={({ item }) => <Row row={item} tickets={tickets} onPress={() => onPick(item.taskId)} />}
        ListEmptyComponent={<View style={styles.empty}>
          <GameIcon name="ticket" size={34} />
          <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>{canPlayOnly ? 'No coin here fits your Tickets yet' : 'Every coin here is on your shelf!'}</Text>
        </View>} />
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { maxHeight: '82%', backgroundColor: BRAND.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 3,
    borderColor: BRAND.white, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 8, backgroundColor: BRAND.blueBright, minHeight: 56 },
  title: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  switch: { minHeight: 34, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.blueBright, borderBottomWidth: 4 },
  switchOn: { backgroundColor: BRAND.gold, borderColor: BRAND.white, borderBottomColor: BRAND.goldLip },
  switchText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.blueBright },
  switchTextOn: { color: BRAND.navy },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 10, borderRadius: 17,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.blueBright, borderBottomWidth: 4 },
  chipOn: { backgroundColor: BRAND.gold, borderColor: BRAND.white, borderBottomColor: BRAND.goldLip },
  list: { flexGrow: 0 },
  listBody: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  // Every row the same: the house blue card with the white rim (no gold row, no top pick).
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: BRAND.blueBright, borderRadius: 14, borderWidth: 3, borderColor: BRAND.white },
  coin: { width: 44, height: 44 },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  line: { fontFamily: 'Knockout', fontSize: 12, color: '#dff4ff', marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 26 },
  emptyText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, textAlign: 'center' },
});
