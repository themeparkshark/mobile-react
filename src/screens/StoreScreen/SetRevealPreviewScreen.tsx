/** Dev-only capture of the shop set reward reveal (EXPO_PUBLIC_SET_REVEAL_PREVIEW=1). Never routed in release. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import SetCompleteReveal from './SetCompleteReveal';

const REWARD: ShopSetReward = { slug: 'preview-set', name: 'Spooky Squad', title: 'Spooky Squad Star', xp: 160 };
const SET = { slug: 'preview-set', name: 'Spooky Squad', color: '#F28C28', item_ids: [], owned_ids: [], pieces: [], xp_reward: 160,
  blurb: null, season: null } as unknown as ShopSetSummary;

export default function SetRevealPreviewScreen() {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: '#0768b9', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 20 }}>{open ? '' : 'DEV: reveal closed'}</Text>
      {open && <SetCompleteReveal reward={REWARD} set={SET} still onDone={() => setOpen(false)} />}
    </View>
  );
}
