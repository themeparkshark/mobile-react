/**
 * Pin Trading. The trading board (pins other players put up, no names), the
 * trade sheet (hold timer, you get / you give, your pins) and the
 * trade-complete moment. Logic and copy live in pinTrading/pinTradeModel.ts.
 *
 * Kid safety (unchanged rules): trading needs a signed-in player
 * (PermissionEnums.TradePins, checked again here, not only on the Social
 * shortcut); the board never shows or keeps who posted a pin; there is no
 * chat and no free text. Only the server decides what can be traded.
 */
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ImageBackground, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { vsprintf } from 'sprintf-js';
import getPins from '../api/endpoints/me/pins';
import acceptPinSwap from '../api/endpoints/pin-swaps/accept';
import getPinSwaps from '../api/endpoints/pin-swaps/all';
import holdPinSwap from '../api/endpoints/pin-swaps/hold';
import unHoldPinSwap from '../api/endpoints/pin-swaps/unhold';
import InformationModal from '../components/InformationModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { InformationModalEnums } from '../models/information-modal-enums';
import type { ItemType } from '../models/item-type';
import { PermissionEnums } from '../models/permission-enums';
import type { PinSwapType } from '../models/pin-swap-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, FONT, gameAlert, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW, SharkLoader, SPACE } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import EnamelPin from './pinTrading/EnamelPin';
import { type BoardBadge, BoardPinCard, MAX_FONT, PageWash, type SlotRect, TRADE_SURFACE } from './pinTrading/PinTradeParts';
import {
  boardEntry, classifyTradeError, givablePins, holdLengthMs, isHolding, mergePins, PIN_TRADE_COPY as COPY, pinName, type TradePhase,
} from './pinTrading/pinTradeModel';
import SwapCelebration from './pinTrading/SwapCelebration';
import TradeSheet from './pinTrading/TradeSheet';
import { beat, preloadTradeAudio } from './pinTrading/tradeAudio';
import { warmPinImages } from './pinTrading/pinImageCache';

/** Trades this app session (for the "Trade #n today!" line). */
let sessionTrades = 0;

const CORK = require('../../assets/images/screens/pin-swaps/corkboard.png');
const LANYARD = require('../../assets/images/screens/social/pin_swaps.png');
const SHARK_HAPPY = require('../../assets/images/howto/shark-happy.webp');
const SHARK_OOPS = require('../../assets/images/screens/redeem/so-close-shark.png');

const COLUMNS = 3;
/** Your pins load up front (all pages, capped) so the hold clock never runs while they load. */
const MAX_PIN_PAGES = 10;
/** "Yes, trade!" ignores taps for this long after it appears (a double tap can't skip the confirm). */
const CONFIRM_GUARD_MS = 450;

type Hold = { swap: PinSwapType; deadline: number; totalMs: number };
type Done = { got: ItemType; gave: ItemType; from: { get?: SlotRect; give?: SlotRect } };

/** Board empty or failed to load: Alex's shark, a line and one action, sized for the cork panel. */
function BoardState({ kind, onPress }: { kind: 'empty' | 'error'; onPress: () => void }) {
  const empty = kind === 'empty';
  const title = empty ? COPY.emptyTitle : COPY.networkTitle;
  const message = empty ? COPY.emptyMessage : COPY.networkMessage;
  return (
    <View style={styles.boardState} accessible accessibilityLabel={`${title}. ${message}`}>
      <Image source={empty ? SHARK_HAPPY : SHARK_OOPS} style={{ width: 124, height: 136 }} contentFit="contain" />
      <View style={styles.boardStateCard}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.boardStateTitle}>{title}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.boardStateBody}>{message}</Text>
      </View>
      <GameButton size="compact" icon="retry" label={empty ? COPY.emptyAction : COPY.tryAgain} onPress={onPress} />
    </View>
  );
}

