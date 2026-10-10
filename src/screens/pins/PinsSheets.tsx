/**
 * Small sheets on the Pins page:
 * - PickSheet: spend 5 trader points on a missing pin of a series (dupes always count).
 * - PinsHelp: the "?" in pictures: four tiles, two words each.
 */
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, FONT, GameButton, OUTLINE, RADIUS, SPACE } from '../../ui';
import { BOX_ART, PIN_ART, PinTile } from './PinArt';
import type { MysterySeries, PinRow } from './pinsModel';

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.lg }]}>{children}</View>
    </Modal>
  );
}

export function PickSheet({ series, busy, onPick, onClose }: { series: MysterySeries; busy: boolean; onPick: (pin: PinRow) => void; onClose: () => void }) {
  const missing = series.pins.filter(p => !p.is_chaser && !p.owned);
  return (
    <Sheet onClose={onClose}>
      <Image source={PIN_ART.trade} style={styles.topIcon} contentFit="contain" />
      <Text maxFontSizeMultiplier={1.35} style={styles.title}>Pick a pin!</Text>
      <Text maxFontSizeMultiplier={1.35} style={styles.sub}>Your extras pay for it.</Text>
      <View style={styles.grid}>
        {missing.map((p, i) => (
          <Pressable key={p.item_id} disabled={busy} onPress={() => onPick(p)} style={({ pressed }) => [styles.cell, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityRole="button" accessibilityLabel={`Pick ${p.name}`}>
            <PinTile uri={p.icon_url} size={72} owned kind={p.kind} tradable badge={false} tilt={((i * 29) % 9) - 4} flat />
            <Text maxFontSizeMultiplier={1.1} style={styles.cellName} numberOfLines={1}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
      <GameButton variant="ghost" label="Not now" onPress={onClose} />
    </Sheet>
  );
}

const HELP = [
  { art: BOX_ART.blue.closed, word: 'Open boxes', line: 'Each has 1 pin.' },
  { art: PIN_ART.chaser, word: 'Gold chaser', line: 'Rare! By box 20 for sure.' },
  { art: PIN_ART.seal, word: 'Park only', line: 'Found at the park.' },
  { art: PIN_ART.trade, word: 'Can trade', line: 'Swap extras.' },
] as const;

/** Shown in help only when the Golden Box is on for this player. */
export const GOLDEN_HELP = 'Golden Box: 900 coins, one at a time. Gold chaser 1 in 4 (1 in 14 once you have it). Only pins you need. Shares the box-20 guarantee. Best value for the chaser is the regular box.';

export function PinsHelp({ onClose, golden = false }: { onClose: () => void; golden?: boolean }) {
  return (
    <Sheet onClose={onClose}>
      <Text maxFontSizeMultiplier={1.35} style={[styles.title, { marginTop: SPACE.sm }]}>Pins</Text>
      <View style={styles.help}>
        {HELP.map(h => (
          <View key={h.word} style={styles.helpTile} accessible accessibilityLabel={`${h.word}. ${h.line}`}>
            <Image source={h.art} style={{ width: 64, height: 64 }} contentFit="contain" />
            <Text maxFontSizeMultiplier={1.3} style={styles.helpWord}>{h.word}</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.helpLine}>{h.line}</Text>
          </View>
        ))}
      </View>
      {golden && (
        <View style={styles.goldenHelp} accessible accessibilityLabel={GOLDEN_HELP}>
          <Image source={BOX_ART.gold.closed} style={{ width: 48, height: 48 }} contentFit="contain" />
          <Text maxFontSizeMultiplier={1.3} style={[styles.helpLine, { flex: 1, textAlign: 'left' }]}>{GOLDEN_HELP}</Text>
        </View>
      )}
      <GameButton label="Got it" icon="check" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  goldenHelp: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff1c2', borderRadius: 14, borderWidth: 2, borderColor: '#d99a00', padding: 10, marginBottom: 12 },
  scrim: { flex: 1, backgroundColor: BRAND.scrim },
  sheet: {
    backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: OUTLINE.heavy,
    borderColor: BRAND.navy, borderBottomWidth: 0, alignItems: 'center', paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, gap: SPACE.sm,
  },
  topIcon: { width: 64, height: 64, marginTop: -48 },
  title: { fontFamily: FONT.display, fontSize: 30, color: BRAND.navy, paddingTop: 4 },
  sub: { fontFamily: FONT.body, fontSize: 18, color: BRAND.navySoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginVertical: SPACE.sm },
  cell: { width: 100, alignItems: 'center', gap: 4, padding: 8, borderRadius: RADIUS.md, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white, minHeight: 44 },
  cellName: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  help: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: SPACE.sm },
  helpTile: { width: 150, alignItems: 'center', gap: 2, padding: 10, borderRadius: RADIUS.md, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white },
  helpWord: { fontFamily: FONT.display, fontSize: 19, color: BRAND.navy, paddingTop: 3 },
  helpLine: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft, textAlign: 'center' },
});
