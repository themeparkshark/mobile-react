/**
 * Dev-only fixture preview of items that come and go (cp-catalogs/DESIGN.md), for captures and
 * the critic panel. Never ships (devRoutes.tsx is __DEV__ only).
 *
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=shelves        the Shark Shop's shelves with leaving, last-run, back-again and rare pieces
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=tryon-forever  the try-on on a last-run piece (won't come back)
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=tryon-leaving  the try-on on a piece leaving for a while
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=tryon-rare     the try-on on a rare piece
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=secret         the Secret Shop with leaving animated pieces (secret-guest: as a non-member, no leaving marks)
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=tryon-owned    the try-on on an owned retiring piece (a keeper, and its rarity)
 *   EXPO_PUBLIC_SHOP_LIFE_PREVIEW=closet         the Dressing Room grid with RETIRED and RARE badges
 *   append -still for Reduce Motion
 *
 * Capture rigs can drive the mode from a local server (http://127.0.0.1:8799/mode) or a deep link
 * (themeparkshark://x?slmode=<mode>).
 */
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Image as RNImage, ImageBackground, Linking, ScrollView, View } from 'react-native';
import { AuthContext, type AuthContextType } from '../../context/AuthProvider';
import Item from '../../components/Item';
import Playercard from '../../components/Playercard';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import { SECRET_THEME } from '../../fx/secretTheme';
import type { ShopLeaving, ShopRarity } from '../../helpers/shopLifecycle';
import type { InventoryType } from '../../models/inventory-type';
import type { ItemType } from '../../models/item-type';
import type { PlayerType } from '../../models/player-type';
import type { ShopItem, ShopSection, ShopToday } from '../../models/shop-today';
import { BRAND } from '../../ui';
import ShopShelves from './ShopShelves';

const WARDROBE = 'file:///Users/dustinsparage/apps/tps-prime-time-audit/next-wave/wardrobe-v2/';
const uri = (asset: number) => RNImage.resolveAssetSource(asset).uri;
const COIN = { id: 1, name: 'Coins', icon_url: uri(require('../../../assets/images/coingold.png')) };
const TYPES: Record<number, string> = { 1: 'Head', 2: 'Face', 3: 'Neck', 4: 'Body', 5: 'Hand', 6: 'Background', 7: 'Skin', 8: 'Pin' };
const rare: ShopRarity = { tier: 'rare', label: 'Rare find: few sharks have this' };
const veryRare: ShopRarity = { tier: 'very_rare', label: 'Super rare find: hardly any sharks have this' };
const ultraRare: ShopRarity = { tier: 'ultra_rare', label: 'Ultra rare find: almost no sharks have this' };

type Life = { leaving?: ShopLeaving; returning?: boolean; isNew?: boolean; rarity?: ShopRarity; owned?: boolean };

let nextId = 7100;
const IDS: Record<string, number> = {};
function piece(slug: string, name: string, rarity: number, type: number, cost: number, life: Life = {}): ShopItem {
  IDS[slug] ??= nextId++;
  return {
    id: IDS[slug], name, icon_url: `${WARDROBE}icon/${slug}.png`, paper_url: `${WARDROBE}paper/${slug}.png`,
    item_type: { id: type, name: TYPES[type], image_url: '' }, cost, has_purchased: !!life.owned, latitude: 0, longitude: 0, section: 'shop',
    is_hidden: false, is_clearance: false, currency: COIN as never, is_coin_code_item: false, is_member_item: false, rarity, source: 'shop',
    shop: { is_owned: !!life.owned, is_wishlisted: false, last_chance: false, returning: !!life.returning, is_new: !!life.isNew, season: null, tags: [], set: null,
      leaving: life.leaving ?? null, rarity: life.rarity ?? null },
  } as ShopItem;
}

