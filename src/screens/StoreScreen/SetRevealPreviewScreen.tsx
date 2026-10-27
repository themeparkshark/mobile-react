/**
 * Dev-only capture of the shop set reward reveal (EXPO_PUBLIC_SET_REVEAL_PREVIEW=1, or the release share walk).
 * Never routed in a store build. Plays the full motion with a real set from /me/shop-sets (its pieces on the
 * player's shark) and a real XP before and after, so the capture matches a live claim. With no real set it
 * falls back to real items and art from the public CDN (Witch Hat, Ghost Costume, Ghost Blaster), so WEAR IT ALL
 * and the share picture still show a set. EXPO_PUBLIC_SET_REVEAL_STILL=1 shows the still (Reduce Motion) version.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { getShopSets } from '../../api/endpoints/me/shop-sets';
import SetCompleteReveal from './SetCompleteReveal';

const CDN = 'https://assets.themeparkshark.com/mobile/production/assets/';
const PIECES = [
  { id: 27, name: 'Witch Hat', item_type_id: 1, rarity: 2, icon_url: `${CDN}iLORCWVEYFnsRLPlofQCZzfxI9BD8NwLkDHeN9CA.png`, paper_url: `${CDN}oQi4oC4uE8tVRBP97LkCag19XCDCt4O6BLg04bwf.png`, no_eye_url: null, owned: true },
  { id: 219, name: 'Ghost Costume', item_type_id: 4, rarity: 4, icon_url: `${CDN}u8crgkdZZtxE61u9UIIvGAdnidYDdrulmBtsQOn9.png`, paper_url: `${CDN}sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO.png`, no_eye_url: null, owned: true },
  { id: 434, name: 'Ghost Blaster', item_type_id: 5, rarity: 4, icon_url: `${CDN}QHglR8cVgQLS6KHrTDgZ3gazzgeogUMFHKCAJlvj.png`, paper_url: `${CDN}2IPHn8UVfl5hHN2wdayZWq8ZiqZTEmKwnMv5pkIn.png`, no_eye_url: null, owned: true },
];
const FALLBACK_SET = { slug: 'preview-set', name: 'Spooky Squad', color: '#F28C28', item_ids: PIECES.map(p => p.id), owned_ids: PIECES.map(p => p.id),
  pieces: PIECES, total: PIECES.length, xp_reward: 160, blurb: null, season: null } as unknown as ShopSetSummary;

function rewardFor(set: ShopSetSummary): ShopSetReward {
  return {
    // The fallback set has no real slug for the title save, so it gets no title.
    slug: set.slug, name: set.name, title: set === FALLBACK_SET ? null : `${set.name} Star`, xp: set.xp_reward || 160,
    item_ids: (set.pieces ?? []).map(piece => piece.id),
    xp_before: { level: 4, experience: 300, needed: 500 },
    xp_after: { level: 4, experience: 460, needed: 500 },
  };
}

export default function SetRevealPreviewScreen() {
  const [set, setSet] = useState<ShopSetSummary | null>(null);
  const [run, setRun] = useState(0);
  const [open, setOpen] = useState(false);
  const still = process.env.EXPO_PUBLIC_SET_REVEAL_STILL === '1';
  useEffect(() => {
    let live = true;
    getShopSets()
      .then(data => { if (live) setSet(data.sets.find(s => (s.pieces?.length ?? 0) > 1) ?? FALLBACK_SET); })
      .catch(() => { if (live) setSet(FALLBACK_SET); })
      .finally(() => { if (live) setOpen(true); });
    return () => { live = false; };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: '#0768b9', alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={() => { setOpen(true); setRun(r => r + 1); }} style={{ padding: 20 }}>
        <Text style={{ color: '#fff', fontSize: 20 }}>{open ? '' : 'DEV: reveal closed (tap to replay)'}</Text>
      </Pressable>
      {open && set && <SetCompleteReveal key={run} reward={rewardFor(set)} set={set} still={still} onDone={() => setOpen(false)} />}
    </View>
  );
}
