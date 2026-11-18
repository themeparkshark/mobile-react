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
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { haptic } from '../../gamekit/Haptics';
import * as RootNavigation from '../../RootNavigation';
import { flagOn, loadRetentionFlags, retentionFlagsNow } from '../../services/retention/flags';
import { pictureOnlyFor } from '../../services/playPrefs';
import { loadLastCrew } from '../../services/lineplay/lineGroupStore';
import { hasKids } from '../../services/lineplay/lineGroup';
import { useMoneyFlag } from '../../services/money/flags';
import {
  OFFER_COPY, loadOfferRecords, localDay, markDismissed, markShown, offerDecision, saveOfferRecord,
  type OfferPlacement, type OfferRecord,
} from '../../services/money/naturalOffers';
import { isParkDay, isStarter } from '../../services/money/suppliesPlan';
import { buyPack, outcomeMessage, useSupplies } from '../../services/money/supplies';
import { trackImpression } from '../../services/money/track';
import { storeAvailable } from '../../services/purchases';
import { openMembership } from '../GrownUpGate';
import { BRAND, FONT, GameIcon, gameAlert } from '../../ui';
import { Contents, GotIt, MAX_FONT, PackArt, type PackArtKey } from './moneyUi';

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

export type CalmOfferProps = {
  readonly placement: OfferPlacement;
  /** The card this sits on is a loss card: the offer never shows there. */
  readonly loss?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  /** Told once whether the offer shows (a host can keep its layout calm). */
  readonly onShown?: (shown: boolean) => void;
};

export default function CalmOffer({ placement, loss = false, style, onShown }: CalmOfferProps) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const switchOn = useNaturalOffersSwitch();
  const passOn = useMoneyFlag('shark_pass');
  const playerId = player?.id ?? null;
  const vip = !!player?.is_subscribed;
  const wantsPack = placement === 'need_ticket' || placement === 'first_win';
  const canBuy = !!player && storeAvailable();
  const { catalog } = useSupplies(switchOn && wantsPack && canBuy && !loss);
  // The kid paths and this placement's own record, read once per mount.
  const [ctx, setCtx] = useState<{ kids: boolean; picture: boolean; record: OfferRecord | null } | null>(null);
  useEffect(() => {
    if (playerId == null || !switchOn || loss) return undefined;
    let live = true;
    void Promise.all([
      loadLastCrew(Number(playerId)).catch(() => null),
      pictureOnlyFor(Number(playerId)).catch(() => false),
      loadOfferRecords(playerId),
    ]).then(([crew, picture, records]) => {
      if (live) setCtx({ kids: crew?.kind === 'family' && hasKids(crew), picture: !!picture, record: records[placement] ?? null });
    });
    return () => { live = false; };
  }, [playerId, switchOn, loss, placement]);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [landed, setLanded] = useState<{ grants: Record<string, number>; art: PackArtKey } | null>(null);

  const today = catalog?.day ?? localDay(Date.now());
  const pack = placement === 'need_ticket' ? catalog?.products.find(p => isParkDay(p) && p.available)
    : placement === 'first_win' ? catalog?.products.find(p => isStarter(p) && p.available && !catalog.starter_seen_at) : undefined;
  const contentReady = placement === 'win_vip' ? !vip
    : placement === 'high_point' ? passOn
      : !!catalog?.enabled && !!pack;
  const why = offerDecision({ placement, switchOn, loss, familyWithKids: ctx?.kids, pictureGames: ctx?.picture, vip,
    today, now: Date.now(), record: ctx?.record });
  const show = !gone && !!player && !!ctx && why === 'show' && contentReady && (placement === 'high_point' || placement === 'win_vip' || canBuy);

  // Seen only once it really showed with its content: a slow load never burns the day (or the once-ever Starter Pack).
  useEffect(() => {
    if (!show || playerId == null) return;
    void saveOfferRecord(playerId, placement, markShown(ctx?.record, today, Date.now()));
    trackImpression(`offer.${placement}`, pack?.product_id);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const decided = loss || !switchOn ? false : ctx ? show : null;
  useEffect(() => { if (decided !== null) onShown?.(decided); }, [decided]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    haptic('tapLight');
    setGone(true);
    if (playerId != null) void saveOfferRecord(playerId, placement, markDismissed(ctx?.record, Date.now()));
  };

  const act = async () => {
    if (busy) return;
    haptic('tapLight');
    if (placement === 'win_vip') { void openMembership(); return; }
    if (placement === 'high_point') { RootNavigation.navigate('SharkPass'); return; }
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

  if (landed) return <GotIt grants={landed.grants} art={landed.art} onDone={() => setLanded(null)} />;
  if (!show) return null;

  if (placement === 'win_vip') {
    return (
      <Animated.View entering={FadeIn.delay(300).duration(220)} style={[st.vipLine, style]}>
        <Pressable onPress={() => void act()} accessibilityRole="button" style={st.vipTap}
          accessibilityLabel={`${OFFER_COPY.win_vip.line}. For grown-ups, opens VIP.`}>
          <GameIcon name="member" size={22} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipText}>{OFFER_COPY.win_vip.line}</Text>
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
  return (
    <Animated.View entering={FadeInUp.delay(200).springify().damping(16)} style={[st.wrap, style]}>
      <Pressable onPress={() => void act()} disabled={busy} accessibilityRole="button"
        accessibilityLabel={`${copy.kicker}. ${copy.title}.${'body' in copy ? ` ${copy.body}` : ''} ${copy.action}.`}
        style={({ pressed }) => [st.card, pressed && { transform: [{ translateY: 2 }] }]}>
        {placement === 'high_point' ? <GameIcon name="star" size={46} /> : <PackArt art={art} size={56} bob={false} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.kicker}>{copy.kicker.toUpperCase()}</Text>
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
  vipLine: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, backgroundColor: '#123f80', borderRadius: 999,
    borderWidth: 2, borderColor: BRAND.gold, paddingLeft: 10, paddingRight: 8, paddingVertical: 5 },
  vipTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vipText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.gold },
});
