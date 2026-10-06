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
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=wave2-<n>  wave 2 batch n on the shelves (DESIGN-WAVE2.md); tryon-<fx_key> opens one
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=stage-<fx_key>  the Dressing Room stage wearing one piece
 *   EXPO_PUBLIC_SECRET_SHOP_PREVIEW=gallery2-<n>    batch n on six sharks; still2-<n> the same under Reduce Motion
 *
 * While it runs, `xcrun simctl openurl <udid> "themeparkshark://x?ssmode=<mode>"` switches mode
 * without a Metro restart.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Image as RNImage, ImageBackground, Linking, LogBox, Pressable, StyleSheet, Text, View } from 'react-native';
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

// Captures only (this screen is __DEV__ only): no LogBox toast over the stage.
LogBox.ignoreAllLogs();

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

/** Wave 2 (DESIGN-WAVE2.md), by batch. Alex's Christmas Plaid Backpack keeps its real id (488). */
const WAVE2: (typeof HEROES[number] & { batch: number })[] = [
  { batch: 1, id: 9101, name: 'Pumpkin Rocket Pack', fx: 'pumpkin_pack', slot: 3, rarity: 4, cost: 280, art: require('../../../assets/fx/pumpkin-pack.webp'), season: 'halloween' },
  { batch: 1, id: 488, name: 'Christmas Plaid Backpack', fx: 'plaid_backpack', slot: 3, rarity: 3, cost: 140, art: require('../../../assets/fx/plaid-backpack.webp'), season: 'holiday' },
  { batch: 1, id: 9103, name: 'Swirl Specs', fx: 'swirl_specs', slot: 2, rarity: 3, cost: 140, art: require('../../../assets/fx/swirl-specs.webp'), season: 'halloween' },
  { batch: 1, id: 9104, name: 'Bubble Wand', fx: 'bubble_wand', slot: 5, rarity: 3, cost: 140, art: require('../../../assets/fx/bubble-wand.webp'), season: 'park_birthday' },
  { batch: 1, id: 9105, name: 'Pocket Dragon', fx: 'pocket_dragon', slot: 3, rarity: 4, cost: 280, art: require('../../../assets/fx/dragon-body.webp') },
  { batch: 1, id: 9106, name: 'Snow Globe', fx: 'snow_globe', slot: 6, rarity: 4, cost: 280, art: require('../../../assets/fx/snowglobe-backdrop.webp'), season: 'holiday' },
  { batch: 2, id: 9201, name: 'Spinny Propeller Hat', fx: 'propeller_hat', slot: 1, rarity: 4, cost: 280, art: require('../../../assets/fx/prop-cap.webp') },
  { batch: 2, id: 9202, name: 'Wizard Hat', fx: 'wizard_hat', slot: 1, rarity: 4, cost: 280, art: require('../../../assets/fx/wizard-hat.webp') },
  { batch: 2, id: 9203, name: 'Firework Crown', fx: 'firework_crown', slot: 1, rarity: 4, cost: 280, art: require('../../../assets/fx/fw-crown.webp'), season: 'new_year' },
  { batch: 2, id: 9204, name: 'Heartbeat Halo', fx: 'heart_halo', slot: 1, rarity: 3, cost: 140, art: require('../../../assets/fx/heart-red.webp'), season: 'valentines' },
  { batch: 2, id: 9205, name: 'Party Hat', fx: 'party_hat', slot: 1, rarity: 3, cost: 140, art: require('../../../assets/fx/party-hat.webp'), season: 'park_birthday' },
  { batch: 2, id: 9206, name: 'Shimmer Cape', fx: 'holo_cape', slot: 3, rarity: 4, cost: 280, art: require('../../../assets/fx/holo-cape.webp') },
  { batch: 3, id: 9301, name: 'Top Hat Surprise', fx: 'top_hat', slot: 1, rarity: 4, cost: 280, art: require('../../../assets/fx/magic-top-hat.webp') },
  { batch: 3, id: 9302, name: 'Snow Beanie', fx: 'snow_beanie', slot: 1, rarity: 3, cost: 140, art: require('../../../assets/fx/snow-beanie.webp'), season: 'winter' },
  { batch: 3, id: 9303, name: 'Glow Boppers', fx: 'glow_boppers', slot: 1, rarity: 3, cost: 140, art: require('../../../assets/fx/bopper-band.webp') },
  { batch: 3, id: 9304, name: 'Cocoa Mug', fx: 'cocoa_mug', slot: 5, rarity: 3, cost: 140, art: require('../../../assets/fx/cocoa-mug.webp'), season: 'winter' },
  { batch: 3, id: 9305, name: 'Love Bug Buddy', fx: 'love_bug', slot: 3, rarity: 3, cost: 140, art: require('../../../assets/fx/love-bug.webp'), season: 'valentines' },
  { batch: 3, id: 9306, name: 'Thunder Cove', fx: 'storm_surge', slot: 6, rarity: 4, cost: 280, art: require('../../../assets/fx/storm-cove.webp') },
];
const ALL = [...HEROES, ...WAVE2];
const SLOT_KEYS: Record<number, string> = { 1: 'head_item', 2: 'face_item', 3: 'neck_item', 5: 'hand_item', 6: 'background_item' };
const SLOT_NAMES: Record<number, string> = { 1: 'Head', 2: 'Face', 3: 'Neck', 5: 'Hand', 6: 'Background' };

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
function fixtureToday(night = 1, batch = 0): ShopToday {
  if (batch) return batchToday(batch);
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

/** A wave 2 batch on the shelves: the Vault holds its Epics, then a drop per season, and Tonight's Pick the rest. */
function batchToday(batch: number): ShopToday {
  const heroes = WAVE2.filter(h => h.batch === batch);
  const vault = heroes.filter(h => h.rarity === 4).slice(0, 3);
  const rest = heroes.filter(h => !vault.includes(h));
  const section = (s: Partial<ShopSection>): ShopSection => ({
    key: 'x', type: 'daily', event_key: null, title: '', subtitle: null, color: null, ends_at: at(1), event_ends_at: null,
    time_left_label: null, last_chance: false, hero_id: null, set_slugs: [], items: [], ...s,
  });
  const SEASONS: Record<string, { title: string; color: string; ends: string }> = {
    halloween: { title: 'Halloween Nights', color: '#ff7a00', ends: '2026-11-01' },
    holiday: { title: 'Holiday Season', color: '#d6283a', ends: '2027-01-01' },
    winter: { title: 'Winter Chill', color: '#5aa8ff', ends: '2027-02-28' },
    new_year: { title: 'New Year Countdown', color: '#ffcf3b', ends: '2027-01-02' },
    valentines: { title: "Valentine's Week", color: '#ff5fa2', ends: '2027-02-14' },
    spring: { title: 'Spring Egg Hunt', color: '#7ad36b', ends: '2027-04-05' },
    summer: { title: 'Summer Splash', color: '#22c3ee', ends: '2027-08-31' },
    park_birthday: { title: 'Park Birthday Week', color: '#ff9f1c', ends: '2027-05-28' },
  };
  const seasons = [...new Set(rest.map(h => h.season).filter((x): x is string => !!x))];
  const drops = seasons.map(key => section({ key: `event:${key}`, type: 'event', event_key: key, title: SEASONS[key]?.title ?? key,
    color: SEASONS[key]?.color ?? '#ff7a00', ends_at: at(7), event_ends_at: `${SEASONS[key]?.ends ?? '2027-01-01'}T23:59:00-08:00`,
    event_last_day: SEASONS[key]?.ends, items: rest.filter(h => h.season === key).map(heroItem) }));
  const daily = rest.filter(h => !h.season);
  return {
    store_id: 42, shop_day: new Date().toISOString().slice(0, 10), timezone: 'America/Los_Angeles', resets_at: at(1),
    server_time: new Date().toISOString(), sets: [], wishlist_ids: [], equipped_title: null, wishlist_alerts: false,
    sections: [
      section({ key: 'featured', type: 'featured', title: 'The Vault', ends_at: at(7), hero_id: vault[0]?.id ?? null, items: vault.map(heroItem) }),
      ...drops,
      ...(daily.length ? [section({ key: 'daily', type: 'daily', title: "Tonight's Pick", ends_at: at(1), items: daily.map(heroItem) })] : []),
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

function Shop({ member, focus, night = 1, gate = false, lapse = false, batch = 0 }: { member: boolean; focus: number | null; night?: number; gate?: boolean;
  lapse?: boolean; batch?: number }) {
  const [today, setToday] = useState<ShopToday | null>(() => fixtureToday(night, batch));
  useEffect(() => {
    if (!gate) return;
    const t = setTimeout(() => { void askGrownUp(42); }, 900);
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

/** The Dressing Room stage: your shark wearing one hero, full LOD. Tap to wear the next (or one piece, `only`). */
function Stage({ only }: { only?: FxKey }) {
  const list = only ? ALL.filter(h => h.fx === only) : HEROES;
  const [index, setIndex] = useState(0);
  const hero = list[index % list.length];
  const look = useMemo(() => {
    const base = baseInventory() as unknown as Record<string, unknown>;
    base[SLOT_KEYS[hero.slot]] = heroItem(hero);
    return base as unknown as InventoryType;
  }, [hero]);
  return (
    <AuthFixture member>
      <Pressable style={{ flex: 1, backgroundColor: '#0a4f96' }} disabled={!!only} onPress={() => setIndex(i => (i + 1) % list.length)}>
        <Topbar>
          <TopbarColumn stretch={false}><BackButton onPress={() => undefined} /></TopbarColumn>
          <TopbarColumn><TopbarText>Inventory</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false} />
        </Topbar>
        <View style={{ height: 470, marginTop: -8 }}>
          {/* Exactly the real Dressing Room's card (InventoryScreen): open ocean, no floor, no shadow. */}
          <Playercard inventory={look} popLayers fxTapToPlay={!!only} style={{ position: 'absolute', width: W, height: 460 }} />
        </View>
        <Text style={styles.stageName}>{hero.name}</Text>
        <Text style={styles.stageHint}>{only ? 'Tap your shark to see it again' : `Tap for the next piece (${index + 1} of ${list.length})`}</Text>
      </Pressable>
    </AuthFixture>
  );
}

function Gallery({ still, batch = 0 }: { still: boolean; batch?: number }) {
  const cell = (W - 24) / 2;
  const heroes = batch ? WAVE2.filter(h => h.batch === batch) : HEROES;
  return (
    <AuthFixture member>
      <ImageBackground source={require('../../../assets/images/shark_background.png')} style={{ flex: 1, paddingTop: 54 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 8 }}>
          {heroes.map(h => {
            const base = { ...baseInventory() } as unknown as Record<string, unknown>;
            base[SLOT_KEYS[h.slot]] = heroItem(h);
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

function PreviewBody({ mode }: { mode: string }) {
  if (mode === 'stage') return <Stage />;
  const stageOne = /^stage-([a-z_]+)$/.exec(mode);
  if (stageOne) return <Stage only={stageOne[1] as FxKey} />;
  if (mode === 'gallery' || mode === 'still') return <Gallery still={mode === 'still'} />;
  const gallery2 = /^(gallery2|still2)-(\d+)$/.exec(mode);
  if (gallery2) return <Gallery still={gallery2[1] === 'still2'} batch={Number(gallery2[2])} />;
  const wave = /^wave2-(\d+)$/.exec(mode);
  if (wave) return <Shop member focus={null} batch={Number(wave[1])} />;
  const tryOn = /^tryon-([a-z_]+?)(-guest)?$/.exec(mode);
  if (tryOn) {
    const w2 = WAVE2.find(h => h.fx === tryOn[1]);
    if (w2) return <Shop member={!tryOn[2]} focus={w2.id} batch={w2.batch} />;
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
