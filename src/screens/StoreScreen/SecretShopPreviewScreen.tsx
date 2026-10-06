/**
 * Dev-only fixture preview of the Secret Shop (secret-shop/DESIGN.md), for
 * captures and the critic panel. Never ships (devRoutes.tsx is __DEV__ only).
 *
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=member   the shop as a VIP member
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=guest    the shop as a non-member (preview banner, locked prices)
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=tryon-<fx_key>[-guest]  the try-on sheet open on one piece
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=night2   the next night (Midway Fireworks in Tonight Only)
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=gate     the grown-up gate over the non-member shop
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=lapse    a member's try-on whose buy finds VIP gone (needs the stub API's 403)
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=stage    your shark on the Dressing Room stage, one hero at a time (tap: next)
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=gallery  all six heroes on six sharks
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=still    the gallery under Reduce Motion (the rest poses)
 *
 * While it runs, `xcrun simctl openurl <udid> "themeparkshark://x?ssmode=<mode>"` switches mode
 * without a Metro restart.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Image as RNImage, ImageBackground, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthContext, type AuthContextType } from '../../context/AuthProvider';
import Playercard from '../../components/Playercard';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import { SECRET_THEME } from '../../fx/secretTheme';
import type { FxKey } from '../../fx/registry';
import type { InventoryType } from '../../models/inventory-type';
import type { ItemType } from '../../models/item-type';
import type { PlayerType } from '../../models/player-type';
import type { ShopItem, ShopSection, ShopToday } from '../../models/shop-today';
import { FONT } from '../../ui';
import ShopShelves from './ShopShelves';
import { askGrownUp } from './SecretShopUi';

const uri = (asset: number) => RNImage.resolveAssetSource(asset).uri;
const type = (id: number, name: string) => ({ id, name, image_url: '' });
const COIN = { id: 1, name: 'Coins', icon_url: uri(require('../../../assets/images/coingold.png')) };

const HEROES: { id: number; name: string; fx: FxKey; slot: number; rarity: number; cost: number; art: number; season?: string }[] = [
  // Alex's Jetpack 3000 (items.id 436), upgraded with the jetpack rig.
  { id: 436, name: 'Jetpack 3000', fx: 'jetpack', slot: 3, rarity: 3, cost: 140, art: require('../../../assets/fx/jetpack.webp') },
  { id: 9002, name: 'Plasma Fin Blade', fx: 'plasma_blade', slot: 5, rarity: 4, cost: 280, art: require('../../../assets/fx/blade.webp') },
  { id: 9003, name: 'Reef Halo', fx: 'reef_halo', slot: 1, rarity: 3, cost: 140, art: require('../../../assets/fx/fish-yellow.webp') },
  { id: 9004, name: 'Saucer Buddy', fx: 'saucer', slot: 3, rarity: 4, cost: 280, art: require('../../../assets/fx/ufo.webp') },
  { id: 9005, name: 'Midway Fireworks', fx: 'midway_fireworks', slot: 6, rarity: 4, cost: 280, art: require('../../../assets/fx/backdrop.webp') },
  { id: 9006, name: 'Ghost Lantern', fx: 'ghost_lantern', slot: 5, rarity: 3, cost: 140, art: require('../../../assets/fx/lantern.webp'), season: 'halloween' },
];
const SLOT_NAMES: Record<number, string> = { 1: 'Head', 3: 'Neck', 5: 'Hand', 6: 'Background' };

function heroItem(h: typeof HEROES[number]): ShopItem {
  const art = uri(h.art);
  return {
    id: h.id, name: h.name, icon_url: art, paper_url: art, item_type: type(h.slot, SLOT_NAMES[h.slot]), cost: h.cost,
    has_purchased: false, latitude: 0, longitude: 0, section: 'secret', is_hidden: false, is_clearance: false,
    currency: COIN as never, is_coin_code_item: false, is_member_item: true, rarity: h.rarity, source: 'secret', fx_key: h.fx,
    shop: { is_owned: false, is_wishlisted: false, last_chance: false, returning: false, season: h.season ?? null, tags: ['secret'], set: null },
  } as ShopItem;
}

const SKIN = uri(require('../../../assets/images/screens/inventory/classic-no-eye.png'));
const BACKDROP = uri(require('../../../assets/images/shark_background.png'));
function baseInventory(): InventoryType {
  return {
    id: 1,
    skin_item: { id: 1, name: 'Classic', icon_url: SKIN, no_eye_url: SKIN, item_type: type(7, 'Skin') } as never,
    background_item: { id: 2, name: 'Lagoon', icon_url: BACKDROP, paper_url: BACKDROP, item_type: type(6, 'Background') } as ItemType,
  } as unknown as InventoryType;
}

function fixturePlayer(member: boolean): PlayerType {
  return { id: 77, name: 'Finn', coins: 1240, is_subscribed: member, enabled_sound_effects: true, enabled_music: false,
    inventory: baseInventory() } as unknown as PlayerType;
}

function at(days: number, hour = 0): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** night 2: the next night's Tonight Only (the fireworks scene), to show a scene piece on the shelves. */
function fixtureToday(night = 1): ShopToday {
  const items = HEROES.map(heroItem);
  const by = (fx: FxKey) => items.find(i => i.fx_key === fx)!;
  const monday = (() => { const d = new Date(); const add = ((8 - d.getDay()) % 7) || 7; return add; })();
  const section = (s: Partial<ShopSection>): ShopSection => ({
    key: 'x', type: 'daily', event_key: null, title: '', subtitle: null, color: null, ends_at: at(1), event_ends_at: null,
    time_left_label: null, last_chance: false, hero_id: null, set_slugs: [], items: [], ...s,
  });
  return {
    store_id: 42, shop_day: new Date().toISOString().slice(0, 10), timezone: 'America/Los_Angeles', resets_at: at(1),
    server_time: new Date().toISOString(), sets: [], wishlist_ids: [], equipped_title: null, wishlist_alerts: false,
    sections: [
      section({ key: 'event:halloween', type: 'event', event_key: 'halloween', title: 'Halloween Nights', color: '#ff7a00',
        ends_at: at(7), event_ends_at: '2026-11-02T00:00:00-07:00', event_last_day: '2026-11-01', items: [by('ghost_lantern')] }),
      section({ key: 'featured', type: 'featured', title: 'The Vault', ends_at: at(monday), hero_id: 436,
        items: [by('jetpack'), by('plasma_blade'), by('saucer')] }),
      section({ key: 'daily', type: 'daily', title: 'Tonight Only', ends_at: at(1), items: [by(night === 2 ? 'midway_fireworks' : 'reef_halo')] }),
    ],
  };
}