const LAST_RUN = piece('passport-stamp-visor', 'Passport Stamp Visor', 1, 1, 50, { leaving: { on: '2026-11-30', forever: true } });
const LEAVING = piece('rope-drop-visor', 'Rope Drop Visor', 1, 1, 50, { leaving: { on: '2026-11-14', forever: false } });
const KEEPER = piece('festival-passport-tee', 'Festival Passport Tee', 1, 4, 50, { owned: true, leaving: { on: '2026-11-30', forever: true }, rarity: { tier: 'rare', label: 'Rare find: few sharks have this' } });
const RARE = piece('triceratops-frill-helmet', 'Triceratops Frill Helmet', 4, 1, 280, { rarity: veryRare, isNew: true });

function at(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function section(s: Partial<ShopSection>): ShopSection {
  return { key: 'x', type: 'daily', event_key: null, title: '', subtitle: null, color: null, ends_at: at(1), event_ends_at: null,
    time_left_label: null, last_chance: false, hero_id: null, set_slugs: [], items: [], ...s };
}

function sharkToday(): ShopToday {
  return {
    store_id: 18, shop_day: new Date().toISOString().slice(0, 10), timezone: 'America/Los_Angeles', resets_at: at(1),
    server_time: new Date().toISOString(), sets: [], wishlist_ids: [], equipped_title: null, wishlist_alerts: false,
    sections: [
      section({ key: 'event:harvest', type: 'event', event_key: 'harvest', title: 'Harvest Fest', color: '#a0522d', ends_at: at(7),
        event_ends_at: at(25), event_last_day: '2026-11-30', items: [
          piece('festival-chef-toque', 'Festival Chef Toque', 2, 1, 80, { returning: true }),
          piece('caramel-apple', 'Caramel Apple', 1, 5, 50, { returning: true }),
          piece('pumpkin-spice-tumbler', 'Pumpkin Spice Tumbler', 2, 5, 80, { returning: true }),
          piece('marigold-lantern-sipper', 'Marigold Lantern Sipper', 4, 5, 280, { isNew: true }),
        ] }),
      section({ key: 'featured', type: 'featured', title: 'Featured', ends_at: at(4), hero_id: RARE.id, items: [
        RARE,
        piece('spinning-teacup-hat', 'Spinning Teacup Hat', 3, 1, 140, { isNew: true }),
        piece('raptor-snout-cap', 'Raptor Snout Cap', 3, 1, 140, { rarity: rare }),
        piece('monorail-nose-hat', 'Monorail Nose Hat', 3, 1, 140),
      ] }),
      section({ key: 'daily', type: 'daily', title: 'Daily', ends_at: at(1), items: [
        LAST_RUN, LEAVING, KEEPER,
        piece('pirate-tricorn-feathered', 'Pirate Tricorn', 3, 1, 140, { returning: true }),
        piece('glow-fin-ears', 'Glow Fin Ears', 3, 1, 140),
        piece('cozy-knit-beanie-crimson', 'Crimson Knit Beanie', 1, 1, 50, { owned: true }),
        piece('pineapple-swirl-hat', 'Pineapple Swirl Hat', 2, 1, 80),
      ] }),
    ],
  };
}

function secretToday(): ShopToday {
  const fx = (id: number, name: string, fxKey: string, type: number, rarity: number, cost: number, art: number, life: Life = {}): ShopItem => ({
    ...piece(`fx-${fxKey}`, name, rarity, type, cost, life), id, icon_url: uri(art), paper_url: uri(art), is_member_item: true, source: 'secret', fx_key: fxKey,
  } as ShopItem);
  return {
    store_id: 5, shop_day: new Date().toISOString().slice(0, 10), timezone: 'America/Los_Angeles', resets_at: at(1),
    server_time: new Date().toISOString(), sets: [], wishlist_ids: [], equipped_title: null, wishlist_alerts: false,
    sections: [
      section({ key: 'featured', type: 'featured', title: 'The Vault', ends_at: at(4), hero_id: 436, items: [
        fx(436, 'Jetpack 3000', 'jetpack', 3, 3, 140, require('../../../assets/fx/jetpack.webp'), { rarity: ultraRare, leaving: { on: '2026-11-30', forever: false } }),
        fx(9002, 'Plasma Fin Blade', 'plasma_blade', 5, 4, 280, require('../../../assets/fx/blade.webp')),
        fx(9004, 'Saucer Buddy', 'saucer', 3, 4, 280, require('../../../assets/fx/ufo.webp'), { leaving: { on: '2026-11-30', forever: false } }),
      ] }),
      section({ key: 'daily', type: 'daily', title: "Tonight's Pick", ends_at: at(1), items: [
        fx(9003, 'Reef Halo', 'reef_halo', 1, 3, 140, require('../../../assets/fx/fish-yellow.webp'), { returning: true }),
      ] }),
    ],
  };
}

const SKIN = uri(require('../../../assets/images/screens/inventory/classic-no-eye.png'));
const BACKDROP = uri(require('../../../assets/images/shark_background.png'));
function fixturePlayer(member: boolean): PlayerType {
  return { id: 77, name: 'Finn', coins: 1240, is_subscribed: member, enabled_sound_effects: true, enabled_music: false,
    inventory: {
      id: 1,
      skin_item: { id: 1, name: 'Classic', icon_url: SKIN, no_eye_url: SKIN, item_type: { id: 7, name: 'Skin', image_url: '' } },
      background_item: { id: 2, name: 'Lagoon', icon_url: BACKDROP, paper_url: BACKDROP, item_type: { id: 6, name: 'Background', image_url: '' } },
    } } as unknown as PlayerType;
}

function AuthFixture({ member, children }: { member: boolean; children: React.ReactNode }) {
  const [player] = useState(() => fixturePlayer(member));
  const auth = useMemo(() => ({ player, isReady: true, refreshPlayer: async () => player, setPlayer: () => undefined }) as unknown as AuthContextType, [player]);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function Shop({ secret, focus, guest = false }: { secret: boolean; focus: number | null; guest?: boolean }) {
  const [today, setToday] = useState<ShopToday | null>(() => (secret ? secretToday() : sharkToday()));
  // Open the try-on once the shelves have settled (their entrance animation owns the first second).
  const [request, setRequest] = useState<{ id: number; nonce: number } | null>(null);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setRequest({ id: focus, nonce: 1 }), 1200);
    return () => clearTimeout(t);
  }, [focus]);
  return (
    <AuthFixture member={secret && !guest}>
      <View style={{ flex: 1, backgroundColor: secret ? SECRET_THEME.floor : BRAND.blue }}>
        <Topbar>
          <TopbarColumn stretch={false}><BackButton onPress={() => undefined} /></TopbarColumn>
          <TopbarColumn><TopbarText>{secret ? 'Secret Shop' : 'Shark Shop'}</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false}><View style={{ width: 35 }} /></TopbarColumn>
        </Topbar>
        {today && <ShopShelves today={today} setToday={setToday} onRefresh={async () => true} offset={0} secret={secret}
          focusRequest={request} />}
      </View>
    </AuthFixture>
  );
}

