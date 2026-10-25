/**
 * Dev-only capture of the shop set reward reveal (EXPO_PUBLIC_SET_REVEAL_PREVIEW=1). Never routed in release.
 * Plays the full motion with a real set from /me/shop-sets (its pieces on the player's shark) and a real
 * XP before and after, so the capture matches a live claim. EXPO_PUBLIC_SET_REVEAL_STILL=1 shows the still
 * (Reduce Motion) version.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { getShopSets } from '../../api/endpoints/me/shop-sets';
import SetCompleteReveal from './SetCompleteReveal';

const FALLBACK_SET = { slug: 'preview-set', name: 'Spooky Squad', color: '#F28C28', item_ids: [], owned_ids: [], pieces: [],
  xp_reward: 160, blurb: null, season: null } as unknown as ShopSetSummary;

function rewardFor(set: ShopSetSummary): ShopSetReward {
  return {
    slug: set.slug, name: set.name, title: `${set.name} Star`, xp: set.xp_reward || 160,
    item_ids: (set.pieces ?? []).map(piece => piece.id),
    xp_before: { level: 4, experience: 300, needed: 500 },
    xp_after: { level: 4, experience: 460, needed: 500 },
  };
}

/** Release-like capture only: how long the reveal waits after the set loads (EXPO_PUBLIC_MOTION_CAPTURE_DELAY_MS), so
 * Metro's download banner has gone from the evidence. Store builds never set it. */
const OPEN_DELAY_MS = Math.max(0, Number(process.env.EXPO_PUBLIC_MOTION_CAPTURE_DELAY_MS || 0));

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
      .finally(() => { if (live) setTimeout(() => { if (live) setOpen(true); }, OPEN_DELAY_MS); });
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