function AuthFixture({ member, lapseOnRefresh = false, children }: { member: boolean; lapseOnRefresh?: boolean; children: React.ReactNode }) {
  const [player, setPlayer] = useState(() => fixturePlayer(member));
  // 'lapse': the first refresh after a buy finds VIP gone (the stub API answers the buy with members_only).
  const refreshPlayer = async () => {
    if (!lapseOnRefresh) return player;
    const next = fixturePlayer(false);
    setPlayer(next);
    return next;
  };
  const auth = useMemo(() => ({ player, isReady: true, refreshPlayer, setPlayer: () => undefined }) as unknown as AuthContextType, [player]);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function Shop({ member, focus, night = 1, gate = false, lapse = false }: { member: boolean; focus: number | null; night?: number; gate?: boolean; lapse?: boolean }) {
  const [today, setToday] = useState<ShopToday | null>(() => fixtureToday(night));
  useEffect(() => {
    if (!gate) return;
    const t = setTimeout(() => { void askGrownUp(null, 42); }, 900);
    return () => clearTimeout(t);
  }, [gate]);
  return (
    <AuthFixture member={member} lapseOnRefresh={lapse}>
      <View style={{ flex: 1, backgroundColor: SECRET_THEME.floor }}>
        {/* Same top bar as the real vault (StoreScreen: the house bar, not the legacy purple one). */}
        <Topbar>
          <TopbarColumn stretch={false}><BackButton onPress={() => undefined} /></TopbarColumn>
          <TopbarColumn><TopbarText>Secret Shop</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false}><View style={{ width: 35 }} /></TopbarColumn>
        </Topbar>
        {today && <ShopShelves today={today} setToday={setToday} onRefresh={async () => true} offset={0} secret
          focusRequest={focus ? { id: focus, nonce: 1 } : null} />}
      </View>
    </AuthFixture>
  );
}

