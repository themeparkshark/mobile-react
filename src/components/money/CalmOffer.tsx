/**
 * <CalmOffer placement="need_ticket" loss={false} />: the one calm paid offer for a natural moment
 * (fix round w3, T220 and T230). Every rule lives in services/money/naturalOffers.ts (tested):
 * the served natural_offers switch, never on a loss card, never on a kid path (Family with kids,
 * Picture games), once per placement per day (the Starter Pack once ever), a remembered "Not now",
 * no urgency words. No price on the card: a grown-up answers the gate first and the gate's details
 * card says the price.
 *
 * Placements (the screens that own these moments mount it; see the lane result's needs_wire):
 * - need_ticket: today's Park Day Pack as one row in NEED A TICKET? (after the free ways).
 * - first_win: the Starter Pack card in the first-win recap, once ever.
 * - high_point: the Shark Pass card at a high point (park-day story, Daily 3 chest).
 * - win_vip: one line on the win card for a non-member: VIP doubles this.
 */
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { haptic } from '../../gamekit/Haptics';
import * as RootNavigation from '../../RootNavigation';
import { flagOn, loadRetentionFlags, retentionFlagsNow } from '../../services/retention/flags';
import { pictureOnlyFor } from '../../services/playPrefs';
import { loadLastCrew } from '../../services/lineplay/lineGroupStore';
import { hasKids } from '../../services/lineplay/lineGroup';
import { useMoneyFlag } from '../../services/money/flags';
import {
  OFFER_COPY, loadOfferRecords, localDay, markDismissed, markShown, offerDecision, passOfferReady, saveOfferRecord,
  type OfferPlacement, type OfferRecord,
} from '../../services/money/naturalOffers';
import { isParkDay, isStarter } from '../../services/money/suppliesPlan';
import { buyPack, outcomeMessage, refreshSupplies, useSupplies } from '../../services/money/supplies';
import { trackImpression, trackMoney } from '../../services/money/track';
import { storeAvailable } from '../../services/purchases';
import { openMembership } from '../GrownUpGate';
import { getSharkPass } from '../../api/endpoints/me/shark-pass';
import { BRAND, FONT, GameIcon, gameAlert } from '../../ui';
import { Contents, GotIt, MAX_FONT, PackArt, useRowEntrance, type PackArtKey } from './moneyUi';

/** Dev captures only (tools/capture, never in a store bundle): read natural_offers as on. */
function devSwitch(): boolean {
  if (!__DEV__) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../../../tools/capture/moneyCapture') as typeof import('../../../tools/capture/moneyCapture')).captureNaturalOffers();
  } catch {
    return false;
  }
}

/** The served natural_offers switch, read the way the app reads daily_three (absent reads as off). */
export function useNaturalOffersSwitch(): boolean {
  const [on, setOn] = useState(() => devSwitch() || flagOn(retentionFlagsNow(), 'natural_offers'));
  useEffect(() => {
    if (on) return undefined;
    let live = true;
    void loadRetentionFlags().then(flags => { if (live && flagOn(flags, 'natural_offers')) setOn(true); });
    return () => { live = false; };
  }, [on]);
  return on;
}

type OfferCtx = { kids: boolean; picture: boolean; record: OfferRecord | null };
/**
 * The kid paths and each placement's record, kept in memory per player (fix pass w5, W4-SMOKE-3a): a card that opens
 * again today knows on its first frame whether its row shows, so the row never pops in, and never pops out, later.
 */
const ctxCache = new Map<string, OfferCtx>();
const ctxKey = (playerId: string | number, placement: OfferPlacement) => `${playerId}:${placement}`;

async function loadOfferCtx(playerId: string | number, placement: OfferPlacement): Promise<OfferCtx> {
  const [crew, picture, records] = await Promise.all([
    loadLastCrew(Number(playerId)).catch(() => null),
    pictureOnlyFor(Number(playerId)).catch(() => false),
    loadOfferRecords(playerId),
  ]);
  const ctx = { kids: crew?.kind === 'family' && hasKids(crew), picture: !!picture, record: records[placement] ?? null };
  ctxCache.set(ctxKey(playerId, placement), ctx);
  return ctx;
}

/**
 * Warm a placement before its host draws it (the coin card calls this as it opens with no Tickets): the record and
 * kid paths into memory and the shared Supplies catalog loading, so the NEED A TICKET row is known on its first frame.
 */
