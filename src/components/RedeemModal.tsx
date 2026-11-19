import { leavingSheetTap, modalLayers } from '../ui/modalLayers';
import { createPressQueue } from './guide/playPressQueue';
import { pressTrace } from '../ui/pressTrace';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { AuthContext } from '../context/AuthProvider';
import { useRung } from '../services/reveal/revealLadder';
import { playBadge, stampClaimSources, type PlayBadge } from './rewards/challengeCopy';
import { getStamps } from '../api/endpoints/me/stamps';
import TicketGift from './rewards/TicketGift';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { nearbyOpportunityOpen, nearbyRideClosedReason, type NearbyClosedReason } from '../screens/ExploreScreen/mapOpportunityTiming';
import { restingLabel } from '../screens/ExploreScreen/mapMarkerPresentation';
import type { GameIconName } from '../ui/iconNames';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { studioMoment } from '../gamekit/audio/playMoment';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import RedeemCurrentRedeemableModal from './RedeemCurrentRedeemableModel';
import RedeemKeyModal from './RedeemKeyModal';
import RedeemRedeemableModal from './RedeemRedeemableModal';
import RedeemVaultModal from './RedeemVaultModal';
import YellowButton from './YellowButton';
import { TaskType } from '../models/task-type';
import { BRAND, GameIcon } from '../ui';
import { useCoverArt } from './map/mapCover';
import HomeArcade from './HomeArcade';
import { playCaptionName } from './guide/playCaption';
import { coinCardSeenNow, warmCoinCardsSeen } from './rewards/coinCardSeen';
import { playPillState } from './rewards/playPill';
import { findPendingWin, pendingWinRedeemable } from '../services/task-attempt/pendingWins';

/**
 * PLAY!'s wrapper sits 50 pt below the map's bottom edge (ExploreScreen); the group rests 120 pt
 * up from there. Its entrance starts 24 pt lower, still clear of the footer compass, and fully clear.
 */
const PLAY_RIDE_REST_Y = -120;
const PLAY_RIDE_ENTER_FROM = -96;
/** How long "This coin moved on" stays in PLAY!'s spot before it fades (T012). */
export const MOVED_ON_SHOW_MS = 4500;
/** How far around PLAY! a tap on a leaving sheet still counts as PLAY! (a kid's finger). */
const PLAY_HOLD_SLOP = 8;