const W = Dimensions.get('window').width;

/** The Dressing Room stage: your shark wearing one hero, full LOD. Tap to wear the next. */
function Stage({ withHat = false }: { withHat?: boolean }) {
  const [index, setIndex] = useState(0);
  const hero = HEROES[index];
  const look = useMemo(() => {
    const base = baseInventory() as unknown as Record<string, unknown>;
    // 'stage-hat': the halo rides along (the tallest local head piece), for the framing check.
    const halo = HEROES.find(h => h.fx === 'reef_halo');
    if (withHat && halo) base.head_item = heroItem(halo);
    const slot = { 1: 'head_item', 3: 'neck_item', 5: 'hand_item', 6: 'background_item' }[hero.slot]!;
    base[slot] = heroItem(hero);
    return base as unknown as InventoryType;
  }, [index, withHat]);
  return (
    <AuthFixture member>
      <Pressable style={{ flex: 1, backgroundColor: '#0a4f96' }} onPress={() => setIndex(i => (i + 1) % HEROES.length)}>
        <Topbar>
          <TopbarColumn stretch={false}><BackButton onPress={() => undefined} /></TopbarColumn>
          <TopbarColumn><TopbarText>Inventory</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false} />
        </Topbar>
        <View style={{ height: 470, marginTop: -8 }}>
          {/* Exactly the real Dressing Room's card (InventoryScreen): open ocean, no floor, no shadow. */}
          <Playercard inventory={look} popLayers style={{ position: 'absolute', width: W, height: 460 }} />
        </View>
        <Text style={styles.stageName}>{hero.name}</Text>
        <Text style={styles.stageHint}>Tap for the next piece ({index + 1} of {HEROES.length})</Text>
      </Pressable>
    </AuthFixture>
  );
}

/** 'framing': the jetpack shark (with the halo on) in the small cards the app draws (line recap 130x180, smaller, tiny, wide), each frame outlined. */
function Framing() {
  const look = useMemo(() => {
    const base = baseInventory() as unknown as Record<string, unknown>;
    base.neck_item = heroItem(HEROES[0]);
    // The tallest head piece we ship locally rides along, so the peak check includes a hat.
    const halo = HEROES.find(h => h.fx === 'reef_halo');
    if (halo) base.head_item = heroItem(halo);
    return base as unknown as InventoryType;
  }, []);
  const card = (w: number, h: number, label: string) => (
    <View key={label} style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: w, height: h, borderWidth: 1, borderColor: '#ffcf3b' }}>
        <Playercard inventory={look} style={{ position: 'absolute', width: w, height: h }} />
      </View>
      <Text style={styles.cellName}>{label}</Text>
    </View>
  );
  return (
    <AuthFixture member>
      <View style={{ flex: 1, backgroundColor: '#0a4f96', paddingTop: 60, gap: 14, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          {card(130, 180, 'Line recap 130x180')}{card(120, 136, '120x136')}{card(80, 90, '80x90')}
        </View>
        {card(W - 40, 300, `Wide ${Math.round(W - 40)}x300`)}
      </View>
    </AuthFixture>
  );
}

function Gallery({ still }: { still: boolean }) {
  const cell = (W - 24) / 2;
  return (
    <AuthFixture member>
      <ImageBackground source={require('../../../assets/images/shark_background.png')} style={{ flex: 1, paddingTop: 54 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 8 }}>
          {HEROES.map(h => {
            const base = { ...baseInventory() } as unknown as Record<string, unknown>;
            const slot = { 1: 'head_item', 3: 'neck_item', 5: 'hand_item', 6: 'background_item' }[h.slot]!;
            base[slot] = heroItem(h);
            return (
              <View key={h.id} style={[styles.cell, { width: cell, height: cell * 1.12 }]}>
                <Playercard inventory={base as unknown as InventoryType} still={still}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 22 }} />
                <Text style={styles.cellName}>{h.name}</Text>
              </View>
            );
          })}
        </View>
      </ImageBackground>
    </AuthFixture>
  );
}