export function warmCalmOffer(playerId: string | number | null | undefined, placement: OfferPlacement): void {
  if (playerId == null) return;
  if (!ctxCache.has(ctxKey(playerId, placement))) void loadOfferCtx(playerId, placement).catch(() => undefined);
  if (placement === 'need_ticket' && storeAvailable()) void refreshSupplies();
}

/** The height of the slim row and of the place it keeps while its answer loads (pack art 40, padding 5 + 5, rim 2 + 4). */
export const SLIM_ROW_HEIGHT = 56;

export type CalmOfferProps = {
  readonly placement: OfferPlacement;
  /** The card this sits on is a loss card: the offer never shows there. */
  readonly loss?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  /** Told once whether the offer shows (a host can keep its layout calm). */
  readonly onShown?: (shown: boolean) => void;
  /**
   * win_vip only: this win's own line ("VIP doubles this: +60 Shark Coins, +50 XP", services/money/offers.ts
   * vipWinOffer). Null: nothing to say, so the line stays away. Left out: the plain line.
   */
  readonly vipLine?: string | null;
  /** Runs before another screen opens (a host sheet closes itself first). */
  readonly beforeLeave?: () => void;
  /**
   * One slim row (the win card, where the coin and its rewards come first): the pack art, its name and the
   * ask, with a small close in place of the Not now pill. The contents show on the gate's details card.
   */
  readonly compact?: boolean;
};

/**
 * P20 (bug 7): a win is the kid's moment, so no pack and no VIP line ever sits inside one. The two placements a win
 * card used (first_win, win_vip) never show, whoever mounts them.
 */
export function offerInsideWin(placement: OfferPlacement): boolean {
  return placement === 'first_win' || placement === 'win_vip';
}

