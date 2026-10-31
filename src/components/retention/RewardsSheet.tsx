import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { RewardsRow, RewardsRowKey } from '../../services/retention/rewardsModel';
import { newRowKey, rowRung, useShownNewTag } from '../../services/retention/newTag';
import { BRAND, FONT, GameIcon, ICON_SOURCES } from '../../ui';
import { BOX_ART } from '../trail/TrailBoxArt';

const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');
const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const STAMPS = require('../../../assets/images/screens/profile/shortcut_stamp_book.png');

/** Each row's picture: the same art as the reward it opens, so a kid matches it with zero reading. */
function rowArt(key: RewardsRowKey) {
  switch (key) {
    case 'daily_chest': return <Image source={DAILY_CHEST} style={styles.art} contentFit="contain" />;
    case 'daily3': return <Image source={ICON_SOURCES.chest} style={styles.art} contentFit="contain" />;
    case 'level_chest': return <Image source={LEVEL_CHEST} style={styles.art} contentFit="contain" />;
    case 'weekly_box': return <Image source={WEEKLY} style={styles.art} contentFit="contain" />;
    case 'trail': return <Image source={BOX_ART.blue} style={styles.art} contentFit="contain" />;
    case 'stamps': return <Image source={STAMPS} style={styles.art} contentFit="contain" />;
    case 'events': return <GameIcon name="gift" size={46} />;
  }
}

const LABEL = { open: 'OPEN', go: 'SEE', claim_all: 'CLAIM ALL' } as const;

/** The gold NEW pill (the same one as the Pins lanyard card): a feature's first appearance, never a popup. */
export function NewPill({ style }: { readonly style?: object }) {
  return (
    <View style={[styles.newTag, style]} accessible accessibilityLabel="New">
      <Text maxFontSizeMultiplier={1.1} style={styles.newText}>NEW</Text>
    </View>
  );
}

/**
 * The Rewards sheet (core loop blueprint 4.2): everything ready in one list,
 * behind the map's one Rewards button. Each row opens the reward's own reveal
 * (the same chest moments as before); stamps claim in place. Nothing here is
 * for sale and nothing counts down.
 */
