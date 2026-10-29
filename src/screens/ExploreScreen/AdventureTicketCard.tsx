import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdventureTicket, TripGoalData } from '../../api/endpoints/me/trip-goal';
import { playSfx } from '../../gamekit/SFX';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameButton, GameIcon, SHADOW } from '../../ui';
import { NATIVE_SETTLE_MS, useNativeModalLayer } from '../../ui/modalLayers';
import {
  adventureErrorMessage, adventurePrompt, adventureStamps, adventureTicketsLine, detourDetail, type DetourPick,
} from './adventureTicketPresentation';
import MapSuggestionStub from './MapSuggestionStub';
import { LINEPLAY_ICON } from '../../components/guide/linePlayIcon';

const COIN_FALLBACK = require('../../../assets/images/coingold.png');
const FINN = require('../../../assets/images/screens/pin-collections/shark.png');

interface Props {
  ticket: AdventureTicket;
  data: TripGoalData;
  closed: boolean;
  stale: boolean;
  top: number;
  /** Another suggestion leads: show only the 56pt stub (coin plus stamp count); tapping opens the ticket. */
  collapsed?: boolean;
  /** Distance to the ticket ride's queue; Play opens only in its line. */
  gate?: { state: 'near' | 'far' | 'unknown'; meters: number | null };
  /** Ranked detour rides (rankDetours): open first, nearest, shortest wait, top 3. */
  detours?: readonly DetourPick[];
  /** Stamps earned since the player last looked at the map, for the slam moment. */
  slam?: readonly number[];
  onSlamDone?: () => void;
  onDiscover: () => void;
  onPlay: () => Promise<void>;
  onFindLine?: () => void;
  onShelf: () => void;
  /** Adventure-only ride change (PUT /me/adventure-ticket); the trip goal stays. */
  onSelect: (taskId: number) => Promise<unknown>;
  onDismiss?: () => Promise<unknown>;
  onCelebrate: () => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onOcclusionChange?: (visible: boolean) => void;
  /**
   * The Next Coin guide card is the ticket's frame on the map (core loop 4.1): no chip of its own,
   * only the sheet (stamps, souvenir), opened whenever openRequest changes.
   */
  sheetOnly?: boolean;
  openRequest?: number;
  /** The guide card's UNFOLD: open the sheet and unfold the souvenir once it is up (whenever this changes). */
  celebrateRequest?: number;
  /** Line Tickets exist (queue_tickets on): only then may the sheet say a wait earns a Ticket. */
  queueTicketsOn?: boolean;
  /** Dev preview only: start with the sheet (or the detour picker) open. */
  initialOpen?: boolean;
  initialPicker?: boolean;
}

const POP = { damping: 9, stiffness: 320, mass: 0.7 };

/**
 * One punch on the ticket. Earned stamps stay legible when still; a newly
 * confirmed stamp winds up, slams in with an overshoot and settles, rotating
 * like an ink stamp. Reduced motion shows the punched state at once.
 */
export function Punch({ earned, number, reduced }: { earned: boolean; number: number; reduced: boolean }) {
  const scale = useSharedValue(1), tilt = useSharedValue(0);
  const previous = useRef(earned);
  useEffect(() => {
    if (earned && !previous.current && !reduced) {
      scale.value = withSequence(withTiming(1.28, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(0.86, { duration: 70 }), withSpring(1, POP));
      tilt.value = withSequence(withTiming(-10, { duration: 90 }), withSpring(0, POP));
    } else { scale.value = 1; tilt.value = 0; }
    previous.current = earned;
  }, [earned, reduced, scale, tilt]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }] }));
  return <Animated.View style={[styles.punch, earned && styles.punched, style]}>
    {earned ? <GameIcon name="check" size={22} accessibilityLabel="Stamped" />
      : <Text style={styles.punchText}>{number}</Text>}
  </Animated.View>;
}

/**
 * A stamp dot on the folded chip. When `slam` is set, a coin drops onto it,
 * the dot squashes and an ink ring bursts: haptic and sound land on the impact
 * frame. Reduced motion: the dot fills and the haptic still confirms it.
 */
