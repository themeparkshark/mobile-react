/**
 * Park Sets: pins you can only get by going to the park. A set is a cork pin
 * board, like the boards at the parks: your pins pinned on it, the rest as
 * silhouettes. The gold seal means "earned at the park, never traded".
 * Rare pins wear a small RARE ribbon (they hide on fewer days). The reward for
 * finishing is shown up front, and pays once.
 *
 * Pin of the Day: each park shows today's state on its board: a pin hiding
 * (gold, pulsing), caught, or no pin today. At the park, Hunt opens the
 * warmer/colder hunt (HuntSheet).
 */
import { useAmbient } from '../../services/money/useAmbient';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import { PIN_ART, PinTile } from './PinArt';
import { foundLabel, packPace, seasonLabel, type ParkSet, type PinDay, type PinRow } from './pinsModel';

const CORK = require('../../../assets/images/screens/pin-swaps/corkboard.png');


function TodayChip({ day, still, onHunt }: { day: PinDay; still: boolean; onHunt?: () => void }) {
  const pulse = useSharedValue(0);
  const ambient = useAmbient();
  useEffect(() => {
    if (day.status === 'hunt' && !still && ambient) pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
    else { cancelAnimation(pulse); pulse.value = 0; }
    return () => cancelAnimation(pulse);
  }, [day.status, still, ambient, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.05 }] }));
  if (day.status === 'none') {
    return (
      <View style={[styles.today, styles.todayNone]} accessible accessibilityLabel="No pin hiding here today. Check back tomorrow">
        <Text maxFontSizeMultiplier={1.1} style={[styles.todayText, { color: BRAND.navySoft }]}>No pin today</Text>
      </View>
    );
  }
  if (day.status === 'caught') {
    return (
      <View style={[styles.today, styles.todayCaught]} accessible accessibilityLabel="You caught today's pin">
        <GameIcon name="check" size={18} />
        <Text maxFontSizeMultiplier={1.1} style={[styles.todayText, { color: BRAND.white }]}>Caught today!</Text>
      </View>
    );
  }
  if (!day.here) {
    // Away from the park: a plain note (not a button) that today is a pin day there.
    return (
      <View style={[styles.today, styles.todayAway]} accessible accessibilityLabel="A pin is hiding in this park today">
        <Image source={PIN_ART.seal} style={{ width: 20, height: 20 }} contentFit="contain" />
        <Text maxFontSizeMultiplier={1.1} style={[styles.todayText, { color: BRAND.navy }]}>Pin day today</Text>
      </View>
    );
  }
  return (
    <Animated.View style={style}>
      <Pressable onPress={onHunt} disabled={!onHunt} hitSlop={6} style={[styles.today, styles.todayHunt, { minHeight: 44 }]} accessibilityRole={onHunt ? 'button' : 'text'}
        accessibilityLabel={day.here ? 'A pin is hiding in this park today. Hunt for it' : 'A pin is hiding in this park today'}>
        <Image source={PIN_ART.seal} style={{ width: 22, height: 22 }} contentFit="contain" />
        <Text maxFontSizeMultiplier={1.1} style={[styles.todayText, { color: BRAND.navy }]}>{day.here ? 'Hunt today’s pin!' : 'Pin hiding today'}</Text>
        {day.here && <GameIcon name="search" size={18} />}
      </Pressable>
    </Animated.View>
  );
}

type Props = {
  readonly set: ParkSet;
  readonly today?: PinDay;
  readonly busy: boolean;
  readonly still: boolean;
  readonly shine?: SharedValue<number>;
  readonly onClaim: (set: ParkSet) => void;
  readonly onPin: (set: ParkSet, pin: PinRow) => void;
  readonly onHunt?: (set: ParkSet) => void;
};