export default function CalmOffer({ placement, loss = false, style, onShown, vipLine, beforeLeave, compact = false }: CalmOfferProps) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const switchOn = useNaturalOffersSwitch();
  const passOn = useMoneyFlag('shark_pass');
  const playerId = player?.id ?? null;
  const vip = !!player?.is_subscribed;
  const inWin = offerInsideWin(placement);
  const wantsPack = placement === 'need_ticket';
  const canBuy = !!player && storeAvailable();
  const { catalog, status: catalogStatus } = useSupplies(switchOn && wantsPack && canBuy && !loss);
  // The kid paths and this placement's own record, read once per mount.
  const [ctx, setCtx] = useState<OfferCtx | null>(() => (playerId == null ? null : ctxCache.get(ctxKey(playerId, placement)) ?? null));
  useEffect(() => {
    if (playerId == null || !switchOn || loss || inWin) return undefined;
    let live = true;
    void loadOfferCtx(playerId, placement).then((next) => { if (live) setCtx(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [playerId, switchOn, loss, placement]);
  /** Save a record and keep the memory copy in step, so the next card knows it on its first frame. */
  const keepRecord = (record: OfferRecord) => {
    if (playerId == null) return;
    const key = ctxKey(playerId, placement);
    const cached = ctxCache.get(key);
    if (cached) ctxCache.set(key, { ...cached, record });
    void saveOfferRecord(playerId, placement, record);
  };
  // high_point: the Shark Pass card only while the row is on sale and not owned (read once per mount).
  const [passReady, setPassReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (placement !== 'high_point' || !switchOn || !passOn || loss) return undefined;
    let live = true;
    void getSharkPass().then(state => { if (live) setPassReady(passOfferReady(state)); }).catch(() => { if (live) setPassReady(false); });
    return () => { live = false; };
  }, [placement, switchOn, passOn, loss]);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [landed, setLanded] = useState<{ grants: Record<string, number>; art: PackArtKey } | null>(null);

  const today = catalog?.day ?? localDay(Date.now());
  const pack = placement === 'need_ticket' ? catalog?.products.find(p => isParkDay(p) && p.available)
    : placement === 'first_win' ? catalog?.products.find(p => isStarter(p) && p.available && !catalog.starter_seen_at) : undefined;
  const vipText = vipLine === undefined ? OFFER_COPY.win_vip.line : vipLine;
  const contentReady = placement === 'win_vip' ? !vip && !!vipText
    : placement === 'high_point' ? passOn && passReady === true
      : !!catalog?.enabled && !!pack;
  const why = offerDecision({ placement, switchOn, loss, familyWithKids: ctx?.kids, pictureGames: ctx?.picture, vip,
    today, now: Date.now(), record: ctx?.record });
  const show = !inWin && !gone && !!player && !!ctx && why === 'show' && contentReady && (placement === 'high_point' || placement === 'win_vip' || canBuy);

  // Seen only once it really showed with its content: a slow load never burns the day (or the once-ever Starter Pack).
  useEffect(() => {
    if (!show || playerId == null) return;
    keepRecord(markShown(ctx?.record, today, Date.now()));
    trackImpression(`offer.${placement}`, pack?.product_id);
    // The Starter Pack's one showing (hold-fix 3): the server sets starter_seen_at, so "once ever" holds on every
    // phone and money:launch-funnel counts it (only the unmounted StarterOfferCard sent this before).
    if (placement === 'first_win' && pack) trackMoney('starter_seen', `offer.${placement}`, pack.product_id);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const decided = inWin || loss || !switchOn || (placement === 'win_vip' && !vipText) || (placement === 'high_point' && (!passOn || passReady === false)) ? false
    : ctx && (placement !== 'high_point' || passReady !== null) ? show : null;
  useEffect(() => { if (decided !== null) onShown?.(decided); }, [decided]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    haptic('tapLight');
    setGone(true);
    keepRecord(markDismissed(ctx?.record, Date.now()));
  };

  const act = async () => {
    if (busy) return;
    haptic('tapLight');
    // Busy from the tap itself (fix pass w4, N02): the row says it heard the press while the grown-up gate comes up.
    if (placement !== 'win_vip' && placement !== 'high_point' && pack) setBusy(true);
    // Both doors open a pitch page (pitch first, Oct 8): its every real-money Buy asks a grown-up fresh there.
    // A host sheet closes first, so the page never opens under it.
    if (placement === 'win_vip') { beforeLeave?.(); void openMembership(); return; }
    if (placement === 'high_point') { beforeLeave?.(); RootNavigation.navigate('SharkPass'); return; }
    if (!pack) return;
    // The one gated buy path: a grown-up answers first; the price shows only on the gate's details card.
    const outcome = await buyPack(pack, { onStart: () => setBusy(true), placement: `offer.${placement}` });
    setBusy(false);
    if (outcome.status === 'success') {
      await refreshPlayer?.().catch(() => undefined);
      setGone(true);
      setLanded({ grants: outcome.result.results[0]?.granted ?? pack.grants, art: placement === 'first_win' ? 'chest' : 'bag' });
      return;
    }
    const message = outcomeMessage(outcome, null);
    if (message) gameAlert(message.title, message.body);
  };

  // W4-SMOKE-3a: while this row's answer is still loading, the NEED A TICKET card keeps its place with a calm picture of
  // the same height (the pack art on the row's own navy), never a blank gap and never a jump when the row arrives.
  const answerPending = placement === 'need_ticket' && compact && !gone && !!player && switchOn && !loss && canBuy
    && (ctx == null || (why === 'show' && !catalog && catalogStatus !== 'error'));
  const [keptPlace, setKeptPlace] = useState(answerPending);
  useEffect(() => { if (answerPending) setKeptPlace(true); }, [answerPending]);
  const enterStyle = useRowEntrance(show, keptPlace ? 0 : placement === 'win_vip' ? 300 : 160);
  if (landed) return <GotIt grants={landed.grants} art={landed.art} onDone={() => setLanded(null)} />;
  if (!show) {
    if (!answerPending) return null;
    return (
      <View style={[st.slim, st.slimKept, style]} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <View style={st.keptArt}><PackArt art="bag" size={40} bob={false} /></View>
      </View>
    );
  }

  if (placement === 'win_vip') {
    return (
      <Animated.View style={[st.vipLine, style, enterStyle]}>
        <Pressable onPress={() => void act()} accessibilityRole="button" style={st.vipTap}
          accessibilityLabel={`${vipText}. For grown-ups, opens VIP.`}>
          <GameIcon name="member" size={22} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{vipText}</Text>
          <GameIcon name="arrow" size={14} />
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now">
          <GameIcon name="close" size={18} />
        </Pressable>
      </Animated.View>
    );
  }

  const copy = OFFER_COPY[placement];
  const art: PackArtKey = placement === 'first_win' ? 'chest' : 'bag';
  if (compact) {
    return (
      <Animated.View style={[st.slim, style, enterStyle]}>
        <Pressable onPress={() => void act()} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }}
          style={({ pressed }) => [st.slimTap, pressed && st.slimPressed, busy && st.slimBusy]}
          accessibilityLabel={`${copy.kicker}. ${copy.title}. ${copy.action}.`}>
          {placement === 'high_point' ? <GameIcon name="star" size={34} /> : <PackArt art={art} size={40} bob={false} />}
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.kicker} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.kicker.toUpperCase()}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.slimTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.title}</Text>
          </View>
          {/* The kicker already says it is for grown-ups: the row's way on is one round arrow, so the name keeps the room. */}
          <View style={[st.slimAsk, busy && st.slimAskBusy]}>
            <GameIcon name="arrow" size={18} />
          </View>
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now">
          <GameIcon name="close" size={20} />
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[st.wrap, style, enterStyle]}>
      <Pressable onPress={() => void act()} disabled={busy} accessibilityRole="button"
        accessibilityLabel={`${copy.kicker}. ${copy.title}.${'body' in copy ? ` ${copy.body}` : ''} ${copy.action}.`}
        style={({ pressed }) => [st.card, pressed && { transform: [{ translateY: 2 }] }]}>
        {placement === 'high_point' ? <GameIcon name="star" size={46} /> : <PackArt art={art} size={56} bob={false} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.kicker} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.kicker.toUpperCase()}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{copy.title}</Text>
          {'body' in copy ? <Text maxFontSizeMultiplier={MAX_FONT} style={st.body}>{copy.body}</Text>
            : pack ? <Contents grants={pack.grants} size="tight" /> : null}
        </View>
        <View style={st.ask}>
          <GameIcon name={placement === 'high_point' ? 'arrow' : 'member'} size={20} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.askText} numberOfLines={2}>{busy ? 'One moment' : copy.action.replace(/^(\S+ \S+) /, '$1\n')}</Text>
        </View>
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" style={st.notNow}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.notNowText}>Not now</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#123f80', borderRadius: 18, borderWidth: 3,
    borderColor: BRAND.gold, borderBottomWidth: 5, paddingHorizontal: 10, paddingVertical: 8 },
  kicker: { fontFamily: FONT.display, fontSize: 13, color: '#ffd34d' },
  title: { fontFamily: FONT.display, fontSize: 19, color: '#ffffff' },
  body: { fontFamily: FONT.body, fontSize: 14, color: '#e2f6ff' },
  ask: { width: 92, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)', paddingVertical: 6, paddingHorizontal: 4 },
  askText: { fontFamily: FONT.display, fontSize: 13, color: '#ffffff', textAlign: 'center' },
  // Its own small navy pill, so it reads on any host (cream ticket card or blue recap).
  notNow: { alignSelf: 'center', marginTop: 4, backgroundColor: '#123f80', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  notNowText: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
  slim: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', minHeight: SLIM_ROW_HEIGHT, backgroundColor: '#123f80', borderRadius: 16,
    borderWidth: 2, borderColor: BRAND.gold, borderBottomWidth: 4, paddingLeft: 8, paddingRight: 10, paddingVertical: 5 },
  // The place the row keeps while its answer loads: same navy and height, the pack art resting dim, no words.
  slimKept: { height: SLIM_ROW_HEIGHT, opacity: 0.55 },
  keptArt: { width: 40, height: 40, opacity: 0.6 },
  slimTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Pressed: the row dips under the finger. Busy (the gate is on its way): it rests a little dimmer, its arrow ringed in gold.
  slimPressed: { transform: [{ translateY: 2 }], opacity: 0.85 },
  slimBusy: { opacity: 0.8 },
  slimAskBusy: { borderColor: BRAND.gold, backgroundColor: 'rgba(255,207,59,0.22)' },
  slimTitle: { fontFamily: FONT.display, fontSize: 17, color: '#ffffff' },
  slimAsk: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  vipLine: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, maxWidth: '100%', backgroundColor: '#123f80', borderRadius: 999,
    borderWidth: 2, borderColor: BRAND.gold, paddingLeft: 10, paddingRight: 8, paddingVertical: 5 },
  vipTap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  vipText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.gold, flexShrink: 1, textAlign: 'center' },
});
