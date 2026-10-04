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
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation, FadeIn, FadeInDown, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
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
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { queueHaptic } from '../gamekit/Haptics';
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
import { BoardPinCard, MAX_FONT, PageWash, type SlotRect, TRADE_SURFACE } from './pinTrading/PinTradeParts';
import {
  boardEntry, classifyTradeError, givablePins, holdLengthMs, isHolding, mergePins, PIN_TRADE_COPY as COPY, pinName, type TradePhase,
} from './pinTrading/pinTradeModel';
import SwapCelebration from './pinTrading/SwapCelebration';
import TradeSheet from './pinTrading/TradeSheet';

const CORK = require('../../assets/images/screens/pin-swaps/corkboard.png');
const LANYARD = require('../../assets/images/screens/social/pin_swaps.png');
const SND_SELECT = require('../../assets/sounds/pin_swap_select_pin.mp3');
const SND_CONFIRM = require('../../assets/sounds/pin_swap_confirm.mp3');
const SND_CANCEL = require('../../assets/sounds/purchase_item_cancel.mp3');
const SND_OPEN = require('../../assets/sounds/modal_open.mp3');
const SND_CLOSE = require('../../assets/sounds/modal_close.mp3');
const SND_NOPE = require('../../assets/sounds/nope.mp3');

const COLUMNS = 3;

type Hold = { swap: PinSwapType; deadline: number; totalMs: number };
type Done = { got: ItemType; gave: ItemType; from: { get?: SlotRect; give?: SlotRect } };