function ParkSetCardBase({ set, today, busy, still, shine, onClaim, onPin, onHunt }: Props) {
  // A tap on a pin shows a little bubble (no dialogs on a collection page).
  const [tip, setTip] = useState<{ index: number; text: string } | null>(null);
  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(null), 2200); return () => clearTimeout(t); }, [tip]);
  const season = seasonLabel(set);
  // Park time (the server's day), so the count changes at the park's midnight.
  const pace = packPace(set, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }));
  const pinSize = set.reward.completer ? 48 : 56;
  return (
    <View style={[styles.card, SHADOW.card, set.complete && styles.cardDone]}>
      <View style={styles.head}>
        <Image source={PIN_ART.seal} style={styles.seal} contentFit="contain" accessibilityLabel="Earned at the park" />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={1}>{set.name}</Text>
          <View style={styles.subRow}>
            <View style={styles.progress} accessible accessibilityLabel={`${set.have} of ${set.total} pins`}>
              {Array.from({ length: set.total }, (_, i) => (
                <View key={i} style={[styles.dot, i < set.have && styles.dotOn]} />
              ))}
              <Text maxFontSizeMultiplier={1.1} style={styles.count}>{set.have}/{set.total}</Text>
            </View>
            {season && <View style={styles.season}><Text maxFontSizeMultiplier={1.1} style={styles.seasonText}>{season}</Text></View>}
          </View>
          {pace && <Text maxFontSizeMultiplier={1.2} style={styles.pace} numberOfLines={1}>{pace}</Text>}
        </View>
      </View>

      <ImageBackground source={CORK} resizeMode="cover" style={styles.cork} imageStyle={styles.corkImage}>
        <View style={styles.pins}>
          {set.pins.map((p, i) => {
            const rare = p.rarity === 'rare';
            return (
              <Pressable key={p.item_id} onPress={() => {
                onPin(set, p);
                setTip({ index: i, text: p.owned ? (foundLabel(p.found) ?? 'Yours! Park only') : rare ? `Rare! At ${set.park_name ?? 'the park'}` : `At ${set.park_name ?? 'the park'}` });
              }} hitSlop={4} style={styles.slot}
                accessibilityRole="button" accessibilityLabel={p.owned ? `${p.name}, you have it${rare ? ', rare' : ''}` : `Missing pin${rare ? ', rare' : ''}. Find it at ${set.park_name ?? 'the park'}`}>
                <PinTile uri={p.icon_url} size={pinSize} owned={p.owned} kind={p.kind} tradable={false} badge={false}
                  tilt={((i * 37) % 13) - 6} flat surface="board" />
                {rare && <View style={styles.rare}><Text maxFontSizeMultiplier={1} style={styles.rareText}>RARE</Text></View>}
                {tip?.index === i && (
                  <View style={styles.tip} pointerEvents="none"><Text maxFontSizeMultiplier={1.35} style={styles.tipText} numberOfLines={1}>{tip.text}</Text></View>
                )}
              </Pressable>
            );
          })}
          {set.reward.completer && (
            <View style={styles.prizeSlot} accessible accessibilityLabel={set.reward.completer.owned ? 'Completer pin won' : 'Finish the set to win this Completer pin'}>
              <PinTile uri={set.reward.completer.icon_url} size={58} owned={set.reward.completer.owned} kind="park" tradable={false} badge={false} flat />
              {!set.reward.completer.owned && <View style={styles.prizeTag}><Text maxFontSizeMultiplier={1} style={styles.rareText}>PRIZE</Text></View>}
            </View>
          )}
        </View>
      </ImageBackground>

      <View style={styles.foot}>
        {today ? <TodayChip day={today} still={still} onHunt={today.here && onHunt ? () => onHunt(set) : undefined} /> : <View />}
        {set.claimed ? (
          <View style={styles.claimed} accessible accessibilityLabel="Set finished. Reward collected">
            <GameIcon name="check" size={20} /><Text maxFontSizeMultiplier={1.1} style={styles.claimedText}>Done</Text>
          </View>
        ) : set.complete ? (
          <GameButton size="compact" label="Get reward" icon="gift" loading={busy} disabled={busy} onPress={() => onClaim(set)} />
        ) : (
          <View style={styles.reward} accessible accessibilityLabel={`Finish it for ${set.reward.coins} coins and ${set.reward.boxes} free mystery box`}>
            <Text maxFontSizeMultiplier={1.1} style={styles.rewardLead}>Finish:</Text>
            <GameIcon name="coins" size={20} /><Text maxFontSizeMultiplier={1.1} style={styles.rewardNum}>{set.reward.coins}</Text>
            {set.reward.boxes > 0 && <><GameIcon name="gift" size={20} /><Text maxFontSizeMultiplier={1.1} style={styles.rewardNum}>{set.reward.boxes}</Text></>}
          </View>
        )}
      </View>
    </View>
  );
}

export const ParkSetCard = memo(ParkSetCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.cream, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy, overflow: 'hidden' },
  cardDone: { borderColor: BRAND.goldLip },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: 6 },
  seal: { width: 44, height: 44 },
  name: { fontFamily: FONT.display, fontSize: 24, color: BRAND.navy, paddingTop: 3 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: BRAND.navy, backgroundColor: BRAND.white },
  dotOn: { backgroundColor: BRAND.gold },
  count: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, marginLeft: 4, paddingTop: 2 },
  pace: { fontFamily: FONT.body, fontSize: 13, color: BRAND.navy, opacity: 0.8, marginTop: 2 },
  season: { backgroundColor: BRAND.red, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  seasonText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, paddingTop: 2 },
  cork: { marginHorizontal: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 3, borderColor: '#8a5a2b', overflow: 'hidden' },
  corkImage: { borderRadius: RADIUS.md - 3 },
  pins: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 2 },
  prizeSlot: { alignItems: 'center', paddingLeft: 6, marginLeft: 2, borderLeftWidth: 2, borderLeftColor: 'rgba(138,90,43,0.5)', borderStyle: 'dashed' },
  prizeTag: { position: 'absolute', bottom: -8, backgroundColor: BRAND.blueBright, borderColor: BRAND.white, borderWidth: 2, borderRadius: 6, paddingHorizontal: 5 },
  slot: { alignItems: 'center', minWidth: 48, minHeight: 60 },
  rare: { position: 'absolute', bottom: -8, backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 2, borderRadius: 6, paddingHorizontal: 5 },
  tip: { position: 'absolute', top: -30, alignSelf: 'center', backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, zIndex: 5, minWidth: 90, alignItems: 'center' },
  tipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, paddingTop: 2 },
  rareText: { fontFamily: FONT.display, fontSize: 11, color: BRAND.navy, paddingTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.sm, minHeight: 56 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 5 },
  todayHunt: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  todayNone: { backgroundColor: BRAND.white, borderColor: '#c4d3e6' },
  todayAway: { backgroundColor: '#fff1c2', borderColor: BRAND.goldLip, borderStyle: 'dashed' },
  todayCaught: { backgroundColor: BRAND.green, borderColor: BRAND.white },
  todayText: { fontFamily: FONT.display, fontSize: 15, paddingTop: 2 },
  claimed: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  claimedText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.green, paddingTop: 2 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardLead: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft, marginRight: 2 },
  rewardNum: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2, marginRight: 4 },
});