export function StampDot({ earned, slam, reduced, coin, onDone }: {
  earned: boolean; slam: boolean; reduced: boolean; coin: number | { uri: string }; onDone?: () => void;
}) {
  const drop = useSharedValue(slam && !reduced ? 0 : 1), squash = useSharedValue(1), ink = useSharedValue(0);
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    if (!slam) return;
    if (reduced) {
      haptic('success');
      const timer = setTimeout(() => done.current?.(), 0);
      return () => clearTimeout(timer);
    }
    drop.value = 0; ink.value = 0;
    drop.value = withDelay(120, withTiming(1, { duration: 300, easing: Easing.in(Easing.quad) }));
    squash.value = withDelay(420, withSequence(withTiming(0.6, { duration: 60 }), withSpring(1, POP)));
    ink.value = withDelay(420, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    // Impact frame: the coin touches the dot 420ms in.
    const impact = setTimeout(() => { haptic('success'); playSfx('coin', 0.8); }, 420);
    const finish = setTimeout(() => done.current?.(), 950);
    return () => { clearTimeout(impact); clearTimeout(finish); };
  }, [slam, reduced, drop, squash, ink]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 2 - squash.value }, { scaleY: squash.value }] }));
  const coinStyle = useAnimatedStyle(() => ({
    opacity: drop.value < 1 ? 1 : 0,
    transform: [{ translateY: (drop.value - 1) * 90 }, { scale: 1.6 - drop.value * 0.9 }, { rotate: `${(1 - drop.value) * 200}deg` }],
  }));
  const inkStyle = useAnimatedStyle(() => ({ opacity: ink.value > 0 && ink.value < 1 ? 0.85 * (1 - ink.value) : 0,
    transform: [{ scale: 0.4 + ink.value * 2.2 }] }));
  return <View style={styles.dotWrap}>
    {slam && !reduced && <Animated.View pointerEvents="none" style={[styles.ink, inkStyle]} />}
    <Animated.View style={[styles.dot, earned && styles.dotEarned, dotStyle]} />
    {slam && !reduced && <Animated.Image source={coin} style={[styles.dropCoin, coinStyle]} />}
  </View>;
}

/** The earned souvenir unfolds like a folded ticket: hinge, overshoot, settle. */
export function Souvenir({ ticket, reduced, unfold }: { ticket: AdventureTicket; reduced: boolean; unfold: boolean }) {
  const open = useSharedValue(unfold && !reduced ? 0 : 1);
  useEffect(() => {
    if (!unfold || reduced) { open.value = 1; return; }
    open.value = 0;
    open.value = withDelay(80, withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 }));
  }, [unfold, reduced, open]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, open.value * 2),
    transform: [{ perspective: 800 }, { rotateX: `${(1 - open.value) * 80}deg` }, { scale: 0.85 + open.value * 0.15 }],
  }));
  const coin = ticket.discover?.coin_url || ticket.ride.coin_url;
  return <Animated.View style={[styles.souvenir, style]}>
    <View style={styles.coinHalo}><Image source={coin ? { uri: coin } : COIN_FALLBACK} style={styles.heroCoin} contentFit="contain" /></View>
    <Image source={FINN} style={styles.finn} contentFit="contain" />
  </Animated.View>;
}