export default function PinSwapsScreen() {
  const { hasPermission } = usePermissions();
  const signedIn = hasPermission(PermissionEnums.TradePins);
  const { labels, errors } = useCrumbs();
  const still = useUiReducedMotion();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();

  const [board, setBoard] = useState<PinSwapType[]>([]);
  const [boardState, setBoardState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [phase, setPhase] = useState<TradePhase>('loading');
  const [pins, setPins] = useState<ItemType[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState(false);
  const [pinsReady, setPinsReady] = useState(false);
  const [selected, setSelected] = useState<ItemType>();
  const [done, setDone] = useState<Done | null>(null);
  const [lastGiven, setLastGiven] = useState<number | null>(null);
  const shine = useSharedValue(0);
  const sheetFade = useSharedValue(1);
  const sheetFadeStyle = useAnimatedStyle(() => ({ opacity: sheetFade.value }));
  const holdRef = useRef<Hold | null>(null);
  const slotsRef = useRef<{ get?: SlotRect; give?: SlotRect }>({});
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const phaseRef = useRef<TradePhase>('loading');
  const selectedRef = useRef<ItemType | undefined>(undefined);
  const confirmAt = useRef(0);
  const pinsPage = useRef({ next: 1, finished: false, loading: false, token: 0 });
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ board: [] as PinSwapType[], busyId: null as number | null, owned: new Set<number>(), pinsCount: 0, pinsKnown: false, lastGiven: null as number | null });
  holdRef.current = hold;
  phaseRef.current = phase;
  selectedRef.current = selected;

  const loadBoard = useCallback(async (mode: 'first' | 'refresh') => {
    if (mode === 'first') setBoardState('loading');
    else setRefreshing(true);
    try {
      const swaps = await getPinSwaps();
      const urls = swaps.map(s => s.pin.item.icon_url);
      warmPinImages(urls);
      // Show the new board in one beat once its art is in, not card by card.
      await Promise.race([Image.prefetch(urls, 'memory-disk').catch(() => false), new Promise(r => setTimeout(r, 1500))]);
      setBoard(swaps.map(boardEntry));
      setBoardState('ready');
    } catch {
      setBoardState(prev => (mode === 'refresh' && prev === 'ready' ? 'ready' : 'error'));
      if (mode === 'refresh') gameAlert(COPY.networkTitle, COPY.networkMessage, undefined, { icon: 'info' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** One page of your tradeable pins. `all` keeps going until the last page (capped). */
  const loadPins = useCallback(async (reset: boolean, all = false) => {
    const page = pinsPage.current;
    if (reset) { page.next = 1; page.finished = false; page.token += 1; page.loading = false; }
    if (page.loading || page.finished) return;
    page.loading = true;
    const token = page.token;
    setPinsLoading(true);
    setPinsError(false);
    try {
      let collected: ItemType[] = [];
      do {
        const rows = await getPins(page.next);
        if (token !== page.token) return;
        page.next += 1;
        if (rows.length === 0) page.finished = true;
        collected = mergePins(collected, rows);
        warmPinImages(rows.map(r => r.icon_url));
        if (reset && page.next === 2) setPins(collected);
        else setPins(prev => mergePins(prev, rows));
      } while (all && !page.finished && page.next <= MAX_PIN_PAGES);
      setPinsReady(true);
    } catch {
      if (token === page.token) setPinsError(true);
    } finally {
      if (token === page.token) { page.loading = false; setPinsLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    preloadTradeAudio();
    void loadBoard('first');
    void loadPins(true, true);
  }, [signedIn, loadBoard, loadPins]);

  // One shine for the whole board: a slow wave every few seconds while the board is in view.
  const boardActive = focused && !hold && !done && !still && boardState === 'ready';
  useEffect(() => {
    cancelAnimation(shine);
    shine.value = 0;
    if (!boardActive) return;
    // One sweep every 6.2 s, started from JS: while it rests, the value is untouched, so no pin redraws.
    const sweep = () => { shine.value = 0; shine.value = withTiming(1, { duration: 1900 }); };
    const first = setTimeout(sweep, 500);
    const loop = setInterval(sweep, 6200);
    return () => { clearTimeout(first); clearInterval(loop); cancelAnimation(shine); };
  }, [boardActive, shine]);

  // Let the pin go back on the board if the player leaves mid-trade.
  useEffect(() => () => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    const h = holdRef.current;
    if (h && isHolding(phaseRef.current)) void unHoldPinSwap(h.swap.id).catch(() => undefined);
  }, []);

  // iOS has no live regions: say the important sheet changes out loud.
  useEffect(() => {
    const line = phase === 'expired' ? `${COPY.expiredTitle}. ${COPY.expiredMessage}`
      : phase === 'taken' ? `${COPY.takenTitle}. ${COPY.takenMessage}`
        : phase === 'failed' ? `${COPY.failedTitle}. ${COPY.failedMessage}`
          : phase === 'confirming' && selectedRef.current && holdRef.current
            ? COPY.confirmMessage(pinName(selectedRef.current), pinName(holdRef.current.swap.pin.item)) : '';
    if (line && hold) AccessibilityInfo.announceForAccessibility(line);
  }, [phase, hold]);

  const showError = useCallback((error: unknown) => {
    const kind = classifyTradeError(error);
    beat('fx.nope', { volume: 0.8 }, 'failBuzz', 2);
    if (kind === 'taken') gameAlert(COPY.takenTitle, errors.pin_swap_unavailable || COPY.takenMessage, undefined, { icon: 'search' });
    else if (kind === 'owned') gameAlert(COPY.ownedTitle, COPY.ownedMessage, undefined, { icon: 'info' });
    else if (kind === 'network') gameAlert(COPY.networkTitle, COPY.networkMessage, undefined, { icon: 'info' });
    else gameAlert(COPY.genericTitle, COPY.genericMessage, undefined, { icon: 'info' });
    return kind;
  }, [errors.pin_swap_unavailable]);

  const owned = useMemo(() => new Set(pins.map(p => p.id)), [pins]);
  live.current = { board, busyId, owned, pinsCount: pins.length, pinsKnown: pinsReady && !pinsLoading && !pinsError, lastGiven };
  const badgeFor = useCallback((item: ItemType): BoardBadge => (
    owned.has(item.id) ? 'owned' : item.id === lastGiven ? 'yours' : undefined
  ), [owned, lastGiven]);

  /** Hold a board pin (fresh from the board, or "Try again" on the same pin after it expired). */
  const startHold = useCallback(async (swapId: number, again = false) => {
    const now = live.current;
    if (now.busyId != null || (holdRef.current && !again)) return;
    const swap = again ? holdRef.current?.swap : now.board.find(s => s.id === swapId);
    if (!swap) return;
    // No server call when the answer is already known: you own it, you just put it up, or you have nothing to give.
    if (now.owned.has(swap.pin.item.id)) {
      beat('ui.select');
      gameAlert(COPY.ownedTitle, COPY.ownedMessage, undefined, { icon: 'info' });
      return;
    }
    if (swap.pin.item.id === now.lastGiven) {
      beat('ui.select');
      gameAlert(COPY.yoursTitle, COPY.yoursMessage, undefined, { icon: 'pin' });
      return;
    }
    if (now.pinsKnown && now.pinsCount === 0) {
      beat('ui.select');
      gameAlert(COPY.noPinsTitle, COPY.noPinsHint, undefined, { icon: 'chest' });
      return;
    }
    setBusyId(swapId);
    warmPinImages([swap.pin.item.icon_url]);
    beat('ui.select', { volume: 0.9 });
    try {
      const held = await holdPinSwap(swapId);
      const totalMs = holdLengthMs(held.held_from, held.held_to);
      if (!again) setSelected(undefined);
      setPhase('picking');
      sheetFade.value = 1;
      setHold({ swap: { ...swap, held_from: held.held_from, held_to: held.held_to }, deadline: Date.now() + totalMs, totalMs });
      if (!live.current.pinsKnown) void loadPins(true, true);
    } catch (error) {
      const kind = classifyTradeError(error);
      if (again && kind === 'taken') {
        setPhase('taken');
        beat('fx.nope', { volume: 0.6 }, 'failBuzz', 2);
      } else {
        showError(error);
        if (!again && kind === 'taken') void loadBoard('refresh');
      }
    } finally {
      setBusyId(null);
    }
  }, [loadBoard, loadPins, sheetFade, showError]);

  const onBoardPress = useCallback((swapId: number) => { void startHold(swapId); }, [startHold]);
  const onHoldAgain = useCallback(() => {
    const h = holdRef.current;
    if (h) void startHold(h.swap.id, true);
  }, [startHold]);

  const closeSheet = useCallback(() => {
    const h = holdRef.current;
    if (!h || phaseRef.current === 'sending') return;
    const p = phaseRef.current;
    if (isHolding(p)) void unHoldPinSwap(h.swap.id).catch(() => undefined);
    beat('ui.modalClose', { volume: 0.7 });
    setHold(null);
    setSelected(undefined);
    if (p === 'expired' || p === 'failed' || p === 'taken') void loadBoard('refresh');
  }, [loadBoard]);

  const onExpire = useCallback(() => {
    const h = holdRef.current;
    if (!h || phaseRef.current === 'sending') return;
    setPhase('expired');
    // Gentle: a soft close and one warning tap, not a fail buzz (nothing was lost).
    beat('fx.purchaseCancel', { volume: 0.6 }, 'warning', 2);
    void unHoldPinSwap(h.swap.id).catch(() => undefined);
  }, []);

  const onTick = useCallback((left: number) => {
    // Soft coin ticks that climb as the last seconds run out.
    beat('fx.coinTick', { volume: 0.35, pitch: (6 - left) * 0.8 });
  }, []);

  const onSelect = useCallback((item: ItemType) => {
    if (phaseRef.current !== 'picking' && phaseRef.current !== 'confirming') return;
    setPhase('picking');
    setSelected(prev => (prev?.id === item.id ? prev : item));
    beat('ui.select', { volume: 0.8 }, 'tickSelection', 1);
  }, []);

  const trade = useCallback(async () => {
    const h = holdRef.current;
    const pick = selectedRef.current;
    if (!h || !pick) return;
    if (phaseRef.current === 'picking') {
      // Step one of two: the sheet turns into "Give your X for the Y?" with the timer still running.
      confirmAt.current = Date.now();
      setPhase('confirming');
      beat('ui.select', { volume: 0.9, pitch: 5 }, 'tapLight', 1);
      return;
    }
    if (phaseRef.current === 'confirming' && Date.now() - confirmAt.current < CONFIRM_GUARD_MS) return;
    if (phaseRef.current !== 'confirming' && phaseRef.current !== 'failed') return;
    if (Date.now() >= h.deadline) { onExpire(); return; }
    setPhase('sending');
    beat('ui.confirm', { volume: 0.9 }, 'hitMedium', 2);
    try {
      await acceptPinSwap(h.swap.id, pick.id);
      const root = rootOffset.current;
      const shift = (r?: SlotRect) => (r ? { ...r, x: r.x - root.x, y: r.y - root.y } : undefined);
      setDone({ got: h.swap.pin.item, gave: pick, from: { get: shift(slotsRef.current.get), give: shift(slotsRef.current.give) } });
      setLastGiven(pick.id);
      // The sheet hands its two pins to the trade-complete moment; it fades out in place once the
      // moment is on screen (onCelebrationStart), so the board never shows bright in between.
      sessionTrades += 1;
      warmPinImages([h.swap.pin.item.icon_url, pick.icon_url]);
    } catch (error) {
      const kind = classifyTradeError(error);
      if (kind === 'owned') {
        // Already yours: no pin of yours can fix that, so end the trade kindly (no buzz) and go back to the board.
        void unHoldPinSwap(h.swap.id).catch(() => undefined);
        setHold(null);
        setSelected(undefined);
        beat('ui.modalClose', { volume: 0.6 });
        gameAlert(COPY.ownedTitle, COPY.ownedEndMessage, undefined, { icon: 'info' });
        void loadBoard('refresh');
        return;
      }
      beat('fx.nope', { volume: 0.7 }, 'failBuzz', 2);
      setPhase(kind === 'taken' ? 'taken' : 'failed');
    }
  }, [loadBoard, onExpire, showError]);

  const onTradePress = useCallback(() => { void trade(); }, [trade]);

  const onCelebrationStart = useCallback(() => { sheetFade.value = withTiming(0, { duration: 200 }); }, [sheetFade]);

  const backToPicking = useCallback(() => {
    if (phaseRef.current !== 'confirming') return;
    setPhase('picking');
    beat('ui.modalClose', { volume: 0.6 });
  }, []);

  const finishCelebration = useCallback(() => {
    setDone(null);
    setHold(null);
    setSelected(undefined);
    // Your pins changed (one out, one in); refresh both after the fade, then show them together
    // so the board never renders a pin you now own without its Got it ribbon.
    finishTimer.current = setTimeout(() => {
      setRefreshing(true);
      void Promise.all([getPinSwaps(), loadPins(true, true)]).then(([swaps]) => {
        setBoard(swaps.map(boardEntry));
        setBoardState('ready');
      }).catch(() => undefined).finally(() => setRefreshing(false));
    }, 240);
  }, [loadPins]);

  const timerLabel = useCallback((clock: string, minutes: number, seconds: string) => {
    const template = labels.trade_expiration;
    return template ? vsprintf(template, [minutes, seconds]) : `Your trade will expire in ${clock}`;
  }, [labels.trade_expiration]);

  const onRetryPins = useCallback(() => { void loadPins(true, true); }, [loadPins]);
  const onMorePins = useCallback(() => { void loadPins(false); }, [loadPins]);
  const onSlot = useCallback((which: 'get' | 'give', rect: SlotRect) => { slotsRef.current[which] = rect; }, []);
  const onRootLayout = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => { rootOffset.current = { x, y }; });
  }, []);

  const givable = useMemo(() => (hold ? givablePins(pins, hold.swap.pin.item.id) : []), [pins, hold]);
  const pagePad = SPACE.lg;
  const panelInner = Math.min(width, 560) - pagePad * 2 - SPACE.md * 2 - OUTLINE.heavy * 2;
  const cellWidth = Math.floor((panelInner - SPACE.sm * (COLUMNS - 1)) / COLUMNS);
  const cardHeight = Math.round(cellWidth * 0.72) + 62;
  const rows = Math.ceil(board.length / COLUMNS);
  const lagFor = (i: number) => (i % COLUMNS) * 0.07 + Math.floor(i / COLUMNS) * 0.1;
  const lagSpan = lagFor((rows - 1) * COLUMNS + COLUMNS - 1);
  const stepPin = board[0]?.pin.item;

  // ---- Every hook is above this line. ----

  const topbar = (
    <Topbar>
      <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
      <TopbarColumn><TopbarText>Pin Trading</TopbarText></TopbarColumn>
      <TopbarColumn stretch={false}><InformationModal id={InformationModalEnums.PinSwapsScreen} /></TopbarColumn>
    </Topbar>
  );

  if (!signedIn) {
    return (
      <>
        {topbar}
        <View style={styles.body}>
          <PageWash />
          <View style={styles.signedOut}>
            <Image source={LANYARD} style={{ width: 140, height: 148 }} contentFit="contain" />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.signedOutTitle}>{COPY.signedOutTitle}</Text>
            <GameButton label={COPY.signIn} onPress={() => RootNavigation.navigate('Login')} />
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={styles.root} ref={rootRef} onLayout={onRootLayout} collapsable={false}>
      <View accessibilityElementsHidden={!!hold || !!done} importantForAccessibility={hold || done ? 'no-hide-descendants' : 'auto'}>{topbar}</View>
      <View style={styles.body}>
        <PageWash />
        <ScrollView
          accessibilityElementsHidden={!!hold || !!done}
          importantForAccessibility={hold || done ? 'no-hide-descendants' : 'auto'}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: pagePad }]}
          refreshControl={<RefreshControl refreshing={refreshing && !hold && !done} onRefresh={() => void loadBoard('refresh')} tintColor={BRAND.white} />}
          scrollEnabled={!hold && !done}
        >
          <Animated.View entering={still ? undefined : FadeInDown.duration(260)} style={styles.hero}>
            <View style={styles.heroRow}>
              <Image source={LANYARD} style={styles.heroArt} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.eyebrow}>{COPY.boardEyebrow}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.heroTitle}>{COPY.boardTitle}</Text>
              </View>
            </View>
            <View style={styles.steps} accessible accessibilityLabel={COPY.steps.map((s, i) => `${i + 1}. ${s.label}`).join('. ')}>
              {COPY.steps.map((step, i) => (
                <View key={step.label} style={styles.stepWrap}>
                  <View style={styles.step}>
                    <View style={styles.stepArt}>
                      {i === 0 && stepPin
                        ? <EnamelPin uri={stepPin.icon_url} size={34} tilt={-6} surface="none" recyclingKey="step-pin" />
                        : <GameIcon name={i === 0 ? 'star' : step.icon} size={32} />}
                    </View>
                    <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.stepText}>{step.label}</Text>
                  </View>
                  {i < COPY.steps.length - 1 && <View style={styles.stepDot} />}
                </View>
              ))}
            </View>
          </Animated.View>

          <View style={styles.boardFrame}>
            <ImageBackground source={CORK} resizeMode="repeat" style={styles.cork} imageStyle={{ borderRadius: RADIUS.lg - 4 }}>
              {boardState === 'loading' && <SharkLoader onRetry={() => void loadBoard('first')} style={styles.loader} />}
              {boardState === 'error' && <BoardState kind="error" onPress={() => void loadBoard('first')} />}
              {boardState === 'ready' && board.length === 0 && <BoardState kind="empty" onPress={() => void loadBoard('refresh')} />}
              {boardState === 'ready' && board.length > 0 && (
                <>
                  <View style={styles.countChip}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.countText}>{COPY.boardCount(board.length)}</Text>
                  </View>
                  <View style={styles.grid}>
                    {board.map((swap, i) => (
                      <Animated.View key={swap.id} entering={still ? undefined : FadeIn.delay(60 + i * 45).duration(220)}
                        style={done && hold?.swap.id === swap.id ? { opacity: 0 } : undefined}>
                        <BoardPinCard item={swap.pin.item} swapId={swap.id} width={cellWidth} height={cardHeight} shine={shine}
                          lag={lagFor(i)} lagSpan={lagSpan} still={still} badge={badgeFor(swap.pin.item)}
                          busy={busyId === swap.id || hold?.swap.id === swap.id} onPress={onBoardPress} />
                      </Animated.View>
                    ))}
                  </View>
                </>
              )}
            </ImageBackground>
          </View>

          {boardState === 'ready' && board.length > 0 && (
            <View style={styles.footer}>
              <GameButton size="compact" icon="retry" label={COPY.shuffle} accessibilityHint={COPY.shuffleHint}
                onPress={() => { beat('ui.select', { volume: 0.7 }); void loadBoard('refresh'); }} disabled={refreshing} />
            </View>
          )}
        </ScrollView>

        {hold && (
          <Animated.View style={[StyleSheet.absoluteFill, sheetFadeStyle]} pointerEvents={done ? 'none' : 'box-none'} accessibilityViewIsModal={!done}
            accessibilityElementsHidden={!!done} importantForAccessibility={done ? 'no-hide-descendants' : 'auto'}>
          <TradeSheet
            swap={hold.swap}
            phase={phase}
            deadline={hold.deadline}
            totalMs={hold.totalMs}
            pins={givable}
            pinsLoading={pinsLoading}
            pinsError={pinsError}
            selected={selected}
            still={still}
            timerLabel={timerLabel}
            tradeLabel={labels.trade_pin || 'Trade Pin'}
            onSelect={onSelect}
            onTrade={onTradePress}
            onClose={closeSheet}
            onBack={backToPicking}
            onHoldAgain={onHoldAgain}
            onExpire={onExpire}
            onTick={onTick}
            onRetryPins={onRetryPins}
            onMorePins={onMorePins}
            onSlot={onSlot}
            handedOff={!!done}
          />
          </Animated.View>
        )}
      </View>
      {done && <SwapCelebration got={done.got} gave={done.gave} from={done.from} still={still} onDone={finishCelebration}
        onStart={onCelebrationStart} tradeNumber={sessionTrades} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, marginTop: -8 },
  scroll: { paddingTop: SPACE.lg + 8, paddingBottom: SPACE.xxl * 2, gap: SPACE.lg, alignSelf: 'center', width: '100%', maxWidth: 560 },
  hero: {
    backgroundColor: TRADE_SURFACE.panel, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.white,
    padding: SPACE.md, gap: SPACE.md, ...SHADOW.card,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  heroArt: { width: 74, height: 78 },
  eyebrow: { fontFamily: FONT.body, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', color: TRADE_SURFACE.inkGold },
  heroTitle: { fontFamily: FONT.display, fontSize: 26, lineHeight: 30, color: BRAND.white, paddingTop: 2 },
  steps: { flexDirection: 'row', alignItems: 'stretch' },
  stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  step: { flex: 1, alignItems: 'center', gap: SPACE.xs },
  stepArt: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: TRADE_SURFACE.well, borderWidth: OUTLINE.thin, borderColor: 'rgba(255,255,255,0.6)',
  },
  stepText: { fontFamily: FONT.body, fontSize: 15, lineHeight: 18, color: BRAND.white, textAlign: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND.gold, marginTop: -26 },
  boardFrame: {
    borderRadius: RADIUS.lg, borderWidth: OUTLINE.heavy, borderColor: BRAND.white, backgroundColor: '#c8975a', ...SHADOW.lifted,
  },
  cork: { padding: SPACE.md, borderRadius: RADIUS.lg - 4, overflow: 'hidden' },
  loader: { paddingVertical: SPACE.xxl, minHeight: 300 },
  boardState: { alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl },
  boardStateCard: {
    backgroundColor: BRAND.cream, borderRadius: RADIUS.md, borderWidth: OUTLINE.thin, borderColor: BRAND.creamDeep,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, alignItems: 'center', gap: SPACE.xs, maxWidth: 300, ...SHADOW.card,
  },
  boardStateTitle: { fontFamily: FONT.display, fontSize: 22, lineHeight: 27, color: BRAND.navy, textAlign: 'center', paddingTop: 2 },
  boardStateBody: { fontFamily: FONT.body, fontSize: 16, lineHeight: 20, color: BRAND.navySoft, textAlign: 'center' },
  countChip: {
    alignSelf: 'center', backgroundColor: 'rgba(5,52,110,0.86)', borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: 6,
    marginBottom: SPACE.md,
  },
  countText: { fontFamily: FONT.display, fontSize: 15, letterSpacing: 0.6, color: BRAND.white, textTransform: 'uppercase', paddingTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, rowGap: SPACE.md },
  footer: { alignItems: 'center' },
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, padding: SPACE.xl },
  signedOutTitle: { fontFamily: FONT.display, fontSize: 26, lineHeight: 31, color: BRAND.white, textAlign: 'center' },
});