function useMode(): string {
  const [mode, setMode] = useState((__DEV__ ? process.env.EXPO_PUBLIC_SECRET_SHOP_PREVIEW : '') || 'member');
  useEffect(() => {
    const read = (url: string | null) => { const m = url && /[?&]ssmode=([a-z0-9_-]+)/.exec(url); if (m) setMode(m[1]); };
    void Linking.getInitialURL().then(read);
    const sub = Linking.addEventListener('url', e => read(e.url));
    return () => sub.remove();
  }, []);
  return mode;
}

export default function SecretShopPreviewScreen() {
  const mode = useMode();
  return <View key={mode} style={{ flex: 1 }}><PreviewBody mode={mode} /></View>;
}

/**
 * The REAL StoreScreen (top bar, back, help, store loading) against the dev stub API, for
 * reproducing navigation bugs: 'realstore' (member), 'realstore-guest'; 'dump' logs the
 * fixture shop day as JSON so the stub can serve it from /stores/5/today.
 */
function RealStore({ member, switching = false }: { member: boolean; switching?: boolean }) {
  const StoreScreen = require('../StoreScreen').default;
  // 'realswitch': the same Store screen gets a new store param every 5 s (what React Navigation does when
  // navigate('Store', ...) lands on a Store screen already in the stack).
  const [store, setStore] = useState<number | 'shark-shop'>(5);
  useEffect(() => {
    if (!switching) return;
    const timer = setInterval(() => setStore(s => (s === 5 ? 'shark-shop' : 5)), 5000);
    return () => clearInterval(timer);
  }, [switching]);
  return (
    <AuthFixture member={member}>
      <StoreScreen route={{ key: 'Store-dev', name: 'Store', params: { store } }} navigation={undefined as never} />
    </AuthFixture>
  );
}

function PreviewBody({ mode }: { mode: string }) {
  if (mode === 'dump') { console.log(`[ss-dump] ${JSON.stringify(fixtureToday(1))}`); return null; }
  if (mode === 'realstore' || mode === 'realstore-guest') return <RealStore member={mode === 'realstore'} />;
  if (mode === 'realswitch') return <RealStore member switching />;
  if (mode === 'stage') return <Stage />;
  if (mode === 'stage-hat') return <Stage withHat />;
  if (mode === 'framing') return <Framing />;
  if (mode === 'gallery' || mode === 'still') return <Gallery still={mode === 'still'} />;
  const tryOn = /^tryon-([a-z_]+?)(-guest)?$/.exec(mode);
  if (tryOn) {
    const hero = HEROES.find(h => h.fx === tryOn[1]);
    return <Shop member={!tryOn[2]} focus={hero?.id ?? null} night={hero?.fx === 'midway_fireworks' ? 2 : 1} />;
  }
  if (mode === 'night2') return <Shop member focus={null} night={2} />;
  if (mode === 'gate') return <Shop member={false} focus={null} gate />;
  if (mode === 'lapse') return <Shop member focus={9002} lapse />;
  return <Shop member={mode !== 'guest'} focus={null} />;
}

const styles = StyleSheet.create({
  stageName: { fontFamily: FONT.display, fontSize: 28, color: '#fff', textAlign: 'center', marginTop: 8 },
  stageHint: { fontFamily: FONT.body, fontSize: 15, color: '#d8ecff', textAlign: 'center', marginTop: 4 },
  cell: { borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: SECRET_THEME.gold, backgroundColor: '#0a4f96' },
  cellName: { position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontFamily: FONT.display, fontSize: 15, color: '#fff' },
});
