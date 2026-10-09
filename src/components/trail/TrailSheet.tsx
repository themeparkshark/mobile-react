import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '../../gamekit/SFX';
import { openAppSettings } from '../../services/external';
import type { MotionAccess } from '../../services/trail/TrailProvider';
import {
  BOX_NAME, bonusLabel, boxFraction, formatDistance, formatSteps, missNote, percent, stepsToGo, usesMiles,
  type TrailBox, type TrailState, type TrailTier,
} from '../../services/trail/trailModel';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, confirmGame, type GameIconName } from '../../ui';
import TrailBoxArt, { STEPS_ART } from './TrailBoxArt';
import TrailPath from './TrailPath';

const KIND_ICON: Record<string, GameIconName> = { coins: 'coins', energy: 'energy', tickets: 'ticket', mystery_box: 'gift', exclusive: 'star' };
const LOCALE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return 'en-US'; } })();

/** What a steps-to-go number last showed, by box id: reopening counts down only the new walk. */
const lastShown = new Map<number, number>();

/**
 * Trail Boxes sheet: the three boxes walking right now (each a path that
 * fills as you walk), the boxes waiting, ready boxes to open, today's walk, an
 * optional weekly goal, how to earn more, the Trail Exclusives you can collect
 * and what is inside every box with its odds. Pictures first, short words.
 */
