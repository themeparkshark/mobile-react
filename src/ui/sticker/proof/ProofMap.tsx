/**
 * Proof screen (dev gallery only): the map as board/pick/1-map, the screen where chrome most risks
 * covering content. The chips bar and the footer are laid out in flow by Screen, so the guide card,
 * the round buttons, PLAY! and its tag all sit between them and nothing a player needs is under
 * either bar; the map itself is the ground and runs under both. Map pieces wear the 3 pt navy line
 * and the 50 percent drop. PLAY! is the screen's one gold; pressing it slaps a toast on under the
 * bar, which peels off. The footer's Map tab is picked; the others pick on a tap.
 *
 * The map is a dev drawing of tan streets, grass and water (GALLERY colours), never a real map tile.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import CurrencyChip from '../CurrencyChip';
import Page from '../Page';
import RoundButton from '../RoundButton';
import Screen from '../Screen';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Caps, Name } from '../Text';
import { showToast } from '../Toast';
import { ART, ART_RATIO } from '../art';
import { GALLERY, SPACE } from '../tokens';

const noop = () => undefined;
const FOOTER_ITEMS = [
  { key: 'news', label: 'News' },
  { key: 'standings', label: 'Standings' },
  { key: 'map', label: 'Map' },
  { key: 'social', label: 'Social' },
  { key: 'profile', label: 'Profile', badge: 2, accessibilityLabel: 'Profile, 2 new' },
] as const;

/** A dev map: tan ground, streets, grass and water. */
export function DevMap() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: GALLERY.mapGround, overflow: 'hidden' }]} pointerEvents="none">
      {[-14, 22, 64].map((rot, i) => (
        <View key={rot} style={{ position: 'absolute', left: -80, right: -80, top: 180 + i * 210, height: 22, backgroundColor: GALLERY.mapStreet, transform: [{ rotate: `${rot}deg` }] }} />
      ))}
      <View style={{ position: 'absolute', left: '30%', top: '38%', width: 180, height: 180, borderRadius: 90, borderWidth: 20, borderColor: GALLERY.mapStreet }} />
      <View style={{ position: 'absolute', left: -40, top: 260, width: 150, height: 120, borderRadius: 60, backgroundColor: GALLERY.mapGrass }} />
      <View style={{ position: 'absolute', right: -50, top: 470, width: 170, height: 130, borderRadius: 65, backgroundColor: GALLERY.mapGrass }} />
      <View style={{ position: 'absolute', right: 40, top: 120, width: 90, height: 160, borderRadius: 45, backgroundColor: GALLERY.mapWater }} />
      <View style={{ position: 'absolute', left: 30, bottom: 60, width: 120, height: 80, borderRadius: 40, backgroundColor: GALLERY.mapWater }} />
    </View>
  );
}

export default function ProofMap({ toastOnOpen = false }: { readonly toastOnOpen?: boolean }) {
  const [tab, setTab] = useState('map');
  const play = useCallback(() => {
    showToast({ title: '+1 Ticket', line: 'Treats found', art: ART.ticket, artRatio: ART_RATIO.ticket });
  }, []);
  useEffect(() => {
    if (!toastOnOpen) return undefined;
    const t = setTimeout(play, 900);
    return () => clearTimeout(t);
  }, [play, toastOnOpen]);
  return (
    <Screen testID="proof-map" ground="map" mapLayer={<DevMap />} scroll={false}
      header={{ children: [<CurrencyChip key="c" kind="coins" value={350} />, <CurrencyChip key="t" kind="tickets" value={2} />] }}
      footer={{ items: FOOTER_ITEMS, picked: tab, onPick: setTab }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.cardGap }}>
        <Page small padding="snug" style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.cardGap }}>
            <Spot state="next" art={ART.coin} size={48} label="Walt Statue coin, next up" />
            <View style={{ flex: 1 }}>
              <Caps>Next coin</Caps>
              <Name fit>{"You're here! Tap PLAY!"}</Name>
            </View>
          </View>
        </Page>
        <View style={{ gap: SPACE.cardGap, paddingTop: SPACE.base }}>
          <RoundButton kind="base" accessibilityLabel="Shark" size={56} art={ART.shark} artMirror onPress={noop} />
          <RoundButton kind="base" accessibilityLabel="Daily chest, 2 ready" size={56} art={ART.chestClosed} badge={2} onPress={noop} />
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RoundButton kind="help" accessibilityLabel="How to play" size={52} onPress={noop} />
        <View style={{ alignItems: 'center', gap: SPACE.base * 2 }}>
          <StickerButton label="PLAY!" variant="primary" size="large" width={196} accessibilityLabel="Play for the Walt Statue coin, 1 ticket" onPress={play} />
          <Tag icon={ART.ticket} iconRatio={ART_RATIO.ticket} label="Walt Statue, 1 ticket">Walt Statue  1</Tag>
        </View>
        <View style={{ alignItems: 'center' }}>
          <RoundButton kind="base" accessibilityLabel="Coin shelf" size={60} art={ART.pinShark} onPress={noop} />
          <Tag style={{ marginTop: -SPACE.base * 2 }}>Shelf</Tag>
        </View>
      </View>
    </Screen>
  );
}