/** Owned pieces in the Dressing Room grid: two retired forever, one rare, one ordinary. */
function Closet() {
  const legacy = (id: number, name: string, type: number, icon: string, lifecycle: ItemType['lifecycle']): ItemType => ({
    id, name, icon_url: icon, paper_url: icon, item_type: { id: type, name: TYPES[type], image_url: '' }, cost: 0, has_purchased: true, latitude: 0, longitude: 0,
    section: 'x', is_hidden: false, is_clearance: false, currency: COIN as never, is_coin_code_item: false, rarity: 1, seen: true, lifecycle,
  } as ItemType);
  const cdn = 'https://assets.themeparkshark.com/mobile/production/assets/thumbs/';
  const items: ItemType[] = [
    legacy(181, 'Party Hat', 1, `${cdn}fXTLHlfbm2eAmOuApkS4YVeFeMatrUnCC34E0dJH.webp`, { retired: true, forever: true, first_released_on: '2023-02-03', rarity: rare }),
    legacy(64, 'Blue Beta Pass', 3, `${cdn}NySz2scj64tzTPiqpUPhb0fBLKUG57LVUNR9sBVG.webp`, { retired: true, forever: true, first_released_on: '2023-02-03', rarity: veryRare }),
    legacy(241, 'Green Beta Pass', 3, `${cdn}ThNT4X82WIHCSOCB6SPs1MGGHjQmDGTsPFJZjwX0.webp`, { retired: true, forever: false, first_released_on: '2023-02-03', rarity: ultraRare }),
    legacy(178, 'Pumpkin Hat', 1, `${cdn}YuiyLEdDmhGApFJ0OSGqnjLdGI7gHsYceTYtOkI8.webp`, null),
    legacy(298, 'Blue Straw Hat', 1, `${cdn}hh1JluXIkhw6snSCNCkSiVc77f0QTYQXUnmIZL40.webp`, { retired: false, forever: false, rarity: rare }),
    legacy(29, 'Gold Cape', 3, `${cdn}yCpSYuJ63oHHnKbaw5Mu9j252kWxh9rj8JxPeuYS.webp`, null),
  ];
  const player = fixturePlayer(false);
  return (
    <AuthFixture member={false}>
      <View style={{ flex: 1, backgroundColor: '#0a4f96' }}>
        <Topbar>
          <TopbarColumn stretch={false}><BackButton onPress={() => undefined} /></TopbarColumn>
          <TopbarColumn><TopbarText>Inventory</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false} />
        </Topbar>
        <ImageBackground source={require('../../../assets/images/screens/park/background-new.png')} resizeMode="stretch"
          style={{ marginTop: -8, height: 300, overflow: 'hidden' }}>
          <Playercard inventory={player.inventory as InventoryType} style={{ position: 'absolute', width: Dimensions.get('window').width, height: 290 }} />
        </ImageBackground>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
          {items.map(item => <View key={item.id} style={{ width: '33.33%' }}><Item item={item} onToggle={() => undefined} /></View>)}
        </ScrollView>
      </View>
    </AuthFixture>
  );
}

