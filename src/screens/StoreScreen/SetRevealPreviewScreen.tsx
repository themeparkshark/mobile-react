/** Dev-only capture of the shop set reward reveal (EXPO_PUBLIC_SET_REVEAL_PREVIEW=1). Never routed in release. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import SetCompleteReveal from './SetCompleteReveal';

const REWARD: ShopSetReward = { slug: 'preview-set', name: 'Spooky Squad', title: 'Spooky Squad Star', xp: 160,
  xp_before: { level: 7, experience: 820, needed: 1200 }, xp_after: { level: 7, experience: 980, needed: 1200 } };
// Real items and art from the public CDN (Witch Hat, Ghost Costume, Ghost Blaster), so WEAR IT ALL and
// the share picture show the set itself. The dev player must own them for the save to work.
const CDN = 'https://assets.themeparkshark.com/mobile/production/assets/';
const PIECES = [
  { id: 27, name: 'Witch Hat', item_type_id: 1, rarity: 2, icon_url: `${CDN}iLORCWVEYFnsRLPlofQCZzfxI9BD8NwLkDHeN9CA.png`, paper_url: `${CDN}oQi4oC4uE8tVRBP97LkCag19XCDCt4O6BLg04bwf.png`, no_eye_url: null, owned: true },
  { id: 219, name: 'Ghost Costume', item_type_id: 4, rarity: 4, icon_url: `${CDN}u8crgkdZZtxE61u9UIIvGAdnidYDdrulmBtsQOn9.png`, paper_url: `${CDN}sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO.png`, no_eye_url: null, owned: true },
  { id: 434, name: 'Ghost Blaster', item_type_id: 5, rarity: 4, icon_url: `${CDN}QHglR8cVgQLS6KHrTDgZ3gazzgeogUMFHKCAJlvj.png`, paper_url: `${CDN}2IPHn8UVfl5hHN2wdayZWq8ZiqZTEmKwnMv5pkIn.png`, no_eye_url: null, owned: true },
];
const SET = { slug: 'preview-set', name: 'Spooky Squad', color: '#F28C28', item_ids: PIECES.map(p => p.id), owned_ids: PIECES.map(p => p.id),
  pieces: PIECES, total: PIECES.length, xp_reward: 160, blurb: null, season: null } as unknown as ShopSetSummary;
// No title: the preview set has no real slug for the title save.
const REWARD_WITH_ITEMS: ShopSetReward = { ...REWARD, title: null, item_ids: PIECES.map(p => p.id) };

export default function SetRevealPreviewScreen() {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: '#0768b9', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 20 }}>{open ? '' : 'DEV: reveal closed'}</Text>
      {open && <SetCompleteReveal reward={REWARD_WITH_ITEMS} set={SET} still onDone={() => setOpen(false)} />}
    </View>
  );
}
