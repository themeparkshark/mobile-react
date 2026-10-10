/**
 * <MonthlyGiftCard />: the VIP member gift (once a month: coins and that month's members-only pin)
 * with the member calendar. Shows only while the server's monthly gift is on and the player is VIP.
 * Opening it is free (it's part of VIP), so there is no gate here.
 */
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { claimVipGift, getVipGift, type VipGiftState } from '../../api/endpoints/me/vip-gift';
import { AuthContext } from '../../context/AuthProvider';
import { BRAND, FONT, GameButton, GameIcon, gameAlert } from '../../ui';
import { GotIt, MAX_FONT } from './moneyUi';
import { FlexShareButton, SHARE_IN_MODALS, ShareStudioHost } from '../../share';

const PIN_ART: Record<string, number> = {
  'vip-pin-nov': require('../../../assets/images/sharkpass/vip-pin-nov.webp'),
  'vip-pin-dec': require('../../../assets/images/sharkpass/vip-pin-dec.webp'),
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-11' -> 'November'. Exported for tests. */
export function monthName(ym: string, short = false): string {
  const m = Number(ym.slice(5, 7));
  return (short ? MONTHS : FULL)[m - 1] ?? ym;
}

export default function MonthlyGiftCard() {
  const { player, refreshPlayer } = useContext(AuthContext);
  const [gift, setGift] = useState<VipGiftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<{ coins: number; pin: string | null; art: string | null } | null>(null);
  const load = useCallback(() => { void getVipGift().then(setGift); }, []);
  useEffect(() => { if (player?.is_subscribed) load(); }, [player?.is_subscribed, load]);
  if (!gift || !gift.enabled || !gift.member) return null;
  const art = gift.pin ? PIN_ART[gift.pin.art] : undefined;

  const open = async () => {
    setBusy(true);
    try {
      const res = await claimVipGift();
      setGift(res.gift);
      setLanded({ coins: res.granted.coins ?? 0, pin: gift.pin?.name ?? null, art: gift.pin?.art ?? null });
      void refreshPlayer?.().catch(() => undefined);
    } catch {
      gameAlert('That didn’t work', 'Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.card}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={st.head}>{`YOUR ${monthName(gift.month).toUpperCase()} GIFT`}</Text>
      <View style={st.row}>
        {art ? <Image source={art} style={st.pin} contentFit="contain" /> : <GameIcon name="gift" size={64} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.line}>{`${gift.coins.toLocaleString('en-US')} coins`}</Text>
          {gift.pin && <Text maxFontSizeMultiplier={MAX_FONT} style={st.line}>{gift.pin.name}</Text>}
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.note}>Members-only. A new one every month you’re VIP.</Text>
        </View>
      </View>
      {gift.claimed ? (
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.done}>Opened. Next gift on the 1st.</Text>
      ) : (
        <GameButton label="Open my gift" icon="gift" loading={busy} disabled={busy} onPress={() => void open()} />
      )}
      <View style={st.calendar}>
        {gift.calendar.map(m => (
          <View key={m.month} style={[st.day, m.claimed && st.dayDone, m.month === gift.month && st.dayNow]}>
            <Text maxFontSizeMultiplier={1.1} style={st.dayText}>{monthName(m.month, true)}</Text>
            <GameIcon name={m.claimed ? 'check' : m.month > gift.month ? 'lock' : 'gift'} size={18} />
          </View>
        ))}
      </View>
      {landed && (
        <GotIt grants={{ coins: landed.coins }} art="gift" title="Your VIP gift!"
          picture={landed.art && PIN_ART[landed.art] ? <Image source={PIN_ART[landed.art]} style={{ width: 170, height: 170 }} contentFit="contain" /> : undefined}
          caption={[`${landed.coins.toLocaleString('en-US')} coins`, landed.pin].filter(Boolean).join(' and ')}
          footer={SHARE_IN_MODALS && landed.pin && landed.art && PIN_ART[landed.art] ? (
            // Show off the month's members-only pin. No price, no "VIP costs".
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <FlexShareButton kind="find" surface="vip_gift" size="sm" caption
                payload={{ itemName: landed.pin, artUrl: PIN_ART[landed.art], rarity: 4, setName: `${monthName(gift.month, false)} member pin` }} />
              <ShareStudioHost portal />
            </View>
          ) : undefined}
          onDone={() => setLanded(null)} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { width: '100%', marginTop: 16, backgroundColor: '#123f80', borderRadius: 20, padding: 14, gap: 10, borderWidth: 4, borderColor: BRAND.gold },
  head: { fontFamily: FONT.display, fontSize: 19, color: BRAND.gold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pin: { width: 72, height: 72 },
  line: { fontFamily: FONT.display, fontSize: 17, color: '#ffffff' },
  note: { fontFamily: FONT.body, fontSize: 14, color: '#e2f6ff' },
  done: { fontFamily: FONT.display, fontSize: 15, color: '#7dffb0', textAlign: 'center' },
  calendar: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  day: { width: 58, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  dayDone: { backgroundColor: 'rgba(125,255,176,0.15)' },
  dayNow: { borderColor: BRAND.gold },
  dayText: { fontFamily: FONT.display, fontSize: 13, color: '#ffffff' },
});