function useMode(): string {
  const [mode, setMode] = useState((__DEV__ ? process.env.EXPO_PUBLIC_SHOP_LIFE_PREVIEW : '') || 'shelves');
  useEffect(() => {
    const read = (url: string | null) => { const m = url && /[?&]slmode=([a-z0-9_-]+)/.exec(url); if (m) setMode(m[1]); };
    void Linking.getInitialURL().then(read);
    const sub = Linking.addEventListener('url', e => read(e.url));
    let last = '';
    const poll = setInterval(() => {
      fetch('http://127.0.0.1:8799/mode').then(r => r.text()).then(t => { const m = t.trim(); if (m && m !== last) { last = m; setMode(m); } }, () => undefined);
    }, 600);
    return () => { sub.remove(); clearInterval(poll); };
  }, []);
  return mode;
}

export default function ShopLifecyclePreviewScreen() {
  const mode = useMode().replace(/-still$/, '');
  return <View key={mode} style={{ flex: 1 }}><Body mode={mode} /></View>;
}

function Body({ mode }: { mode: string }) {
  if (mode === 'closet') return <Closet />;
  if (mode === 'secret') return <Shop secret focus={null} />;
  if (mode === 'secret-tryon') return <Shop secret focus={9004} />;
  if (mode === 'tryon-forever') return <Shop secret={false} focus={LAST_RUN.id} />;
  if (mode === 'tryon-leaving') return <Shop secret={false} focus={LEAVING.id} />;
  if (mode === 'tryon-rare') return <Shop secret={false} focus={RARE.id} />;
  if (mode === 'tryon-owned') return <Shop secret={false} focus={KEEPER.id} />;
  if (mode === 'secret-guest') return <Shop secret guest focus={null} />;
  return <Shop secret={false} focus={null} />;
}