export default function RewardsSheet({ rows, flame, empty, busy, note, reducedMotion, enterRows = true, onRow, onClose }: {
  readonly rows: readonly RewardsRow[];
  /** The flame (Daily 3 streak) once Daily 3 is unlocked; null before. */
  readonly flame: number | null;
  /** The closing line when nothing is ready (always a reason to come back). */
  readonly empty: string;
  /** A row that is working (stamps claiming). */
  readonly busy: RewardsRowKey | null;
  /** A short result line ("+5 Tickets from your stamps"). */
  readonly note: string | null;
  readonly reducedMotion: boolean;
  /**
   * Rows drop in as the sheet zooms open. Coming back from a card inside the same sheet (a chest's BACK), they are
   * simply there: a Rewards card with its rows still fading in read as an empty card.
   */
  readonly enterRows?: boolean;
  readonly onRow: (key: RewardsRowKey) => void;
  readonly onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  // Small phones (SE, 667 pt): slimmer rows and a taller list, so five rows show whole with no scroll.
  const compact = height < 720;
  const listMax = Math.max(240, Math.min(height * 0.62, height - 300));
  const ready = rows.some(r => r.ready > 0);
  // A reward rung's first appearance (Daily 3, Trail Boxes, event chests): one NEW pill on its first row. It is
  // marked seen when this sheet closes (or the app goes to the background), so it shows once and clears.
  const has = (rung: string) => rows.some(r => rowRung(r.key) === rung);
  const dailyNew = useShownNewTag('daily', has('daily'));
  const trailNew = useShownNewTag('trail', has('trail'));
  const eventsNew = useShownNewTag('events', has('events'));
  const newKey = newRowKey(rows, dailyNew.isNew ? 'daily' : trailNew.isNew ? 'trail' : eventsNew.isNew ? 'events' : null);
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {flame != null && (
        <View style={styles.flameRow} accessible accessibilityLabel={`${flame} day flame`}>
          <GameIcon name="streak" size={30} />
          <Text style={styles.flameText}>{flame > 0 ? `${flame} day flame` : 'Start a flame with Daily 3'}</Text>
        </View>
      )}
      <ScrollView style={{ maxHeight: listMax }} contentContainerStyle={[styles.rows, compact && styles.rowsCompact]} showsVerticalScrollIndicator={false}>
        {rows.map((row, i) => (
          <Animated.View key={row.key} entering={reducedMotion || !enterRows ? undefined : FadeInDown.delay(40 * i).duration(180)}>
            <Pressable onPress={row.action ? () => onRow(row.key) : undefined} disabled={!row.action || busy === row.key}
              accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.line}`}
              style={({ pressed }) => [styles.row, compact && styles.rowCompact, row.ready > 0 && styles.rowReady, pressed && styles.pressed]}>
              <View style={[styles.artBox, compact && styles.artBoxCompact]}>{rowArt(row.key)}</View>
              <View style={styles.text}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, compact && styles.titleCompact, row.ready > 0 && styles.titleReady, styles.titleText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{row.title}</Text>
                  {newKey === row.key && <NewPill />}
                </View>
                <Text style={[styles.line, compact && styles.lineCompact, row.ready > 0 && styles.lineReady]} numberOfLines={compact ? 1 : 2}
                  adjustsFontSizeToFit={compact} minimumFontScale={0.8}>{row.line}</Text>
              </View>
              {row.action && (
                <View style={[styles.btn, row.ready > 0 ? styles.btnGold : styles.btnPlain]}>
                  <Text style={[styles.btnText, row.ready === 0 && styles.btnTextPlain]}>{busy === row.key ? '...' : LABEL[row.action]}</Text>
                </View>
              )}
              {row.ready > 1 && <View style={styles.count}><Text style={styles.countText}>{row.ready}</Text></View>}
            </Pressable>
          </Animated.View>
        ))}
        {!ready && (
          <View style={styles.empty}>
            <GameIcon name="chestOpen" size={56} />
            <Text style={styles.emptyText}>{empty}</Text>
          </View>
        )}
      </ScrollView>
      {!!note && <Text style={styles.note}>{note}</Text>}
      <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Text style={styles.closeText}>BACK TO MAP</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 12, gap: 8 },
  flameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  flameText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  rows: { gap: 8, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 70, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 6 },
  rowReady: { backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.gold },
  pressed: { transform: [{ translateY: 2 }] },
  rowCompact: { minHeight: 60, paddingVertical: 3 },
  rowsCompact: { gap: 6 },
  cardCompact: { paddingTop: 18, paddingBottom: 10, gap: 6 },
  titleCompact: { fontSize: 17, lineHeight: 21 },
  lineCompact: { fontSize: 15, lineHeight: 18 },
  artBox: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  artBoxCompact: { width: 48, height: 48, transform: [{ scale: 0.88 }] },
  art: { width: 54, height: 54 },
  text: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleText: { flexShrink: 1 },
  newTag: { backgroundColor: BRAND.gold, borderRadius: 999, borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 7, paddingVertical: 1 },
  newText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, paddingTop: 2 },
  title: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  titleReady: { color: BRAND.navy },
  line: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff' },
  lineReady: { color: BRAND.navy },
  btn: { minWidth: 72, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
    borderBottomWidth: 3 },
  btnGold: { backgroundColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  btnPlain: { backgroundColor: BRAND.white, borderBottomColor: '#a9cdea' },
  btnText: { fontFamily: 'Shark', fontSize: 16, color: '#075083' },
  btnTextPlain: { color: BRAND.navy },
  count: { position: 'absolute', top: -6, left: 44, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: BRAND.navy,
    borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  emptyText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, textAlign: 'center' },
  note: { fontFamily: 'Shark', fontSize: 16, color: BRAND.gold, textAlign: 'center' },
  close: { alignSelf: 'stretch', minHeight: 50, backgroundColor: BRAND.white, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 4, borderBottomColor: '#a9cdea' },
  closeText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
});