/** A chip that springs into Dustin's left suggestion slot. */
function ChipEntrance({ reduced, children, style }: { reduced: boolean; children: ReactNode; style: object }) {
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { enter.value = reduced ? 1 : withSpring(1, { damping: 13, stiffness: 190 }); }, [enter, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateX: (1 - enter.value) * -28 }, { scale: 0.92 + enter.value * 0.08 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

export default function AdventureTicketCard({ ticket, data, closed, stale, top, collapsed = false, gate, detours = [], slam = [], onSlamDone,
  onDiscover, onPlay, onFindLine, onShelf, onSelect, onDismiss, onCelebrate, onRefresh, onOcclusionChange,
  sheetOnly = false, openRequest = 0, celebrateRequest = 0, queueTicketsOn = false, initialOpen = false, initialPicker = false }: Props) {
  const [open, setOpen] = useState(initialOpen), [picker, setPicker] = useState(initialPicker);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [unfold, setUnfold] = useState(false);
  const mounted = useRef(true), locked = useRef(false), pending = useRef<(() => void) | null>(null);
  const unfoldOnShow = useRef(false);
  const occlusion = useRef(onOcclusionChange); occlusion.current = onOcclusionChange;
  const reduced = useReducedGameMotion(), insets = useSafeAreaInsets();
  // The sheet holds its modal layer until UIKit says it is gone; what a button asked for (a walk
  // to the ride, LinePlay, the shelf) runs only then, never into a leaving sheet (core loop 4.3 rule 10).
  const layer = useNativeModalLayer(open, 'show');
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  const runPending = () => {
    const action = pending.current; pending.current = null;
    if (mounted.current) action?.();
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = null; occlusion.current?.(false); };
  }, []);
  const prompt = adventurePrompt(ticket, closed, gate);
  const stamps = adventureStamps(ticket);
  const earnedCount = stamps.filter(Boolean).length;
  const coinUrl = ticket.discover?.coin_url || ticket.ride.coin_url;
  const coinSource = coinUrl ? { uri: coinUrl } : COIN_FALLBACK;
  const complete = ticket.phase === 'complete';
  const close = () => { pending.current = null; unfoldOnShow.current = false; setOpen(false); };
  const transact = async (operation: () => Promise<unknown>) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(null);
    try { await operation(); return true; }
    catch (cause) { if (mounted.current) setError(adventureErrorMessage(cause)); return false; }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const navigateAfterHide = (action: () => void) => {
    if (locked.current || pending.current) return;
    pending.current = action; setOpen(false);
  };
  const next = () => {
    if (stale) { void transact(onRefresh); return; }
    switch (prompt.intent) {
      case 'detour': setPicker(true); return;
      case 'celebrate':
        void transact(async () => {
          const confirmed = await onCelebrate();
          if (!confirmed || !mounted.current) return;
          setUnfold(true);
          haptic('success');
          playSfx('star', 0.7);
        });
        return;
      case 'shelf': navigateAfterHide(onShelf); return;
      case 'discover': navigateAfterHide(onDiscover); return;
      case 'find_line': navigateAfterHide(onFindLine ?? onDiscover); return;
      default:
        navigateAfterHide(() => {
          void onPlay().catch(() => {
            if (mounted.current) { setOpen(true); setError('Could not open this ride\'s adventure. Try again.'); }
          });
        });
    }
  };
  const pick = (pickRide: DetourPick) => void transact(async () => {
    const result = await onSelect(pickRide.ride.task_id);
    if (result && mounted.current) { setPicker(false); haptic('tickSelection'); }
  });
  const tuckAway = () => void transact(async () => {
    await onDismiss?.();
    if (mounted.current) setOpen(false);
  });
  const openSheet = () => { setPicker(false); setError(null); setOpen(true); haptic('tapLight'); };
  const lastRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === lastRequest.current) return;
    lastRequest.current = openRequest;
    openSheet();
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  // UNFOLD on the guide card: the sheet opens on the souvenir and unfolds it once the sheet is up.
  const lastCelebrate = useRef(celebrateRequest);
  useEffect(() => {
    if (celebrateRequest === lastCelebrate.current) return;
    lastCelebrate.current = celebrateRequest;
    unfoldOnShow.current = true;
    openSheet();
  }, [celebrateRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const onShown = () => {
    if (!unfoldOnShow.current) return;
    unfoldOnShow.current = false;
    if (!stale && prompt.intent === 'celebrate') next();
  };
  const ticketsLine = adventureTicketsLine(data.wallet.tickets_needed, !!data.wallet.rescue_pass_available, queueTicketsOn);
  const a11y = `Open Adventure Ticket. ${ticket.ride.ride_name}. ${prompt.title}. ${earnedCount} of 3 chapters complete.`;

  return <>
    {sheetOnly ? null : complete ? (
      // Finished: the ticket tucks into a small souvenir stub in the same slot.
      <ChipEntrance reduced={reduced} style={[styles.stubSlot, { top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={openSheet} style={styles.stub}>
          <Image source={coinSource} style={styles.stubCoin} contentFit="contain" />
          <View style={styles.stubCheck}><GameIcon name="check" size={16} /></View>
        </Pressable>
      </ChipEntrance>
    ) : collapsed ? (
      <MapSuggestionStub side="left" top={top} label={a11y} badge={`${earnedCount}/3`}
        onPress={() => { setPicker(false); setError(null); setOpen(true); }}>
        <Image source={coinSource} style={styles.stubCoin} contentFit="contain" />
      </MapSuggestionStub>
    ) : (
      <ChipEntrance reduced={reduced} style={[styles.chipSlot, { top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={openSheet} style={styles.chip}>
          <Image source={coinSource} style={styles.chipCoin} contentFit="contain" />
          <View style={styles.chipCopy}>
            <View style={styles.chipKickerRow}>
              <Text style={styles.chipKicker}>{stale ? 'LAST KNOWN' : 'ADVENTURE'}</Text>
              {stamps.map((earned, index) => <StampDot key={index} earned={earned} reduced={reduced} coin={coinSource}
                slam={slam.includes(index)} onDone={index === Math.max(...slam) ? onSlamDone : undefined} />)}
            </View>
            <Text numberOfLines={1} style={styles.chipTitle}>{prompt.chip}</Text>
            <Text numberOfLines={1} style={styles.chipRide}>{ticket.ride.ride_name}</Text>
          </View>
        </Pressable>
      </ChipEntrance>
    )}
    <Modal isVisible={layer.present} onBackdropPress={close} onBackButtonPress={close}
      animationIn="slideInUp" animationOut="slideOutDown" animationInTiming={reduced ? 0 : 280} animationOutTiming={reduced ? 0 : 200}
      backdropColor={BRAND.navy} backdropOpacity={0.3}
      backdropTransitionInTiming={reduced ? 0 : 180} backdropTransitionOutTiming={reduced ? 0 : 180}
      onModalWillShow={() => occlusion.current?.(true)} onModalShow={onShown} onModalHide={() => {
        occlusion.current?.(false);
        // The native sheet is gone one transaction after its JS hide: the hand-off runs then, never into it.
        layer.onHidden();
        if (Platform.OS !== 'ios') { runPending(); return; }
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => { settleTimer.current = null; runPending(); }, NATIVE_SETTLE_MS);
      }} onDismiss={() => { layer.onDismissed(); runPending(); }} style={styles.modal}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetEyebrow}>TODAY'S ADVENTURE  {ticket.park_day.slice(5).replace('-', '/')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Adventure Ticket" onPress={close} hitSlop={8} style={styles.close}>
            <GameIcon name="close" size={34} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {picker ? <>
            <Text style={styles.title}>Pick another ride</Text>
            <Text style={styles.support}>A different ride, the same adventure. Every stamp you earned stays.</Text>
            {detours.map(choice => <Pressable key={choice.ride.task_id} accessibilityRole="button"
              accessibilityLabel={`Continue adventure at ${choice.ride.ride_name}`} disabled={busy} onPress={() => pick(choice)}
              style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}>
              <Image source={choice.ride.coin_url ? { uri: choice.ride.coin_url } : COIN_FALLBACK} style={styles.choiceCoin} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle} numberOfLines={1}>{choice.ride.ride_name}</Text>
                <Text style={styles.choiceDetail} numberOfLines={1}>{detourDetail(choice)}</Text>
              </View>
              <GameIcon name="arrow" size={22} />
            </Pressable>)}
            {!detours.length && <Text style={styles.support}>No other open attractions can host an adventure right now. Your stamps are saved.</Text>}
            <GameButton variant="ghost" label="Back to my ticket" accessibilityLabel="Back to my ticket" onPress={() => setPicker(false)} />
          </> : <>
            <Souvenir ticket={ticket} reduced={reduced} unfold={unfold} />
            <Text style={styles.title}>{prompt.title}</Text>
            <Text style={styles.ride}>{ticket.ride.ride_name}</Text>
            <Text style={styles.support}>{prompt.detail}</Text>
            <View style={styles.chapters}>
              {[{ label: 'Discover', detail: ticket.discover ? `${ticket.discover.ride_name}, ${ticket.discover.kind === 'owned_coin' ? 'already on your shelf' : 'coin collected'}` : 'Win this ride\'s coin challenge.' },
                { label: 'Play', detail: ticket.play ? `${ticket.play.chapter_title}${ticket.play.route_name ? `, ${ticket.play.route_name}` : ''}` : 'Finish a short queue story in its line.' },
                { label: 'Celebrate', detail: complete ? 'Your souvenir is saved. Look at it any time.' : 'Bring your coin and story together.' }].map((chapter, index) =>
                <View key={chapter.label} style={[styles.chapter, index < 2 && styles.perforation]}>
                  <Punch earned={stamps[index]} number={index + 1} reduced={reduced} />
                  <View style={{ flex: 1 }}><Text style={styles.chapterTitle}>{chapter.label}</Text><Text style={styles.chapterDetail}>{chapter.detail}</Text></View>
                </View>)}
            </View>
            {ticket.phase === 'discover' && data.wallet.tickets_needed > 0 && !!ticketsLine && <View style={styles.resource}>
              <GameIcon name="ticket" size={34} />
              <Text style={styles.resourceText}>{ticketsLine}</Text>
            </View>}
            <View style={styles.primaryRow}>
              <GameButton label={stale ? 'Refresh my ticket' : prompt.action} accessibilityLabel={stale ? 'Refresh Adventure Ticket' : prompt.action}
                // Its line story wears LinePlay's own picture (ledger 37): the pocket watch means Wait Times only.
                image={prompt.intent === 'play' ? LINEPLAY_ICON : undefined}
                icon={prompt.intent === 'find_line' || prompt.intent === 'discover' ? 'map' : undefined}
                loading={busy} disabled={busy} onPress={next} />
            </View>
            {ticket.phase !== 'complete' && ticket.phase !== 'celebrate' && prompt.intent !== 'detour' && <GameButton variant="ghost" label="Pick another ride"
              accessibilityLabel="Pick another ride for the adventure" disabled={busy} onPress={() => setPicker(true)} />}
            {onDismiss && <GameButton variant="ghost" label="Hide for today" accessibilityLabel="Hide the Adventure Ticket for today"
              disabled={busy} onPress={tuckAway} />}
            {complete && <Text style={styles.private}>Saved for you. Sharing is always your choice.</Text>}
          </>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  // Dustin's left suggestion slot: the same blue pill as the trip goal chip.
  chipSlot: { position: 'absolute', left: 12, width: '43%', zIndex: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.blueBright, borderColor: BRAND.white,
    borderWidth: 3, borderRadius: 14, padding: 7, ...SHADOW.card },
  chipCoin: { width: 34, height: 34 },
  chipCopy: { flex: 1, minWidth: 0 },
  chipKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipKicker: { color: '#ffdc61', fontFamily: 'Knockout', fontSize: 10, letterSpacing: 0.6, marginRight: 2 },
  chipTitle: { color: BRAND.white, fontFamily: 'Shark', fontSize: 13, marginTop: 1 },
  chipRide: { color: '#dff4ff', fontFamily: 'Knockout', fontSize: 11 },
  dotWrap: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#dff4ff', backgroundColor: 'transparent' },
  dotEarned: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  ink: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: BRAND.gold },
  dropCoin: { position: 'absolute', width: 20, height: 20 },
  stubSlot: { position: 'absolute', left: 12, zIndex: 20 },
  stub: { width: 56, height: 56, borderRadius: 28, backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  stubCoin: { width: 42, height: 42 },
  stubCheck: { position: 'absolute', right: -4, bottom: -4 },
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { maxHeight: '88%', backgroundColor: BRAND.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 22, paddingRight: 10, backgroundColor: BRAND.blueBright, minHeight: 54 },
  sheetEyebrow: { flex: 1, fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1, color: '#fff3bf' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 22, paddingBottom: 10 },
  souvenir: { height: 132, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  coinHalo: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#ffe7a0', borderWidth: 3, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  heroCoin: { width: 106, height: 106 },
  finn: { position: 'absolute', width: 83, height: 90, right: 14, bottom: 2 },
  title: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, textAlign: 'center', marginTop: 14 },
  ride: { fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, textAlign: 'center', marginTop: 6 },
  support: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 14 },
  chapters: { borderRadius: 19, borderWidth: 2, borderColor: BRAND.creamDeep, backgroundColor: '#fffdf6', marginTop: 2 },
  chapter: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12, minHeight: 74 },
  perforation: { borderBottomColor: '#dfcba5', borderBottomWidth: 1, borderStyle: 'dashed' },
  punch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#d8c8a6', backgroundColor: '#f8f0dc', alignItems: 'center', justifyContent: 'center' },
  punched: { backgroundColor: BRAND.blueBright, borderColor: BRAND.white, borderWidth: 3 },
  punchText: { fontFamily: 'Shark', color: '#947f5b', fontSize: 18 },
  chapterTitle: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  chapterDetail: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft, lineHeight: 18, marginTop: 3 },
  primaryRow: { alignItems: 'center', marginTop: 18 },
  private: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, textAlign: 'center', marginTop: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72, borderWidth: 2, borderColor: BRAND.creamDeep,
    borderRadius: 17, backgroundColor: '#fffdf6', marginBottom: 10 },
  choicePressed: { borderColor: BRAND.gold, backgroundColor: '#fff3c9' },
  choiceCoin: { width: 48, height: 48 },
  choiceTitle: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  choiceDetail: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft, marginTop: 4 },
  resource: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e6f3f6', borderRadius: 14, padding: 12, marginTop: 14 },
  resourceText: { flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#23566e', lineHeight: 19 },
  error: { fontFamily: 'Knockout', fontSize: 14, lineHeight: 20, color: BRAND.redLip, paddingVertical: 12, textAlign: 'center' },
});