export default function PinSwapsScreen() {
  const { hasPermission } = usePermissions();
  const signedIn = hasPermission(PermissionEnums.TradePins);
  const { labels, errors } = useCrumbs();
  const { playSound } = useContext(SoundEffectContext);
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
  const [selected, setSelected] = useState<ItemType>();
  const [done, setDone] = useState<Done | null>(null);
  const shine = useSharedValue(0);
  const holdRef = useRef<Hold | null>(null);
  const slotsRef = useRef<{ get?: SlotRect; give?: SlotRect }>({});
  const phaseRef = useRef<TradePhase>('loading');
  const pinsPage = useRef({ next: 1, finished: false, loading: false, token: 0 });
  holdRef.current = hold;
  phaseRef.current = phase;

  const loadBoard = useCallback(async (mode: 'first' | 'refresh') => {
    if (mode === 'first') setBoardState('loading');
    else setRefreshing(true);
    try {
      const swaps = await getPinSwaps();
      setBoard(swaps.map(boardEntry));
      setBoardState('ready');
    } catch {
      setBoardState(prev => (mode === 'refresh' && prev === 'ready' ? 'ready' : 'error'));
      if (mode === 'refresh') gameAlert(COPY.networkTitle, COPY.networkMessage, undefined, { icon: 'info' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadPins = useCallback(async (reset: boolean) => {
    const page = pinsPage.current;
    if (reset) { page.next = 1; page.finished = false; page.token += 1; page.loading = false; setPins([]); }
    if (page.loading || page.finished) return;
    page.loading = true;
    const token = page.token;
    setPinsLoading(true);
    setPinsError(false);
    try {
      const rows = await getPins(page.next);
      if (token !== page.token) return;
      page.next += 1;
      if (rows.length === 0) page.finished = true;
      setPins(prev => mergePins(prev, rows));
    } catch {
      if (token === page.token) setPinsError(true);
    } finally {
      if (token === page.token) { page.loading = false; setPinsLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (signedIn) void loadBoard('first');
  }, [signedIn, loadBoard]);

  // One shine for the whole board: a slow wave every few seconds while the board is in view.
  const boardActive = focused && !hold && !done && !still && boardState === 'ready';
  useEffect(() => {
    cancelAnimation(shine);
    shine.value = 0;
    if (!boardActive) return;
    shine.value = withDelay(500, withRepeat(withSequence(withTiming(1, { duration: 1700 }), withDelay(4300, withTiming(0, { duration: 0 }))), -1, false));
    return () => cancelAnimation(shine);
  }, [boardActive, shine]);

  // Let the pin go back on the board if the player leaves mid-trade.
  useEffect(() => () => {
    const h = holdRef.current;
    if (h && isHolding(phaseRef.current)) {
      void unHoldPinSwap(h.swap.id).catch(() => undefined);
    }
  }, []);

  const showError = useCallback((error: unknown) => {
    const kind = classifyTradeError(error);
    playSound(SND_NOPE);
    queueHaptic('failBuzz', 2);
    if (kind === 'taken') gameAlert(COPY.takenTitle, errors.pin_swap_unavailable || 'Someone else is trading for this pin right now.', undefined, { icon: 'lock' });
    else if (kind === 'owned') gameAlert(COPY.ownedTitle, COPY.ownedMessage, undefined, { icon: 'check' });
    else if (kind === 'network') gameAlert(COPY.networkTitle, COPY.networkMessage, undefined, { icon: 'info' });
    else gameAlert(COPY.genericTitle, COPY.genericMessage, undefined, { icon: 'info' });
    return kind;
  }, [errors.pin_swap_unavailable, playSound]);

  const startHold = useCallback(async (swapId: number) => {
    if (busyId != null || holdRef.current) return;
    const swap = board.find(s => s.id === swapId);
    if (!swap) return;
    setBusyId(swapId);
    playSound(SND_SELECT);
    try {
      const held = await holdPinSwap(swapId);
      const totalMs = holdLengthMs(held.held_from, held.held_to);
      setSelected(undefined);
      setPhase('picking');
      setHold({ swap: { ...swap, held_from: held.held_from, held_to: held.held_to }, deadline: Date.now() + totalMs, totalMs });
      playSound(SND_OPEN);
      void loadPins(true);
    } catch (error) {
      const kind = showError(error);
      if (kind === 'taken') void loadBoard('refresh');
    } finally {
      setBusyId(null);
    }
  }, [board, busyId, loadBoard, loadPins, playSound, showError]);

  const closeSheet = useCallback(() => {
    const h = holdRef.current;
    if (!h || phaseRef.current === 'sending') return;
    const ended = phaseRef.current === 'expired';
    if (!ended) void unHoldPinSwap(h.swap.id).catch(() => undefined);
    playSound(SND_CLOSE);
    setHold(null);
    setSelected(undefined);
    pinsPage.current.token += 1;
    if (ended || phaseRef.current === 'failed') void loadBoard('refresh');
  }, [loadBoard, playSound]);

  const onExpire = useCallback(() => {
    const h = holdRef.current;
    if (!h || phaseRef.current === 'sending') return;
    setPhase('expired');
    playSound(SND_NOPE);
    queueHaptic('warning', 2);
    void unHoldPinSwap(h.swap.id).catch(() => undefined);
  }, [playSound]);

  const onSelect = useCallback((item: ItemType) => {
    if (phaseRef.current !== 'picking' && phaseRef.current !== 'confirming') return;
    setPhase('picking');
    setSelected(prev => (prev?.id === item.id ? prev : item));
    playSound(SND_SELECT);
    queueHaptic('tickSelection', 1);
  }, [playSound]);

  const trade = useCallback(async () => {
    const h = holdRef.current;
    if (!h || !selected) return;
    if (phaseRef.current === 'picking') {
      // Step one of two: the sheet turns into "Give your X for the Y?" with the timer still running.
      setPhase('confirming');
      playSound(SND_SELECT);
      queueHaptic('tapLight', 1);
      return;
    }
    if (phaseRef.current !== 'confirming' && phaseRef.current !== 'failed') return;
    if (Date.now() >= h.deadline) { onExpire(); return; }
    setPhase('sending');
    playSound(SND_CONFIRM);
    try {
      await acceptPinSwap(h.swap.id, selected.id);
      setDone({ got: h.swap.pin.item, gave: selected, from: { ...slotsRef.current } });
      // The sheet hands its two pins to the trade-complete moment, then fades under its sky.
      setTimeout(() => { setHold(null); setSelected(undefined); }, 320);
      setBoard(prev => prev.filter(s => s.id !== h.swap.id));
    } catch (error) {
      const kind = classifyTradeError(error);
      playSound(SND_NOPE);
      queueHaptic('failBuzz', 2);
      if (kind === 'taken' || kind === 'owned') {
        setPhase('expired');
        showError(error);
      } else setPhase('failed');
    }
  }, [onExpire, playSound, selected, showError]);

  const backToPicking = useCallback(() => {
    if (phaseRef.current !== 'confirming') return;
    setPhase('picking');
    playSound(SND_CANCEL);
  }, [playSound]);

  const finishCelebration = useCallback(() => {
    setDone(null);
    void loadBoard('refresh');
  }, [loadBoard]);

  const timerLabel = useCallback((clock: string, minutes: number, seconds: string) => {
    const template = labels.trade_expiration;
    return template ? vsprintf(template, [minutes, seconds]) : `Your trade will expire in ${clock}`;
  }, [labels.trade_expiration]);

  const givable = useMemo(() => (hold ? givablePins(pins, hold.swap.pin.item.id) : []), [pins, hold]);
  const pagePad = SPACE.lg;
  const panelInner = Math.min(width, 560) - pagePad * 2 - SPACE.md * 2 - OUTLINE.heavy * 2;
  const cellWidth = Math.floor((panelInner - SPACE.sm * (COLUMNS - 1)) / COLUMNS);
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
    <View style={styles.root}>
      {topbar}
      <View style={styles.body}>
        <PageWash />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: pagePad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBoard('refresh')} tintColor={BRAND.white} />}
          scrollEnabled={!hold && !done}
        >
          <Animated.View entering={still ? undefined : FadeInDown.duration(260)} style={styles.hero}>
            <View style={styles.heroRow}>
              <Image source={LANYARD} style={styles.heroArt} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.eyebrow}>{COPY.boardEyebrow}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroTitle}>{COPY.boardTitle}</Text>
              </View>
            </View>
            <View style={styles.steps} accessible accessibilityLabel={COPY.steps.map((s, i) => `${i + 1}. ${s.label}`).join('. ')}>
              {COPY.steps.map((step, i) => (
                <View key={step.label} style={styles.stepWrap}>
                  <View style={styles.step}>
                    <View style={styles.stepArt}>
                      {i === 0 && stepPin
                        ? <EnamelPin uri={stepPin.icon_url} size={34} tilt={-6} recyclingKey="step-pin" />
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
              {boardState === 'loading' && <SharkLoader compact onRetry={() => void loadBoard('first')} style={styles.boardState} />}
              {boardState === 'error' && <SharkLoader compact state="error" onRetry={() => void loadBoard('first')} style={styles.boardState} />}
              {boardState === 'ready' && board.length === 0 && (
                <SharkLoader compact state="empty" title={COPY.emptyTitle} message={COPY.emptyMessage}
                  action={{ label: COPY.emptyAction, icon: 'retry', onPress: () => void loadBoard('refresh') }} style={styles.boardState} />
              )}
              {boardState === 'ready' && board.length > 0 && (
                <>
                  <View style={styles.countChip}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.countText}>{COPY.boardCount(board.length)}</Text>
                  </View>
                  <View style={styles.grid}>
                    {board.map((swap, i) => (
                      <Animated.View key={swap.id} entering={still ? undefined : FadeIn.delay(60 + i * 45).duration(220)}>
                        <BoardPinCard item={swap.pin.item} swapId={swap.id} width={cellWidth} shine={shine}
                          lag={(i % COLUMNS) * 0.07 + Math.floor(i / COLUMNS) * 0.1} still={still}
                          busy={busyId === swap.id || hold?.swap.id === swap.id} onPress={startHold} />
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
                onPress={() => { playSound(SND_SELECT); void loadBoard('refresh'); }} disabled={refreshing} />
            </View>
          )}
        </ScrollView>

        {hold && (
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
            shine={undefined}
            timerLabel={timerLabel}
            tradeLabel={labels.trade_pin || 'Trade Pin'}
            onSelect={onSelect}
            onTrade={() => void trade()}
            onClose={closeSheet}
            onSlot={(which, rect) => { slotsRef.current[which] = rect; }}
            handedOff={!!done}
            onBack={backToPicking}
            onExpire={onExpire}
            onRetryPins={() => void loadPins(true)}
            onMorePins={() => void loadPins(false)}
          />
        )}
      </View>
      {done && <SwapCelebration got={done.got} gave={done.gave} from={done.from} still={still} onDone={finishCelebration} />}
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
  cork: { padding: SPACE.md, borderRadius: RADIUS.lg - 4, overflow: 'hidden', minHeight: 320 },
  boardState: { paddingVertical: SPACE.xxl },
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