function TrailSheet({ visible, state, motion, inPark, onClose, onOpen, onFront, onGoal, onWheels, onAskMotion, initialView = 'boxes' }: {
  readonly visible: boolean;
  readonly state: TrailState;
  readonly motion: MotionAccess;
  readonly inPark: boolean;
  readonly onClose: () => void;
  readonly onOpen: (boxes: readonly TrailBox[]) => void;
  readonly onFront: (boxId: number) => void;
  readonly onGoal: (steps: number | null) => void;
  readonly onWheels: (on: boolean) => void;
  readonly onAskMotion: () => void;
  /** Dev previews only. */
  readonly initialView?: 'boxes' | 'inside';
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'boxes' | 'inside'>(initialView);
  const [picked, setPicked] = useState<number | null>(null);
  const miles = usesMiles(LOCALE);
  const note = missNote(state.sync);
  useEffect(() => { if (visible) { setView(initialView); setPicked(null); } }, [visible, initialView]);

  const slots = useMemo(() => {
    const out: (TrailBox | null)[] = Array.from({ length: state.slots }, () => null);
    state.walking.forEach(b => { if (b.slot != null && b.slot < out.length) out[b.slot] = b; });
    return out;
  }, [state.walking, state.slots]);

  const todayBest = !!state.best_day && state.today.steps > 0 && state.best_day.park_day === state.today.park_day;
  const changeGoal = async () => {
    const ok = await confirmGame({ title: 'Change your goal?', message: 'Your steps this week stay. You can pick a new goal or none.',
      confirmLabel: 'Change', cancelLabel: 'Keep it' });
    if (ok) onGoal(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: BRAND.scrim }} />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <View style={styles.badge}><Image source={STEPS_ART} style={{ width: 34, height: 34 }} contentFit="contain" /></View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text accessibilityRole="header" style={styles.title}>{view === 'inside' ? 'What\'s inside' : 'Trail Boxes'}</Text>
            {view === 'inside' ? <Text style={styles.subtitle}>Every box, every chance</Text> : (
              <View style={styles.parkOnly}>
                <GameIcon name="map" size={18} />
                <Text style={styles.parkOnlyText}>Walk in the park to open them</Text>
              </View>
            )}
          </View>
          {view === 'inside'
            ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setView('boxes')} hitSlop={12}><GameIcon name="back" size={32} /></Pressable>
            : <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}><GameIcon name="close" size={32} /></Pressable>}
        </View>

        {view === 'inside' ? <Inside state={state} /> : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            {!inPark && (
              <View style={[styles.card, styles.noteCard]}>
                <Text style={styles.body}><Text style={styles.bold}>YOUR BOXES ARE SAFE. </Text>They wait for your next park day, then walk open as you explore.</Text>
              </View>
            )}
            {motion === 'ask' && (
              <View style={[styles.card, styles.askCard]}>
                <Image source={STEPS_ART} style={{ width: 44, height: 44 }} contentFit="contain" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>Grown-ups: count steps in a pocket?</Text>
                  <Text style={styles.body}>Allow Motion & Fitness and the phone counts steps while the app is closed, so boxes open on their own. Steps stay on this phone.</Text>
                  <GameButton label="Count my steps" size="compact" onPress={onAskMotion} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                </View>
              </View>
            )}
            {motion === 'denied' && (
              <Pressable onPress={openAppSettings} accessibilityRole="button" accessibilityHint="Opens Settings" style={[styles.card, styles.noteCard]}>
                <Text style={styles.body}>Steps count while the map is open. To count them in a pocket too, a grown-up can turn on Motion & Fitness in Settings.</Text>
              </Pressable>
            )}
            {!!note && (
              <View style={[styles.card, styles.noteCard]}>
                <Text style={styles.body}><Text style={styles.bold}>{formatSteps(note.steps)} STEPS NOT COUNTED. </Text>{note.text}</Text>
              </View>
            )}

            {state.ready.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${state.ready.length} ready ${state.ready.length === 1 ? 'box' : 'boxes'}`}
                onPress={() => { playSfx('ui.confirm'); onOpen(state.ready); }} style={[styles.card, styles.readyCard]}>
                <View style={{ flexDirection: 'row', marginRight: 8 }}>
                  {state.ready.slice(0, 3).map((b, i) => (
                    <View key={b.id} style={{ marginLeft: i ? -30 : 0 }}><TrailBoxArt tier={b.tier} size={56} ready={i === 0} active={visible} /></View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.readyTitle} numberOfLines={1} adjustsFontSizeToFit>{state.ready.length === 1 ? 'Ready!' : `${state.ready.length} ready!`}</Text>
                  <Text style={[styles.body, { color: BRAND.navy }]}>You walked {state.ready.length === 1 ? 'it' : 'them'} open.</Text>
                </View>
                <View style={styles.openChip}><Text style={styles.openChipText}>OPEN</Text></View>
              </Pressable>
            )}

            <Text style={styles.section}>{inPark ? 'Walking now' : 'Ready to walk'}</Text>
            <View style={styles.slots}>
              {slots.map((b, i) => (
                <View key={b ? b.id : `empty-${i}`} style={[styles.slot, !b && styles.slotEmpty]} accessible
                  accessibilityLabel={b ? `${BOX_NAME[b.tier]}: ${formatSteps(stepsToGo(b))} steps to go` : 'Empty spot. Win rides to earn boxes'}>
                  {b ? (
                    <>
                      <TrailBoxArt tier={b.tier} size={74} fraction={boxFraction(b)} active={visible} />
                      <View style={{ width: '100%', marginTop: 4 }}><TrailPath fraction={boxFraction(b)} height={12} seenKey={`b${b.id}`} /></View>
                      <StepsToGo box={b} visible={visible} />
                      <Text style={styles.toGoUnit}>steps to go</Text>
                    </>
                  ) : (
                    <>
                      <TrailBoxArt tier="blue" size={60} dim active={false} />
                      <Text style={[styles.toGoUnit, { marginTop: 8, textAlign: 'center' }]}>Empty spot</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.footnote}>Every step counts for all three boxes at once.</Text>

            {state.waiting.length > 0 && (
              <>
                <Text style={styles.section}>Next up ({state.waiting.length} of {state.rack})</Text>
                <View style={[styles.card, { paddingVertical: 6 }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {state.waiting.map((b, i) => (
                      <Pressable key={b.id} accessibilityRole="button"
                        accessibilityLabel={`${BOX_NAME[b.tier]}, ${formatSteps(b.goal_steps)} steps.${i > 0 ? ' Tap to walk it next' : ' Walks next'}`}
                        onPress={() => { playSfx('ui.select'); setPicked(picked === b.id ? null : b.id); }}
                        style={[styles.waitBox, picked === b.id && styles.waitPicked]}>
                        <TrailBoxArt tier={b.tier} size={52} active={false} />
                        <Text style={styles.waitText}>{formatSteps(b.goal_steps)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {picked != null && state.waiting[0]?.id !== picked && (
                    <GameButton label="Walk this one next" size="compact" variant="secondary" onPress={() => { onFront(picked); setPicked(null); }}
                      style={{ alignSelf: 'center', marginTop: 4 }} />
                  )}
                  {picked != null && state.waiting[0]?.id === picked && <Text style={[styles.footnote, { textAlign: 'center' }]}>This one walks next.</Text>}
                </View>
              </>
            )}

            <Text style={styles.section}>{inPark ? 'Today at the park' : 'Your walking'}</Text>
            <View style={[styles.card, styles.todayCard]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bigNumber}>{formatSteps(inPark ? state.today.steps : state.lifetime.steps)}</Text>
                <Text style={styles.body}>{inPark
                  ? `park steps today${state.today.meters > 0 ? `, about ${formatDistance(state.today.meters, miles)}` : ''}`
                  : `park steps in all, about ${formatDistance(state.lifetime.meters, miles)}`}</Text>
              </View>
              {inPark && todayBest ? (
                <View style={styles.bestBadge}><GameIcon name="trophy" size={30} /><Text style={styles.bestText}>New best!</Text></View>
              ) : state.best_day ? (
                <View style={styles.bestQuiet}><Text style={styles.bestLabel}>Best day</Text><Text style={styles.bestNum}>{formatSteps(state.best_day.steps)}</Text></View>
              ) : null}
            </View>
            {inPark && state.today.steps >= 5000 && <Text style={styles.cheer}>{cheer(state.today.steps)}</Text>}

            <Text style={styles.section}>Weekly goal</Text>
            {state.week.goal_steps ? (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.cardTitle}>{state.week.goal_hit ? 'Goal reached!' : `${formatSteps(state.week.steps)} of ${formatSteps(state.week.goal_steps)}`}</Text>
                  <Pressable onPress={() => void changeGoal()} accessibilityRole="button" accessibilityLabel="Change your weekly goal" style={styles.smallChip}>
                    <Text style={styles.smallChipText}>CHANGE</Text>
                  </Pressable>
                </View>
                <View style={{ marginTop: 6 }}><TrailPath fraction={Math.min(1, state.week.steps / state.week.goal_steps)} ready={state.week.goal_hit} height={14} seenKey="week" /></View>
                <Text style={styles.footnote}>{state.week.goal_hit ? 'You earned a Blue Box this week. Nice walking!' : 'Reach it this week (Monday to Sunday) for a Blue Box.'}</Text>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.body}>Pick a goal if you like. Reach it in a week for a Blue Box.</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {state.week.goal_options.map(g => (
                    <Pressable key={g} accessibilityRole="button" accessibilityLabel={`${formatSteps(g)} steps a week`}
                      onPress={() => { playSfx('ui.select'); onGoal(g); }} style={styles.goalChip}>
                      <Text style={styles.goalChipText}>{g >= 1000 ? `${g / 1000}k` : g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.section}>Get more boxes</Text>
            <View style={styles.card}>
              <EarnRow icon="map" text="Arrive at a park" sub="A Blue Box each park day" />
              <EarnRow icon="ride" text="Win 2 ride challenges" sub={state.next_ride_box != null && inPark
                ? `Next box in ${state.next_ride_box} ${state.next_ride_box === 1 ? 'win' : 'wins'}` : 'Up to 3 boxes a day'} />
              <EarnRow icon="star" text="Reach your weekly goal" sub="A Blue Box" last />
            </View>

            {!!state.exclusives?.length && <Exclusives items={state.exclusives} />}

            <Pressable onPress={() => { playSfx('ui.select'); onWheels(!state.wheels); }} accessibilityRole="switch"
              accessibilityState={{ checked: state.wheels }} accessibilityLabel="Rolling with wheels: count a gentle pace while the app is closed"
              style={[styles.card, styles.rowCard]}>
              <GameIcon name="ride" size={30} />
              <Text style={[styles.body, { flex: 1 }]}>Rolling in a wheelchair, scooter or stroller? Count a gentle pace while the app is closed.</Text>
              <View style={[styles.toggle, state.wheels && styles.toggleOn]}>
                <View style={[styles.knob, state.wheels && styles.knobOn]} />
              </View>
            </Pressable>

            <GameButton label="What's inside?" variant="secondary" icon="info" onPress={() => { playSfx('ui.tap'); setView('inside'); }}
              style={{ marginTop: 14, alignSelf: 'center' }} />
            <Text style={[styles.footnote, { textAlign: 'center' }]}>Boxes never expire. They wait for your next park day.</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default memo(TrailSheet);

/** Steps to go, counting down from what you saw last time (Pikmin Bloom style), never up. */
function StepsToGo({ box, visible }: { readonly box: TrailBox; readonly visible: boolean }) {
  const target = stepsToGo(box);
  const from = lastShown.get(box.id);
  const [shown, setShown] = useState(from != null && from > target ? from : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!visible) return undefined;
    const start = lastShown.get(box.id);
    lastShown.set(box.id, target);
    if (start == null || start <= target) { setShown(target); return undefined; }
    const t0 = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setShown(Math.round(start - (start - target) * (1 - (1 - k) ** 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [box.id, target, visible]);
  return <Text style={styles.toGo} numberOfLines={1} adjustsFontSizeToFit>{formatSteps(shown)}</Text>;
}

function cheer(steps: number): string {
  if (steps >= 15000) return 'What a park day! Look at you go.';
  if (steps >= 10000) return 'Ten thousand steps! Amazing.';
  return 'Great walking today!';
}

function EarnRow({ icon, text, sub, last }: { readonly icon: GameIconName; readonly text: string; readonly sub: string; readonly last?: boolean }) {
  return (
    <View style={[styles.earnRow, !last && styles.earnDivider]} accessible accessibilityLabel={`${text}. ${sub}`}>
      <View style={styles.earnIcon}><GameIcon name={icon} size={28} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.earnText}>{text}</Text>
        <Text style={styles.earnSub}>{sub}</Text>
      </View>
    </View>
  );
}

function Exclusives({ items }: { readonly items: NonNullable<TrailState['exclusives']> }) {
  const have = items.filter(i => i.owned).length;
  return (
    <>
      <Text style={styles.section}>Trail Exclusives ({have} of {items.length})</Text>
      <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
        {items.map(i => (
          <View key={i.item_id} style={{ alignItems: 'center', width: 72 }} accessible accessibilityLabel={`${i.name}${i.owned ? ', you have it' : ', not found yet'}`}>
            <View style={[styles.exWell, i.owned && styles.exWellOwned]}>
              {i.icon_url ? <Image source={{ uri: i.icon_url }} style={{ width: 48, height: 48, opacity: i.owned ? 1 : 0.25 }}
                tintColor={i.owned ? undefined : BRAND.navy} contentFit="contain" /> : <GameIcon name="star" size={36} />}
            </View>
            <Text style={styles.exName} numberOfLines={2}>{i.owned ? i.name : '?'}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>Only in Red and Gold Trail Boxes. Wear them to show you walk the parks.</Text>
    </>
  );
}

function Inside({ state }: { readonly state: TrailState }) {
  const tiers = state.odds.tiers;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
      <Text style={styles.section}>Which box you get</Text>
      <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
        {tiers.map(t => (
          <View key={t.tier} style={{ alignItems: 'center' }} accessible accessibilityLabel={`${BOX_NAME[t.tier]}: ${percent(t.chance_bp)}`}>
            <TrailBoxArt tier={t.tier} size={64} active={false} />
            <Text style={styles.oddsPct}>{percent(t.chance_bp)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>Arriving at the park always gives a Blue Box. A Gold Box is sure to come by your {state.odds.gold_pity}th box{state.gold_in > 1 ? ` (in ${state.gold_in} or less)` : ' (your next one!)'}.</Text>
      {tiers.map(t => <TierCard key={t.tier} tier={t.tier} t={t} />)}
    </ScrollView>
  );
}

function TierCard({ tier, t }: { readonly tier: TrailTier; readonly t: TrailState['odds']['tiers'][number] }) {
  return (
    <View style={[styles.card, { marginTop: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TrailBoxArt tier={tier} size={56} active={false} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.cardTitle}>{BOX_NAME[tier]}</Text>
          <Text style={styles.body}>Opens after {formatSteps(t.goal_steps)} steps</Text>
        </View>
      </View>
      <OddsRow icon="coins" label={`${formatSteps(t.coins)} Coins`} pct="Always" />
      {t.always.map((a, i) => <OddsRow key={`a${i}`} icon={KIND_ICON[a.kind]} label={bonusLabel(a.kind, a.amount)} pct="Always" />)}
      <Text style={[styles.earnSub, { marginTop: 6 }]}>Plus one of these:</Text>
      {t.bonus.map((b, i) => <OddsRow key={i} icon={KIND_ICON[b.kind]} label={bonusLabel(b.kind, b.amount)} pct={percent(b.chance_bp)} />)}
    </View>
  );
}

function OddsRow({ icon, label, pct }: { readonly icon: GameIconName; readonly label: string; readonly pct: string }) {
  return (
    <View style={styles.oddsRow} accessible accessibilityLabel={`${label}: ${pct}`}>
      <GameIcon name={icon} size={24} />
      <Text style={[styles.body, { flex: 1, marginLeft: 8 }]}>{label}</Text>
      <Text style={styles.oddsVal}>{pct}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '90%', backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, paddingTop: 14, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: { width: 50, height: 50, borderRadius: 25, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: BRAND.white },
  title: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, textTransform: 'uppercase' },
  subtitle: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  parkOnly: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  parkOnlyText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  section: { fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  card: { backgroundColor: BRAND.white, borderRadius: RADIUS.lg, borderWidth: 2.5, borderColor: BRAND.sky, padding: 12 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  askCard: { flexDirection: 'row', borderColor: BRAND.skyDeep, marginBottom: 8 },
  noteCard: { backgroundColor: BRAND.sky, borderColor: BRAND.sky, marginBottom: 8 },
  readyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.goldLight, borderColor: BRAND.navy, borderWidth: 3, ...SHADOW.card },
  readyTitle: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textTransform: 'uppercase' },
  openChip: { backgroundColor: BRAND.blueBright, borderRadius: RADIUS.pill, borderWidth: 2.5, borderColor: BRAND.white, paddingHorizontal: 14, paddingVertical: 8 },
  openChipText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  cardTitle: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textTransform: 'uppercase' },
  body: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 21, color: BRAND.navySoft },
  bold: { fontFamily: 'Shark', color: BRAND.navy },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, backgroundColor: BRAND.white, borderRadius: RADIUS.lg, borderWidth: 2.5, borderColor: BRAND.sky,
    alignItems: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10 },
  slotEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: BRAND.skyDeep, justifyContent: 'center', minHeight: 160 },
  toGo: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, marginTop: 2 },
  toGoUnit: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft, marginTop: -2 },
  footnote: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, marginTop: 6 },
  waitBox: { width: 70, alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 2.5, borderColor: 'transparent', paddingVertical: 4 },
  waitPicked: { borderColor: BRAND.gold, backgroundColor: BRAND.cream },
  waitText: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  todayCard: { flexDirection: 'row', alignItems: 'center' },
  bigNumber: { fontFamily: 'Shark', fontSize: 36, color: BRAND.blue },
  bestBadge: { alignItems: 'center', backgroundColor: BRAND.goldLight, borderRadius: RADIUS.md, borderWidth: 3, borderColor: BRAND.navy, padding: 6 },
  bestText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, textTransform: 'uppercase' },
  bestQuiet: { alignItems: 'flex-end' },
  bestLabel: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  bestNum: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  cheer: { fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, marginTop: 6, textAlign: 'center', textTransform: 'uppercase' },
  smallChip: { minHeight: 44, minWidth: 88, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: BRAND.sky,
    borderWidth: 2, borderColor: BRAND.skyDeep, alignItems: 'center', justifyContent: 'center' },
  smallChipText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  goalChip: { flex: 1, height: 44, borderRadius: RADIUS.pill, backgroundColor: BRAND.blueBright, borderWidth: 2.5, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  goalChipText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  earnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  earnDivider: { borderBottomWidth: 1.5, borderBottomColor: BRAND.sky },
  earnIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  earnText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, textTransform: 'uppercase' },
  earnSub: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  exWell: { width: 60, height: 60, borderRadius: 16, backgroundColor: BRAND.sky, borderWidth: 2.5, borderColor: BRAND.skyDeep,
    alignItems: 'center', justifyContent: 'center' },
  exWellOwned: { backgroundColor: BRAND.goldLight, borderColor: BRAND.navy },
  exName: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.navy, textAlign: 'center', marginTop: 4 },
  toggle: { width: 56, height: 32, borderRadius: 16, backgroundColor: BRAND.sky, borderWidth: 2.5, borderColor: BRAND.navy, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: BRAND.gold },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.navy },
  knobOn: { alignSelf: 'flex-end' },
  oddsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  oddsVal: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  oddsPct: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 2 },
});