export default function RedeemModal({
  redeemable,
  park,
  onPress,
  onTaskFailed,
  onTaskCompleted,
  liveStatus = null,
  onOpenChange,
  onShownChange,
  covered = false,
  claimableTickets,
  playRequest = 0,
}: {
  /**
   * Earned Tickets waiting to be claimed, from the map guide's own Stamp Book read (one source: the guide card and
   * PLAY!'s gift always agree). null: that read has not answered yet (no gift). Omitted: PLAY! looks them up itself.
   */
  readonly claimableTickets?: number | null;
  /** Bumped by the guide card's body on "You're here! Tap PLAY!": the same press as PLAY! itself, when PLAY! is up. */
  readonly playRequest?: number;
  /**
   * The map's loading cover is still up. A ride already in range gets PLAY! ready under it, at
   * rest (no slide), and the cover waits for its art: the cover's own fade reveals it with the map.
   */
  readonly covered?: boolean;
  /** PLAY! (or the closed-ride sign) is up or gone: the map keeps its art out from under it. */
  readonly onShownChange?: (shown: boolean) => void;
  /** The live feed's status for the ride in range (DOWN, CLOSED...): no PLAY! on a closed ride. */
  readonly liveStatus?: string | null;
  /** The challenge flow opened or closed (for the map's one-overlay-at-a-time queue). */
  readonly onOpenChange?: (open: boolean) => void;
  readonly redeemable?: CurrentRedeemableType;
  readonly park: ParkType;
  readonly onPress: () => void;
  readonly onTaskFailed?: (taskId: number) => void;
  readonly onTaskCompleted?: (taskId: number, isSecretTask: boolean) => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  // One press to play (fix W3 T047): set at the PLAY! press, read by the card when it opens.
  const [quickStart, setQuickStart] = useState(false);
  // Out of Tickets, the card's Practice game opens the free practice games from here (T031).
  const [practiceOpen, setPracticeOpen] = useState(false);
  // Nearby opportunities can refresh or disappear as soon as a win is confirmed.
  // The opened challenge owns its snapshot until the player closes its reward flow.
  const [openedRedeemable, setOpenedRedeemable] = useState<CurrentRedeemableType | null>(null);
  const reducedMotion = useReducedGameMotion();
  const lastAnnounced = useRef<string | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  // PLAY! is one piece: the yellow pill, its label and the ride chip under it stay hidden until
  // the pill art has drawn, then slide up together (never words or a chip on the bare map first).
  const [pillReady, setPillReady] = useState(false);

  const openChange = useRef(onOpenChange); openChange.current = onOpenChange;
  useEffect(() => { openChange.current?.(modalVisible); }, [modalVisible]);
  useEffect(() => () => openChange.current?.(false), []);
  const task = redeemable?.type === 'task' ? redeemable.model as TaskType : null;
  const { player } = useContext(AuthContext);
  useEffect(() => { warmCoinCardsSeen(player?.id); }, [player?.id]);
  // A server-granted win always shows its win card (fix W3 T033): a won try whose card never showed (its answer was
  // lost, the card closed, the app was shut) opens as its win card here, on the map, as soon as the server says so.
  // Looked at when the map opens, when the app comes back, after a challenge card closes, and again a little later
  // while a saved try could not be read.
  const [pendingLook, setPendingLook] = useState(0);
  const pendingBusy = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') setPendingLook(n => n + 1); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (modalVisible || !player?.id || pendingBusy.current) return undefined;
    let alive = true;
    let again: ReturnType<typeof setTimeout> | null = null;
    pendingBusy.current = true;
    void findPendingWin(player.id).then(({ win, unsure }) => {
      if (!alive) return;
      if (win) {
        setQuickStart(false);
        setOpenedRedeemable(pendingWinRedeemable(win) as unknown as CurrentRedeemableType);
        setModalVisible(true);
      } else if (unsure) {
        again = setTimeout(() => setPendingLook(n => n + 1), 15000);
      }
    }).catch(() => undefined).finally(() => { pendingBusy.current = false; });
    return () => { alive = false; if (again) clearTimeout(again); };
  }, [modalVisible, player?.id, pendingLook]);
  // Secret coins arrive with coin levels (rung 3, blueprint 5.13): before that a secret spot offers nothing.
  const coinLevels = useRung('coin_levels');
  const secretLocked = redeemable?.type === 'secret_task' && !coinLevels.open;
  // The coin's own art and name ride along under PLAY! (a ride, a sight or a secret coin).
  const coin = redeemable && (redeemable.type === 'task' || redeemable.type === 'secret_task')
    ? redeemable.model as TaskType : null;
  // Out of Tickets, PLAY! never vanishes: the daily free try wears a gift, a held extra try a ticket-gift.
  // Earned Tickets waiting in the Stamp Book come first (the card claims them in place), so while any wait
  // PLAY! wears no gift: the button and the card always agree. Looked up once per Ticket count, only at 0.
  // Looked up at 0 Tickets with or without a free try: with none, an empty book is what dims PLAY! (T030).
  const short = !!coin && (player?.tickets ?? 0) < Math.max(1, coin.ticket_cost ?? 1);
  const [claimWaiting, setClaimWaiting] = useState<{ tickets: number; count: number } | null>(null);
  const ticketsNow = player?.tickets ?? 0;
  useEffect(() => {
    if (!short || claimableTickets !== undefined || claimWaiting?.tickets === ticketsNow) return;
    let alive = true;
    void getStamps().then(response => {
      const count = stampClaimSources(Object.values(response.stamps).flat()).reduce((sum, source) => sum + source.tickets, 0);
      if (alive) setClaimWaiting({ tickets: ticketsNow, count });
    }).catch(() => { if (alive) setClaimWaiting({ tickets: ticketsNow, count: 0 }); });
    return () => { alive = false; };
  }, [short, ticketsNow, claimWaiting?.tickets, claimableTickets]);
  // While the card is open, a fresher answer for the same coin replaces its snapshot (fix W3: after a loss the
  // card shows today's free and extra tries, never the ones the map knew before the try).
  useEffect(() => {
    if (!modalVisible || !redeemable || !openedRedeemable) return;
    if (redeemable === openedRedeemable || redeemable.type !== openedRedeemable.type || redeemable.model.id !== openedRedeemable.model.id) return;
    setOpenedRedeemable(redeemable);
  }, [modalVisible, redeemable]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownClaimable = short && claimWaiting?.tickets !== ticketsNow ? 1 : claimWaiting?.count ?? 0;
  const badge: PlayBadge = coin ? playBadge({
    tickets: ticketsNow, ticketCost: coin.ticket_cost ?? 1,
    rescueAvailable: redeemable?.rescue_pass_available, rescueSource: redeemable?.rescue_pass_source,
    // Until the lookup answers, no gift: a gift that vanishes a moment later would be a false promise.
    claimable: claimableTickets === undefined ? ownClaimable : claimableTickets === null ? 1 : claimableTickets,
  }) : null;
  // A ride resting until "Back 2:00 PM", or one the live feed shows closed, never offers
  // PLAY!, even when the server still counts the player in range. A tapped island elsewhere never hides it (T001):
  // PLAY! always rises for the coin the player stands at, and the guide card names that coin.
  const available = !secretLocked && nearbyOpportunityOpen(redeemable, liveStatus);
  // Press feedback inside 100 ms (blueprint section 11, Feedback): a tap squashes the pill and buzzes at once,
  // even while the challenge card waits its turn behind a sheet that is still sliding away.
  const press = useRef(new Animated.Value(1)).current;
  // A press that lands on a sheet still on its way out, right over PLAY!, is PLAY!'s press (ui/modalLayers.ts).
  const pillRef = useRef<View>(null);
  const pressPlayRef = useRef<() => void>(() => undefined);
  const pressNow = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (reducedMotion) return;
    press.stopAnimation();
    press.setValue(0.9);
    Animated.spring(press, { toValue: 1, stiffness: 420, damping: 12, mass: 0.7, useNativeDriver: true }).start();
  };
  // Standing at a ride that is not open: the same spot says why (and when it is back), never a blank.
  const rawClosedReason = !available ? nearbyRideClosedReason(redeemable, liveStatus) : null;
  // A find that moved on says so for a moment, then fades: nothing is left to do at that spot (T012). It stays its
  // full moment even when the next range answer (no coin here any more) lands a second later.
  const movedOnKey = rawClosedReason?.kind === 'moved_on' && redeemable ? `${redeemable.type}:${redeemable.model.id}` : null;
  const [movedOn, setMovedOn] = useState<{ key: string; showing: boolean } | null>(null);
  useEffect(() => {
    if (!movedOnKey || movedOn?.key === movedOnKey) return undefined;
    setMovedOn({ key: movedOnKey, showing: true });
    return undefined;
  }, [movedOnKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!movedOn?.showing) return undefined;
    const timer = setTimeout(() => setMovedOn(current => current && { ...current, showing: false }), MOVED_ON_SHOW_MS);
    return () => clearTimeout(timer);
  }, [movedOn?.key, movedOn?.showing]); // eslint-disable-line react-hooks/exhaustive-deps
  const movedOnShowing = !!movedOn?.showing && !available;
  const closedReason = movedOnShowing ? { kind: 'moved_on' as const }
    : rawClosedReason && rawClosedReason.kind !== 'moved_on' ? rawClosedReason : null;
  const closedLabel = closedReason ? closedRideCopy(closedReason) : null;
  const shown = (available && pillReady) || !!closedLabel;
  // Under the cover the lift waits for the pill art (never past the cover's hard cap).
  const pillArtDrawn = useCoverArt(covered && available && !pillReady);
  const identity = redeemable ? `${redeemable.type}:${redeemable.model.id}` : null;
  const shownChange = useRef(onShownChange); shownChange.current = onShownChange;
  useEffect(() => { shownChange.current?.(shown); }, [shown]);
  useEffect(() => () => shownChange.current?.(false), []);
  useEffect(() => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[play] redeemable ${identity ?? 'none'} available=${available} t=${Date.now()}`); }, [identity, available]);
  // The pill unmounts when the ride stops being available: its next showing waits for its art again.
  useEffect(() => { if (!available) setPillReady(false); }, [available]);
  // The "you're in range" cue lands with the pill itself (never before the button is on screen).
  // Under the cover it waits for the reveal, so the cue lands as the kid sees the button.
  const pillShown = available && pillReady && !covered;
  useEffect(() => {
    if (pillShown && identity !== lastAnnounced.current) {
      lastAnnounced.current = identity;
      if (!studioMoment('coin.inRange')) void playSound(require('../../assets/sounds/in_redeem_zone.mp3'));
      // Dev builds only: lane walks time PLAY! rising (never in a store bundle).
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[play] up ${identity} t=${Date.now()}`);
    } else if (!available) {
      lastAnnounced.current = null;
    }
  }, [pillShown, available, identity, playSound]);
  // Entrance: the group fades and springs up into its resting spot (a short 24 pt rise, 0.9 to 1),
  // starting well above the footer, so it never draws over the compass or the MAP label. Hidden,
  // it is fully transparent. Native driver; Reduce Motion places it at once.
  useEffect(() => {
    enter.stopAnimation();
    // Under the cover it simply stands in place: the cover's fade is its entrance.
    if (reducedMotion || covered) enter.setValue(shown ? 1 : 0);
    else if (shown) Animated.spring(enter, { toValue: 1, stiffness: 260, damping: 20, mass: 1, useNativeDriver: true }).start();
    else Animated.timing(enter, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    return () => enter.stopAnimation();
  }, [shown, identity, reducedMotion, enter, covered]);
  const playDrawn = !!redeemable && available;
  useEffect(() => {
    if (!playDrawn) return undefined;
    return leavingSheetTap.listen((x, y, claim) => {
      pillRef.current?.measureInWindow((px, py, width, height) => {
        if (x >= px - PLAY_HOLD_SLOP && x <= px + width + PLAY_HOLD_SLOP && y >= py - PLAY_HOLD_SLOP && y <= py + height + PLAY_HOLD_SLOP) {
          claim();   // PLAY! answers this tap itself: the screen under the sheet is not pressed again (ui/tapThrough.ts)
          pressPlayRef.current();
        }
      });
    });
  }, [playDrawn]);
  // PLAY! rose on the GPS fix before the server's range answer (T009): once that answer lands for the same coin, the
  // open card takes the server's fuller copy (free try fields, coin art), so it never plays on the quick copy.
  useEffect(() => {
    if (!openedRedeemable || !(openedRedeemable as { provisional?: boolean }).provisional || !redeemable) return;
    if (redeemable.type === openedRedeemable.type && redeemable.model.id === openedRedeemable.model.id
      && !(redeemable as { provisional?: boolean }).provisional) setOpenedRedeemable(redeemable);
  }, [redeemable, openedRedeemable]);
  // A press while the last card is still leaving waits for it, then opens (safety finding 2, ./guide/playPressQueue.ts).
  const pressQueue = useRef(createPressQueue(modalLayers)).current;
  useEffect(() => () => pressQueue.cancel(), [pressQueue]);
  const openRef = useRef<() => void>(() => undefined);
  openRef.current = () => {
    pressTrace('play.open', () => `${redeemable ? `${redeemable.type}:${redeemable.model.id}` : 'none'}`);
    if (!redeemable) return;   // walked off while the press waited: nothing to open
    setOpenedRedeemable(redeemable);
    // A coin whose card was read before, with a Ticket in hand: PLAY! is the one press (the card starts at once).
    setQuickStart(!!coin && (player?.tickets ?? 0) >= Math.max(1, coin.ticket_cost ?? 1)
      && coinCardSeenNow(player?.id, redeemable?.type ?? '', coin.id));
    setModalVisible(true);
  };
  pressPlayRef.current = () => {
    pressNow();
    const how = pressQueue.press(() => openRef.current());
    pressTrace('play.press', () => `${identity} ${how} modalVisible=${modalVisible} leaving=${modalLayers.leavingCount()} layers=${modalLayers.count()}`);
  };
  // Out of Tickets with no free way to play right now (T030): PLAY! dims and wears a ticket, so it never looks
  // like a free press; it still opens the card, whose big button plays the line or a practice game.
  const pill = playPillState({ isCoin: !!coin, tickets: ticketsNow, ticketCost: coin?.ticket_cost ?? 1, badge,
    claimable: claimableTickets === undefined ? (claimWaiting?.tickets === ticketsNow ? claimWaiting.count : null) : claimableTickets,
    rescueAvailable: redeemable?.rescue_pass_available === true });
  // The guide card's body says "Tap PLAY!": a tap there is PLAY!'s own press, only while PLAY! is shown.
  const seenPlayRequest = useRef(playRequest);
  useEffect(() => {
    if (playRequest === seenPlayRequest.current) return;
    seenPlayRequest.current = playRequest;
    if (pillShown && !modalVisible) pressPlayRef.current();
  }, [playRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const entrance = {
    opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [PLAY_RIDE_ENTER_FROM, PLAY_RIDE_REST_Y] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  };

  return (
    <>
      {redeemable && available && (
        <Animated.View style={entrance}>
          <Animated.View ref={pillRef} collapsable={false} style={{ transform: [{ scale: press }], opacity: pill.dim ? 0.62 : 1 }}
            onTouchStart={() => pressTrace('play.touch')}>
            <YellowButton
              onArtReady={() => { pillArtDrawn(); setPillReady(true); }}
              onPress={() => pressPlayRef.current()}
              text={redeemable.type === 'secret_task' ? 'Play Secret!'
                : redeemable.type === 'task' ? 'PLAY!' : 'Redeem'}
            />
            {/* The gift on PLAY! is today's free try; a ticket with a gift is a held extra try. */}
            {badge && <View pointerEvents="none" style={styles.badge} accessible
              accessibilityLabel={badge === 'free_try' ? 'Free try today' : 'Extra try'}>
              {badge === 'free_try' ? <GameIcon name="gift" size={30} /> : <TicketGift size={30} />}
            </View>}
            {pill.needTicket && <View pointerEvents="none" style={styles.badge} accessible accessibilityLabel="You need a Ticket">
              <GameIcon name="ticket" size={28} />
            </View>}
          </Animated.View>
          {coin && <View pointerEvents="none" style={styles.caption} accessible
            accessibilityLabel={badge === 'free_try' ? `${coin.name}. Free try today.`
              : badge === 'extra_try' ? `${coin.name}. Uses an extra try.`
              : `${coin.name}. Costs ${coin.ticket_cost ?? 1} ${(coin.ticket_cost ?? 1) === 1 ? 'Ticket' : 'Tickets'}.`}>
            {!!coin.coin_url && <Image source={{ uri: coin.coin_url }} style={styles.captionCoin} contentFit="contain" />}
            {/* One line on every phone (N11): the name shrinks to fit, and a very long one keeps its main words. */}
            <Text style={styles.captionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{playCaptionName(coin.name)}</Text>
            {!badge && <View style={styles.cost}>
              <GameIcon name="ticket" size={16} />
              <Text style={styles.captionText}>{coin.ticket_cost ?? 1}</Text>
            </View>}
          </View>}
        </Animated.View>
      )}
      {!available && closedLabel && (task || movedOnShowing) && (
        <Animated.View pointerEvents="none" style={entrance} accessible
          accessibilityLabel={closedLabel.sub || !task ? closedLabel.a11y : `${task.name}. ${closedLabel.a11y}`}>
          <View style={styles.closedPill}>
            <GameIcon name={closedLabel.icon} size={30} />
            <Text style={styles.closedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{closedLabel.text}</Text>
          </View>
          <View style={styles.caption}>
            <Text style={styles.captionText} numberOfLines={1}>{closedLabel.sub ?? task?.name}</Text>
          </View>
        </Animated.View>
      )}
      {openedRedeemable && (
        <>
          {openedRedeemable?.type === 'redeemable' && (
            <RedeemCurrentRedeemableModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable.model as RedeemableType}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'key' && (
            <RedeemKeyModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'vault' && (
            <RedeemVaultModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {(openedRedeemable?.type === 'coin' ||
            openedRedeemable?.type === 'task' ||
            openedRedeemable?.type === 'item' ||
            openedRedeemable?.type === 'pin' ||
            openedRedeemable?.type === 'secret_task') && (
            <RedeemRedeemableModal
              open={modalVisible}
              redeemable={openedRedeemable}
              close={() => setModalVisible(false)}
              park={park}
              onPress={() => onPress()}
              onTaskFailed={onTaskFailed}
              onTaskCompleted={onTaskCompleted}
              quickStart={quickStart}
              onPractice={() => setPracticeOpen(true)}
            />
          )}
        </>
      )}
      <HomeArcade visible={practiceOpen} onClose={() => setPracticeOpen(false)} />
    </>
  );
}

/** What the PLAY! spot says at a ride that is not open: a picture and a few big words. */
export function closedRideCopy(reason: NearbyClosedReason): { icon: GameIconName; text: string; a11y: string; sub?: string } {
  switch (reason.kind) {
    case 'resting': {
      const back = restingLabel(reason.at);
      return { icon: 'timer', text: back, a11y: `Resting now. ${back}.` };
    }
    case 'down': return { icon: 'wrench', text: 'Ride is down', a11y: 'This ride is down right now. Try again soon.' };
    case 'repairs': return { icon: 'wrench', text: 'Closed for repairs', a11y: 'This ride is closed for repairs.' };
    // Coin words, never ride words: the find moved on, the ride did not close (T012).
    case 'moved_on': return { icon: 'sparkle', text: 'This coin moved on', a11y: 'This coin moved on. A new one appears soon.',
      sub: 'A new one appears soon' };
    default: return { icon: 'lock', text: 'Closed now', a11y: 'This ride is closed right now.' };
  }
}

const styles: Record<'caption' | 'cost' | 'closedPill' | 'badge', ViewStyle> & { captionText: TextStyle; closedText: TextStyle;
  captionCoin: { width: number; height: number } } = {
  // The free-try gift sits on PLAY!'s top right corner, on a white disc so it reads on the gold pill.
  badge: { position: 'absolute', right: -6, top: -10, width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.white,
    borderWidth: 3, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  captionCoin: { width: 18, height: 18 },
  // A ride that is not open: a soft, untappable cream pill in the PLAY! spot (not a button).
  closedPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%',
    backgroundColor: '#FFF5D3', borderRadius: 26, borderWidth: 3, borderColor: BRAND.navy,
    paddingHorizontal: 20, paddingVertical: 10, marginBottom: 8 },
  closedText: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, flexShrink: 1 },
  // Ride name and price under PLAY!, on a white tab with his navy outline.
  caption: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, maxWidth: '100%',
    backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 3 },
  captionText: { fontFamily: 'Shark', fontSize: 13, lineHeight: 15, color: BRAND.navy, flexShrink: 1, textAlign: 'center' },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
};
