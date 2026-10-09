/**
 * The picture at the top of each "?" help page: a small live scene of the real
 * screen, built from the art players already see (Alex's sharks, pins, gear,
 * coins, chests, crowns), animated on the UI thread with Reanimated.
 *
 * - A scene loops only while its page is the visible one and the sheet is open.
 * - Reduce Motion shows one still frame that already tells the story.
 * - Images are small webp/png files decoded at their drawn size (expo-image).
 * - No text in a scene repeats the page's lines; numbers in a scene are only
 *   illustration (rank 5 to 4, +1 ride), never a promise.
 */
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { ImageBackground, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { COIN_TIERS } from '../../constants/coinTiers';
import HowToDemo from '../../screens/HowToPlay/HowToDemos';
import Ribbon from '../Ribbon';
import { RARITY_LOOK, type RarityTier } from '../../screens/SetCollection/dexLook';
import type { HelpHeroKey } from '../../services/help/helpSheets';
import { BRAND, GameIcon, type GameIconName } from '../../ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ART = {
  water: require('../../../assets/images/help/stage-water.webp'),
  groundShadow: require('../../../assets/images/howto/ground-shadow.webp'),
  corkTile: require('../../../assets/images/screens/pin-swaps/corkboard.png'),
  sharks: [
    require('../../../assets/images/screens/leaderboard/sharks/shark-0.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-1.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-2.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-3.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-4.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-5.png'),
    require('../../../assets/images/screens/leaderboard/sharks/shark-6.png'),
  ],
  crownGold: require('../../../assets/images/screens/leaderboard/crown-gold.png'),
  crownSilver: require('../../../assets/images/screens/leaderboard/crown-silver.png'),
  crownBronze: require('../../../assets/images/screens/leaderboard/crown-bronze.png'),
  barrel: require('../../../assets/images/screens/leaderboard/barrel.png'),
  pinBurger: require('../../../assets/images/help/pin-burger.webp'),
  pinHoney: require('../../../assets/images/help/pin-honey.webp'),
  pinAstro: require('../../../assets/images/help/pin-astro.webp'),
  pinHat: require('../../../assets/images/help/pin-tophat.webp'),
  cap: require('../../../assets/images/help/gear-cap.webp'),
  shades: require('../../../assets/images/help/gear-shades.webp'),
  tee: require('../../../assets/images/help/gear-tee.webp'),
  tileGold: require('../../../assets/images/help/tile-gold.webp'),
  tileGreen: require('../../../assets/images/help/tile-green.webp'),
  tileBlue: require('../../../assets/images/help/tile-blue.webp'),
  sharkHappy: require('../../../assets/images/howto/shark-happy.webp'),
  chestClosed: require('../../../assets/images/screens/redeem/chest_closed.png'),
  chestOpen: require('../../../assets/images/screens/redeem/chest_opened.png'),
  ticket: require('../../../assets/images/ticket-icon.png'),
  energy: require('../../../assets/images/energy.png'),
  compose: require('../../../assets/images/social/compose.png'),
  socialShark: require('../../../assets/images/screens/pin-collections/shark.png'),
  churro: require('../../../assets/images/prep-items/churros/churro_18.png'),
} as const;

/** Loop length per scene, and the still frame (0..1) shown for Reduce Motion and off-screen pages. */
const LOOP: Readonly<Record<HelpHeroKey, { ms: number; rest: number }>> = {
  standings_climb: { ms: 3400, rest: 0.8 },
  standings_podium: { ms: 3200, rest: 0.72 },
  standings_boards: { ms: 3600, rest: 0.1 },
  pins_swap: { ms: 3400, rest: 0.8 },
  pins_clock: { ms: 6000, rest: 0.3 },
  shop_gear: { ms: 3600, rest: 0.82 },
  shop_daily: { ms: 3200, rest: 0.75 },
  shop_supplies: { ms: 3000, rest: 0.7 },
  park_shelf: { ms: 3200, rest: 0.75 },
  park_levels: { ms: 4400, rest: 0.97 },
  redeem_chest: { ms: 3400, rest: 0.78 },
  social_share: { ms: 3400, rest: 0.8 },
  social_safe: { ms: 3000, rest: 0.75 },
  basics_map: { ms: 2600, rest: 1 },
  basics_park: { ms: 2400, rest: 1 },
  basics_line: { ms: 2800, rest: 1 },
  term: { ms: 2800, rest: 0 },
  odds: { ms: 1600, rest: 1 },
  rules: { ms: 2800, rest: 0 },
};

export interface HeroData {
  /** term: the word's icon and "You have 12". */
  readonly icon?: GameIconName;
  readonly caption?: string | null;
  /** odds: one row per rarity, percent from the server. */
  readonly odds?: readonly { readonly tier: RarityTier; readonly percent: number }[];
}

/** 0..1 repeating while running; parked on the scene's still frame otherwise. */
function useLoop(hero: HelpHeroKey, running: boolean, reduced: boolean): SharedValue<number> {
  const { ms, rest } = LOOP[hero];
  const t = useSharedValue(rest);
  useEffect(() => {
    cancelAnimation(t);
    if (!running || reduced) { t.value = rest; return undefined; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [running, reduced, ms, rest, t]);
  return t;
}

export default function HelpHero({ hero, width, height, running, reduced, data }: {
  readonly hero: HelpHeroKey;
  readonly width: number;
  readonly height: number;
  readonly running: boolean;
  readonly reduced: boolean;
  readonly data?: HeroData;
}) {
  const t = useLoop(hero, running, reduced);
  const cork = hero === 'pins_swap' || hero === 'pins_clock';
  const p = { t, w: width, h: height };
  return (
    <View style={[styles.stage, { width, height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {cork
        // The board's own cork, tiled at its drawn size so it stays crisp (never stretched).
        ? <ImageBackground source={ART.corkTile} style={StyleSheet.absoluteFill} resizeMode="repeat" imageStyle={{ width: 200, height: 200 }} />
        : <Image source={ART.water} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />}
      {hero === 'standings_climb' && <ClimbScene {...p} />}
      {hero === 'standings_podium' && <PodiumScene {...p} />}
      {hero === 'standings_boards' && <BoardsScene {...p} />}
      {hero === 'pins_swap' && <PinSwapScene {...p} />}
      {hero === 'pins_clock' && <PinClockScene {...p} />}
      {hero === 'shop_gear' && <GearScene {...p} />}
      {hero === 'shop_daily' && <DailyScene {...p} />}
      {hero === 'shop_supplies' && <SuppliesScene {...p} />}
      {hero === 'park_shelf' && <ShelfScene {...p} />}
      {hero === 'park_levels' && <LevelsScene {...p} />}
      {hero === 'redeem_chest' && <ChestScene {...p} />}
      {hero === 'social_share' && <ShareScene {...p} />}
      {hero === 'social_safe' && <SafeScene {...p} />}
      {(hero === 'basics_map' || hero === 'basics_park' || hero === 'basics_line') && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <HowToDemo art={hero === 'basics_map' ? 'find' : hero === 'basics_park' ? 'park' : 'line'} size={height * 0.98} active={running} reduced={reduced} />
        </View>
      )}
      {hero === 'term' && <TermScene {...p} icon={data?.icon ?? 'info'} caption={data?.caption ?? null} />}
      {hero === 'odds' && <OddsScene {...p} rows={data?.odds ?? []} />}
      {hero === 'rules' && <TermScene {...p} icon={data?.icon ?? 'trophy'} caption={null} />}
    </View>
  );
}

type SceneProps = { readonly t: SharedValue<number>; readonly w: number; readonly h: number };

/** Progress of `t` between a and b, clamped to 0..1 (worklet). */
function seg(t: number, a: number, b: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** A pop: 0 before `at`, overshoots to 1.18, settles at 1. */
function pop(t: number, at: number, len = 0.1): number {
  'worklet';
  return interpolate(t, [at, at + len * 0.6, at + len], [0, 1.18, 1], 'clamp');
}

function Abs({ x, y, w, h, style, children }: {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly style?: object; readonly children?: ReactNode;
}) {
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h }, style]}>{children}</Animated.View>;
}

function Art({ source, w, h }: { readonly source: ImageSourcePropType | number; readonly w: number; readonly h: number }) {
  return <Image source={source} style={{ width: w, height: h }} contentFit="contain" />;
}

/** The soft oval ground shadow the How to Play demos use, centered under whatever stands on the stage. */
function Shadow({ x, y, w }: { readonly x: number; readonly y: number; readonly w: number }) {
  return <Image source={ART.groundShadow} style={{ position: 'absolute', left: x - w / 2, top: y - w * 0.12, width: w, height: w * 0.24, opacity: 0.8 }} contentFit="fill" />;
}

/* ------------------------------------------------------------------ Standings */

/** A standings row as the board draws it: rank disc, shark face, a name, the ride icon and a count. */
function MiniRow({ rank, face, you, name, children, width, height }: {
  readonly rank: ReactNode; readonly face: number; readonly you?: boolean; readonly name?: string; readonly children?: ReactNode;
  readonly width: number; readonly height: number;
}) {
  return (
    <View style={[styles.row, { width, height, borderRadius: height * 0.34 }, you && styles.rowYou]}>
      <View style={[styles.rank, { width: height * 0.62, height: height * 0.62, borderRadius: height }, you && { backgroundColor: BRAND.navy }]}>{rank}</View>
      <View style={[styles.face, { width: height * 0.76, height: height * 0.76, borderRadius: height }, you && { borderColor: BRAND.gold }]}>
        <Image source={ART.sharks[face]} style={{ width: '120%', height: '120%', marginTop: '18%' }} contentFit="cover" />
      </View>
      {/* Fixed sample names in the board's own type, never real players. */}
      <Text numberOfLines={1} style={[styles.youName, !you && { color: BRAND.navySoft }]}>{you ? 'You' : name ?? ''}</Text>
      <View style={{ flex: 1 }} />
      <GameIcon name="ride" size={height * 0.5} />
      <View style={{ width: height * 0.62, alignItems: 'center' }}>{children}</View>
    </View>
  );
}

function Swap({ t, a, b, from, to, style }: {
  readonly t: SharedValue<number>; readonly a: number; readonly b: number; readonly from: string; readonly to: string; readonly style: object;
}) {
  const out = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, a, b) }));
  const inn = useAnimatedStyle(() => {
    const k = seg(t.value, a, b);
    return { opacity: k, transform: [{ scale: interpolate(t.value, [a, b, b + 0.06, b + 0.12], [0.6, 1, 1.25, 1], 'clamp') }] };
  });
  return (
    <View>
      <Animated.Text style={[style, out]}>{from}</Animated.Text>
      <Animated.Text style={[style, StyleSheet.absoluteFill, { textAlign: 'center' }, inn]}>{to}</Animated.Text>
    </View>
  );
}

function ClimbScene({ t, w, h }: SceneProps) {
  const bw = Math.min(w - 48, 292);
  const rowH = Math.round(Math.min(40, h * 0.215));
  const gap = 6;
  const step = rowH + gap;
  const x0 = (w - bw) / 2;
  const y0 = (h - (rowH * 3 + gap * 2)) / 2;
  // The ride icon flies into your count; you pass the row above.
  const flyer = useAnimatedStyle(() => {
    const k = seg(t.value, 0.06, 0.3);
    const x = interpolate(k, [0, 1], [w + 10, x0 + bw - rowH * 1.3]);
    const y = interpolate(k, [0, 1], [h * 0.42, y0 + step * 2 + rowH * 0.1]) - Math.sin(k * Math.PI) * h * 0.22;
    const fade = interpolate(t.value, [0.05, 0.08, 0.29, 0.32], [0, 1, 1, 0], 'clamp');
    return { opacity: fade, transform: [{ translateX: x }, { translateY: y }, { scale: 1.2 - 0.4 * k }, { rotate: `${-14 + 14 * k}deg` }] };
  });
  const rise = (dir: 1 | -1, v: number) => {
    'worklet';
    const k = interpolate(v, [0.46, 0.58, 0.63, 0.9, 0.98], [0, 1.08, 1, 1, 0], 'clamp');
    return dir * k * step;
  };
  const youStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise(-1, t.value) }, { scale: interpolate(t.value, [0.44, 0.52, 0.62], [1, 1.04, 1], 'clamp') }] }));
  const midStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise(1, t.value) }] }));
  const upChip = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.6, 0.66, 0.86, 0.9], [0, 1, 1, 0], 'clamp'),
    transform: [{ translateY: rise(-1, t.value) }, { scale: pop(t.value, 0.6, 0.1) || 0.001 }],
  }));
  const rankStyle = styles.rankText;
  const countStyle = [styles.count, { fontSize: rowH * 0.5 }];
  return (
    <>
      <Abs x={x0} y={y0} w={bw} h={rowH}>
        <MiniRow width={bw} height={rowH} face={2} name="TOONS" rank={<Text style={rankStyle}>3</Text>}><Text style={countStyle}>7</Text></MiniRow>
      </Abs>
      <Abs x={x0} y={y0 + step} w={bw} h={rowH} style={midStyle}>
        <MiniRow width={bw} height={rowH} face={5} name="SURFKING" rank={<Swap t={t} a={0.52} b={0.6} from="4" to="5" style={rankStyle} />}>
          <Text style={countStyle}>6</Text>
        </MiniRow>
      </Abs>
      <Abs x={x0} y={y0 + step * 2} w={bw} h={rowH} style={youStyle}>
        <MiniRow width={bw} height={rowH} face={0} you rank={<Swap t={t} a={0.52} b={0.6} from="5" to="4" style={rankStyle} />}>
          <Swap t={t} a={0.3} b={0.36} from="6" to="7" style={countStyle} />
        </MiniRow>
      </Abs>
      <Abs x={x0 + bw * 0.42} y={y0 + step * 2 - rowH * 0.42} w={64} h={26} style={upChip}>
        <View style={styles.upChip}><GameIcon name="arrow" size={14} style={{ transform: [{ rotate: '-90deg' }] }} /><Text style={styles.upText}>Up 1</Text></View>
      </Abs>
      <Abs x={0} y={0} w={36} h={36} style={flyer}><GameIcon name="ride" size={34} /></Abs>
    </>
  );
}

function PodiumScene({ t, w, h }: SceneProps) {
  const bw = Math.min(w - 36, 320);
  const bh = bw * (683 / 1079);
  const bx = (w - bw) / 2;
  const by = h - bh * 0.5;
  // Shark spots on top of the three barrels (left 2nd, middle 1st, right 3rd), as the board's podium.
  const spots = [
    { cx: bx + bw * 0.19, top: by + bh * 0.06, size: h * 0.36, face: 3, crown: ART.crownSilver, at: 0.1 },
    { cx: bx + bw * 0.5, top: by - bh * 0.12, size: h * 0.44, face: 0, crown: ART.crownGold, at: 0.3 },
    { cx: bx + bw * 0.79, top: by + bh * 0.12, size: h * 0.33, face: 6, crown: ART.crownBronze, at: 0.2 },
  ];
  return (
    <>
      <Abs x={bx} y={by} w={bw} h={bh}><Art source={ART.barrel} w={bw} h={bh} /></Abs>
      {spots.map(spot => <PodiumShark key={spot.face} t={t} {...spot} />)}
      {[-1, 0, 1].map(i => <TicketPop key={i} t={t} cx={spots[1].cx} cy={spots[1].top + spots[1].size * 0.2} dir={i} />)}
    </>
  );
}

function PodiumShark({ t, cx, top, size, face, crown, at }: {
  readonly t: SharedValue<number>; readonly cx: number; readonly top: number; readonly size: number;
  readonly face: number; readonly crown: number; readonly at: number;
}) {
  const cw = size * 0.62;
  const ch = cw * (357 / 502);
  const crownStyle = useAnimatedStyle(() => {
    const drop = interpolate(t.value, [at, at + 0.1, at + 0.14, at + 0.18], [-size * 0.9, size * 0.05, -size * 0.04, 0], 'clamp');
    return { opacity: interpolate(t.value, [at - 0.01, at], [0, 1], 'clamp'), transform: [{ translateY: drop }] };
  });
  const bob = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [at + 0.1, at + 0.15, at + 0.22], [1, 1.08, 1], 'clamp') }] }));
  return (
    <>
      <Abs x={cx - size / 2} y={top} w={size} h={size} style={bob}><Art source={ART.sharks[face]} w={size} h={size} /></Abs>
      <Abs x={cx - cw / 2} y={top - ch * 0.72} w={cw} h={ch} style={crownStyle}><Art source={crown} w={cw} h={ch} /></Abs>
    </>
  );
}

function TicketPop({ t, cx, cy, dir }: { readonly t: SharedValue<number>; readonly cx: number; readonly cy: number; readonly dir: number }) {
  const size = 34;
  const style = useAnimatedStyle(() => {
    const k = seg(t.value, 0.48 + Math.abs(dir) * 0.03, 0.66 + Math.abs(dir) * 0.03);
    return {
      opacity: interpolate(t.value, [0.47, 0.5, 0.82, 0.9], [0, 1, 1, 0], 'clamp'),
      transform: [{ translateX: dir * k * size * 2.1 }, { translateY: -k * size * (dir === 0 ? 1.6 : 1.05) }, { rotate: `${dir * 16}deg` }, { scale: 0.5 + 0.5 * k }],
    };
  });
  return <Abs x={cx - size / 2} y={cy} w={size} h={size * 0.69} style={style}><Art source={ART.ticket} w={size} h={size * 0.69} /></Abs>;
}

const BOARDS: readonly { icon: GameIconName; label: string; unit: GameIconName; score: string; faces: readonly number[] }[] = [
  { icon: 'timer', label: 'This Week', unit: 'ride', score: '7', faces: [0] },
  { icon: 'heart', label: 'Friends', unit: 'ride', score: '4', faces: [4, 1] },
  { icon: 'trophy', label: 'All-Time', unit: 'coin', score: '52', faces: [6] },
];

/** The three boards as three cards; each takes its turn lifting into the spotlight, like tapping its tab. */
function BoardsScene({ t, w, h }: SceneProps) {
  const gap = 12;
  const cw = Math.min((w - 40 - gap * 2) / 3, 104);
  const ch = Math.min(h - 36, cw * 1.25);
  const x0 = (w - (cw * 3 + gap * 2)) / 2;
  const y0 = (h - ch) / 2 + 4;
  return (
    <>
      {BOARDS.map((board, i) => <BoardCard key={board.label} t={t} i={i} x={x0 + i * (cw + gap)} y={y0} w={cw} h={ch} board={board} />)}
    </>
  );
}

function BoardCard({ t, i, x, y, w, h, board }: {
  readonly t: SharedValue<number>; readonly i: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly board: typeof BOARDS[number];
}) {
  // Each card owns a third of the loop: lift in, hold, settle.
  const on = (v: number) => {
    'worklet';
    const a = i / 3;
    return interpolate(v, [a, a + 0.06, a + 0.27, a + 0.33], [0, 1, 1, 0], 'clamp');
  };
  const card = useAnimatedStyle(() => {
    const k = on(t.value);
    return { transform: [{ translateY: -8 * k }, { scale: 1 + 0.07 * k }], shadowOpacity: 0.12 + 0.18 * k };
  });
  const ring = useAnimatedStyle(() => ({ opacity: on(t.value) }));
  const icon = h * 0.34;
  return (
    <Abs x={x} y={y} w={w} h={h} style={[styles.boardCard, card]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.boardRing, ring]} />
      <GameIcon name={board.icon} size={icon} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.boardLabel}>{board.label}</Text>
      <View style={styles.boardScore}>
        {board.faces.map((face, n) => (
          <View key={face} style={[styles.boardFace, n > 0 && { marginLeft: -8 }]}>
            <Image source={ART.sharks[face]} style={{ width: '120%', height: '120%', marginTop: '18%' }} contentFit="cover" />
          </View>
        ))}
        <GameIcon name={board.unit} size={18} />
        <Text style={styles.boardNum}>{board.score}</Text>
      </View>
    </Abs>
  );
}

/* ------------------------------------------------------------------ Pins */

function PinSwapScene({ t, w, h }: SceneProps) {
  const pin = Math.min(h * 0.42, 78);
  const slot = { x: w * 0.2, y: h * 0.58 };
  const board = { x: w * 0.78, y: h * 0.36 };
  const travel = (from: { x: number; y: number }, to: { x: number; y: number }, lift: number, tilt: number, v: number) => {
    'worklet';
    const k = interpolate(v, [0.22, 0.58, 0.9, 0.98], [0, 1, 1, 0], 'clamp');
    const ease = k * k * (3 - 2 * k);
    const arc = Math.sin(ease * Math.PI) * lift;
    const up = interpolate(v, [0.1, 0.2, 0.58, 0.66, 0.9, 0.98], [1, 1.12, 1.12, 1, 1, 1], 'clamp');
    return {
      transform: [
        { translateX: from.x + (to.x - from.x) * ease - pin / 2 }, { translateY: from.y + (to.y - from.y) * ease - pin / 2 - arc },
        { rotate: `${tilt * (1 - ease) + -tilt * ease}deg` }, { scale: up },
      ],
    };
  };
  const theirs = useAnimatedStyle(() => travel(board, slot, h * 0.22, 7, t.value));
  const mine = useAnimatedStyle(() => travel(slot, board, -h * 0.18, -5, t.value));
  const swapIcon = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(t.value, [0.22, 0.58], [0, 180], 'clamp')}deg` }, { scale: interpolate(t.value, [0.18, 0.24, 0.56, 0.62], [1, 1.15, 1.15, 1], 'clamp') }],
  }));
  return (
    <>
      <View style={[styles.slot, { left: slot.x - pin * 0.72, top: slot.y - pin * 0.72, width: pin * 1.44, height: pin * 1.44, borderRadius: pin * 0.4 }]} />
      <Abs x={w / 2 - 22} y={h * 0.44 - 22} w={44} h={44} style={swapIcon}><GameIcon name="swap" size={44} /></Abs>
      <Abs x={0} y={0} w={pin} h={pin} style={mine}><Art source={ART.pinHoney} w={pin} h={pin} /></Abs>
      <Abs x={0} y={0} w={pin} h={pin} style={theirs}><Art source={ART.pinBurger} w={pin} h={pin} /></Abs>
      {[0, 1, 2].map(i => <Sparkle key={i} t={t} at={0.6 + i * 0.04} x={slot.x + (i - 1) * pin * 0.55} y={slot.y - pin * (0.55 + (i % 2) * 0.2)} />)}
    </>
  );
}

function Sparkle({ t, at, x, y, size = 22 }: { readonly t: SharedValue<number>; readonly at: number; readonly x: number; readonly y: number; readonly size?: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at, at + 0.04, at + 0.16, at + 0.22], [0, 1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(t.value, [at, at + 0.08, at + 0.22], [0.2, 1.1, 0.7], 'clamp') }, { rotate: `${interpolate(t.value, [at, at + 0.22], [0, 50], 'clamp')}deg` }],
  }));
  return <Abs x={x - size / 2} y={y - size / 2} w={size} h={size} style={style}><GameIcon name="sparkle" size={size} /></Abs>;
}

function PinClockScene({ t, w, h }: SceneProps) {
  const pin = Math.min(h * 0.5, 92);
  const r = pin * 0.72;
  const c = 2 * Math.PI * r;
  const cx = w * 0.42;
  const cy = h * 0.47;
  const ring = useAnimatedProps(() => ({ strokeDashoffset: c * t.value }));
  const tick = useAnimatedStyle(() => {
    const phase = (t.value * 12) % 1;
    return { transform: [{ rotate: `${interpolate(phase, [0, 0.08, 0.16, 0.24], [0, -12, 8, 0], 'clamp')}deg` }] };
  });
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: Math.sin(t.value * Math.PI * 4) * 2.5 }, { rotate: '-4deg' }] }));
  const size = r * 2 + 16;
  return (
    <>
      <Abs x={cx - size / 2} y={cy - size / 2} w={size} h={size}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.75)" strokeWidth={9} fill="rgba(255,248,228,0.55)" />
          <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={BRAND.gold} strokeWidth={9} fill="none" strokeLinecap="round"
            strokeDasharray={`${c} ${c}`} animatedProps={ring} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
      </Abs>
      <Abs x={cx - pin / 2} y={cy - pin / 2} w={pin} h={pin} style={lift}><Art source={ART.pinAstro} w={pin} h={pin} /></Abs>
      <Abs x={cx + r + 14} y={cy - 26} w={52} h={52} style={tick}><GameIcon name="timer" size={50} /></Abs>
      <Abs x={w * 0.1} y={h * 0.2} w={52} h={52} style={{ transform: [{ rotate: '-10deg' }] }}><Art source={ART.pinHat} w={50} h={50} /></Abs>
    </>
  );
}

/* ------------------------------------------------------------------ Shop */

function Tile({ tile, item, w, price, itemScale = 0.66 }: {
  readonly tile: number; readonly item?: number | null; readonly w: number; readonly price?: boolean; readonly itemScale?: number;
}) {
  const th = w * (220 / 152);
  return (
    <View style={{ width: w, height: th }}>
      <Image source={tile} style={StyleSheet.absoluteFill} contentFit="fill" />
      {item != null && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: th * 0.1, height: th * 0.5, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={item} style={{ width: w * itemScale, height: th * 0.42 }} contentFit="contain" />
        </View>
      )}
      {price && (
        <View style={[styles.price, { top: th * 0.765, height: th * 0.17 }]}>
          <GameIcon name="coin" size={th * 0.13} />
        </View>
      )}
    </View>
  );
}

function GearScene({ t, w, h }: SceneProps) {
  const tw = Math.min(h * 0.46, 82);
  const th = tw * (220 / 152);
  const tx = w * 0.12;
  const ty = (h - th) / 2 + 4;
  const sh = h * 0.86;
  const sw = sh * (594 / 660);
  const sx = w * 0.58;
  const sy = h - sh + 6;
  // The cap leaves its tile and lands on the shark's head (try it on).
  const capW = sw * 0.5;
  const capH = capW * (146 / 200);
  const from = { x: tx + tw / 2 - capW / 2, y: ty + th * 0.18 };
  const to = { x: sx + sw * 0.06, y: sy - capH * 0.18 };
  const cap = useAnimatedStyle(() => {
    const k = seg(t.value, 0.34, 0.62);
    const ease = 1 - Math.pow(1 - k, 3);
    const land = interpolate(t.value, [0.62, 0.66, 0.72], [1, 0.9, 1], 'clamp');
    const back = interpolate(t.value, [0.9, 0.97], [1, 0], 'clamp');
    return {
      opacity: interpolate(t.value, [0.9, 0.95, 0.97, 1], [1, 0, 0, 1], 'clamp'),
      transform: [
        { translateX: (from.x + (to.x - from.x) * ease) * back + from.x * (1 - back) },
        { translateY: (from.y + (to.y - from.y) * ease - Math.sin(ease * Math.PI) * h * 0.22) * back + from.y * (1 - back) },
        { rotate: `${-18 * ease * back}deg` }, { scaleX: (0.62 + 0.38 * ease * back) }, { scaleY: (0.62 + 0.38 * ease * back) * land },
      ],
    };
  });
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: pop(t.value, 0.12, 0.12) }] }));
  const shark = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0.62, 0.66, 0.74], [0, 4, 0], 'clamp') }, { rotate: `${interpolate(t.value, [0.64, 0.7, 0.78], [0, 4, 0], 'clamp')}deg` }] }));
  return (
    <>
      <Abs x={tx} y={ty} w={tw} h={th}><Tile tile={ART.tileGold} item={null} w={tw} price /></Abs>
      <Abs x={tx + tw + 10} y={ty} w={tw} h={th}><Tile tile={ART.tileGreen} item={ART.shades} w={tw} price /></Abs>
      <Abs x={tx + tw * 2 - 8} y={ty - 6} w={28} h={28} style={heart}><GameIcon name="heart" size={28} /></Abs>
      <Shadow x={sx + sw * 0.5} y={h - 4} w={sw * 0.6} />
      <Abs x={sx} y={sy} w={sw} h={sh} style={shark}><Art source={ART.sharkHappy} w={sw} h={sh} /></Abs>
      <Abs x={0} y={0} w={capW} h={capH} style={cap}><Art source={ART.cap} w={capW} h={capH} /></Abs>
    </>
  );
}

function DailyScene({ t, w, h }: SceneProps) {
  const tw = Math.min(h * 0.44, 78);
  const th = tw * (220 / 152);
  const gap = 12;
  const total = tw * 3 + gap * 2;
  const x0 = (w - total) / 2;
  const y0 = (h - th) / 2 + 8;
  const tiles = [
    { tile: ART.tileBlue, item: ART.tee, at: 0.04 },
    { tile: ART.tileGold, item: ART.cap, at: 0.12 },
    { tile: ART.tileGreen, item: ART.shades, at: 0.2 },
  ];
  return (
    <>
      {tiles.map((tile, i) => <DailyTile key={i} t={t} x={x0 + i * (tw + gap)} y={y0} tw={tw} th={th} {...tile} w={w} />)}
      <Abs x={w / 2 - 60} y={y0 - 34} w={120} h={28}>
        <View style={styles.dailyPill}><GameIcon name="timer" size={18} /><Text style={styles.dailyText}>Daily</Text></View>
      </Abs>
    </>
  );
}

function DailyTile({ t, x, y, tw, th, tile, item, at, w }: {
  readonly t: SharedValue<number>; readonly x: number; readonly y: number; readonly tw: number; readonly th: number;
  readonly tile: number; readonly item: number; readonly at: number; readonly w: number;
}) {
  const slide = useAnimatedStyle(() => {
    const k = seg(t.value, at, at + 0.2);
    const ease = 1 - Math.pow(1 - k, 3);
    return {
      opacity: interpolate(t.value, [at, at + 0.06, 0.9, 0.98], [0, 1, 1, t.value >= 0.999 ? 1 : 0], 'clamp'),
      transform: [{ translateX: (1 - ease) * (w - x) * 0.6 }, { rotate: `${(1 - ease) * 8}deg` }],
    };
  });
  const tag = useAnimatedStyle(() => ({ transform: [{ scale: pop(t.value, at + 0.3, 0.12) }, { rotate: '-12deg' }] }));
  return (
    <Abs x={x} y={y} w={tw} h={th} style={slide}>
      <Tile tile={tile} item={item} w={tw} price />
      <Animated.View style={[{ position: 'absolute', left: -tw * 0.18, top: -th * 0.08, width: tw * 0.7, height: tw * 0.46 }, tag]}>
        <GameIcon name="new" size={tw * 0.7} />
      </Animated.View>
    </Abs>
  );
}

function SuppliesScene({ t, w, h }: SceneProps) {
  const cw = Math.min(h * 0.62, 118);
  const ch = cw * (432 / 458);
  const cx = w / 2;
  const cy = h - ch - 6;
  const items: readonly { src: number; aspect: number; dx: number; dy: number; at: number; size: number }[] = [
    { src: ART.ticket, aspect: 549 / 799, dx: -1.35, dy: 0.9, at: 0.08, size: 52 },
    { src: ART.energy, aspect: 284 / 196, dx: 0, dy: 1.25, at: 0.16, size: 30 },
    { src: ART.ticket, aspect: 549 / 799, dx: 1.35, dy: 0.95, at: 0.24, size: 48 },
  ];
  return (
    <>
      <Shadow x={cx} y={h - 6} w={cw * 0.9} />
      <Abs x={cx - cw / 2} y={cy} w={cw} h={ch}><Art source={ART.chestOpen} w={cw} h={ch} /></Abs>
      {items.map((item, i) => <Burst key={i} t={t} cx={cx} cy={cy + ch * 0.3} reach={cw * 0.55} {...item} />)}
      <Abs x={w - 132} y={h - 40} w={120} h={30}>
        <View style={styles.grownUp}><GameIcon name="lock" size={16} /><Text style={styles.grownUpText}>Grown-ups</Text></View>
      </Abs>
    </>
  );
}

/** Something that bursts up out of a chest or spot, then floats. */
function Burst({ t, cx, cy, reach, src, icon, aspect = 1, dx, dy, at, size }: {
  readonly t: SharedValue<number>; readonly cx: number; readonly cy: number; readonly reach: number;
  readonly src?: number; readonly icon?: GameIconName; readonly aspect?: number;
  readonly dx: number; readonly dy: number; readonly at: number; readonly size: number;
}) {
  const ih = size * aspect;
  const style = useAnimatedStyle(() => {
    const k = seg(t.value, at, at + 0.2);
    const ease = 1 - Math.pow(1 - k, 3);
    const float = Math.sin(t.value * Math.PI * 4 + dx) * 2;
    return {
      opacity: interpolate(t.value, [at - 0.01, at + 0.02, 0.9, 0.98], [0, 1, 1, t.value >= 0.999 ? 1 : 0], 'clamp'),
      transform: [{ translateX: dx * reach * ease }, { translateY: -dy * reach * ease + float }, { scale: 0.4 + 0.6 * ease }, { rotate: `${dx * 10 * ease}deg` }],
    };
  });
  return (
    <Abs x={cx - size / 2} y={cy - ih / 2} w={size} h={ih} style={style}>
      {src != null ? <Art source={src} w={size} h={ih} /> : <GameIcon name={icon ?? 'coin'} size={size} />}
    </Abs>
  );
}

/* ------------------------------------------------------------------ Park */

/** The park page as it looks: the Ride Coins ribbon over a blue panel of coin slots; a won coin drops into its slot. */
function ShelfScene({ t, w, h }: SceneProps) {
  const pw = Math.min(w - 40, 300);
  const px = (w - pw) / 2;
  const ribbonW = Math.min(pw * 0.78, 220);
  const ribbonH = ribbonW / 3.92;
  const top = h * 0.12;
  const panelY = top + ribbonH * 0.62;
  const panelH = h - panelY + 20;
  const slot = Math.min(54, (pw - 50) / 4);
  const gap = (pw - slot * 4) / 5;
  const cy = panelY + (h - panelY) / 2 + 2;
  const xs = [0, 1, 2, 3].map(i => px + gap + i * (slot + gap) + slot / 2);
  const coin = slot * 0.86;
  const drop = useAnimatedStyle(() => {
    const y = interpolate(t.value, [0.14, 0.32, 0.37, 0.42], [-h * 0.75, 5, -5, 0], 'clamp');
    return {
      opacity: interpolate(t.value, [0.13, 0.15, 0.9, 0.97], [0, 1, 1, t.value >= 0.999 ? 1 : 0], 'clamp'),
      transform: [{ translateY: y }, { rotate: `${interpolate(t.value, [0.14, 0.32], [-200, 0], 'clamp')}deg` }],
    };
  });
  const glow = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.34, 0.4, 0.62], [0, 0.9, 0], 'clamp'), transform: [{ scale: interpolate(t.value, [0.34, 0.62], [0.8, 1.5], 'clamp') }] }));
  const secret = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.05 * Math.sin(t.value * Math.PI * 4) }] }));
  return (
    <>
      <View style={[styles.coinPanel, { left: px, top: panelY, width: pw, height: panelH }]} />
      {xs.map((x, i) => (
        <View key={i} style={[styles.coinSlot, { left: x - slot / 2, top: cy - slot / 2, width: slot, height: slot, borderRadius: slot }]}>
          {i < 2 ? <GameIcon name="coin" size={coin} /> : null}
        </View>
      ))}
      <Abs x={xs[2] - slot * 0.75} y={cy - slot * 0.75} w={slot * 1.5} h={slot * 1.5} style={glow}><View style={styles.slotGlow} /></Abs>
      <Abs x={xs[2] - coin / 2} y={cy - coin / 2} w={coin} h={coin} style={drop}><GameIcon name="coin" size={coin} /></Abs>
      <Sparkle t={t} at={0.36} x={xs[2] - coin * 0.55} y={cy - coin * 0.6} />
      <Sparkle t={t} at={0.4} x={xs[2] + coin * 0.6} y={cy - coin * 0.3} size={18} />
      <Abs x={xs[3] - slot / 2} y={cy - slot / 2} w={slot} h={slot} style={[{ alignItems: 'center', justifyContent: 'center' }, secret]}>
        <GameIcon name="search" size={slot * 0.56} />
      </Abs>
      <Abs x={(w - ribbonW) / 2} y={top} w={ribbonW} h={ribbonH}><Ribbon text="Ride Coins" /></Abs>
    </>
  );
}

const LEVEL_SHOW = [1, 3, 7, 10].map(level => COIN_TIERS.find(tier => tier.level === level)!).filter(Boolean);

function LevelsScene({ t, w, h }: SceneProps) {
  const coin = Math.min(h * 0.46, 86);
  const cx = w / 2;
  const cy = h * 0.42;
  const n = LEVEL_SHOW.length;
  return (
    <>
      {LEVEL_SHOW.map((tier, i) => <LevelRing key={tier.level} t={t} i={i} n={n} cx={cx} cy={cy} coin={coin} ring={tier.ring} deep={tier.ringDeep} halo={tier.halo} width={tier.ringWidth} />)}
      <Abs x={cx - coin / 2} y={cy - coin / 2} w={coin} h={coin}><GameIcon name="coin" size={coin} /></Abs>
      <CrownDrop t={t} cx={cx} top={cy - coin * 1.02} size={coin * 0.62} />
      {[0, 1, 2].map(i => (
        <Feeder key={i} t={t} at={i / n + 0.08} cx={cx} cy={cy} from={i % 2 === 0 ? -1 : 1} icon={i % 2 === 0 ? 'energy' : 'parts'} w={w} />
      ))}
      {LEVEL_SHOW.map((tier, i) => <LevelPill key={tier.level} t={t} i={i} n={n} cx={cx} y={cy + coin * 0.72} name={tier.name} level={tier.level} deep={tier.ringDeep} />)}
    </>
  );
}

/** Which of the n levels is showing, as a 0..1 weight for level i (crossfades at each boundary). */
function levelWeight(v: number, i: number, n: number): number {
  'worklet';
  const start = i / n;
  const end = (i + 1) / n;
  const fadeIn = i === 0 ? 1 : seg(v, start, start + 0.05);
  const fadeOut = i === n - 1 ? 1 : 1 - seg(v, end, end + 0.05);
  return Math.min(fadeIn, fadeOut);
}

function LevelRing({ t, i, n, cx, cy, coin, ring, deep, halo, width }: {
  readonly t: SharedValue<number>; readonly i: number; readonly n: number; readonly cx: number; readonly cy: number;
  readonly coin: number; readonly ring: string; readonly deep: string; readonly halo: string; readonly width: number;
}) {
  const size = coin * 1.32;
  const style = useAnimatedStyle(() => {
    const k = levelWeight(t.value, i, n);
    const burst = interpolate(t.value, [i / n, i / n + 0.05, i / n + 0.1], [1.25, 0.96, 1], 'clamp');
    return { opacity: k, transform: [{ scale: i === 0 ? 1 : burst }] };
  });
  return (
    <Abs x={cx - size / 2} y={cy - size / 2} w={size} h={size} style={style}>
      <View style={{ flex: 1, borderRadius: size, backgroundColor: halo, borderWidth: width * 1.5, borderColor: ring, borderBottomColor: deep }} />
    </Abs>
  );
}

function LevelPill({ t, i, n, cx, y, name, level, deep }: {
  readonly t: SharedValue<number>; readonly i: number; readonly n: number; readonly cx: number; readonly y: number;
  readonly name: string; readonly level: number; readonly deep: string;
}) {
  const style = useAnimatedStyle(() => ({ opacity: levelWeight(t.value, i, n) }));
  return (
    <Abs x={cx - 90} y={y} w={180} h={30} style={[{ alignItems: 'center' }, style]}>
      <View style={[styles.levelPill, { borderColor: deep }]}>
        <Text style={styles.levelNum}>Lv {level}</Text>
        <Text style={styles.levelName}>{name}</Text>
      </View>
    </Abs>
  );
}

function CrownDrop({ t, cx, top, size }: { readonly t: SharedValue<number>; readonly cx: number; readonly top: number; readonly size: number }) {
  const at = 0.75;
  const ch = size * (364 / 384);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at, at + 0.02], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(t.value, [at, at + 0.06, at + 0.08, at + 0.1], [-40, 4, -3, 0], 'clamp') }, { rotate: '-8deg' }],
  }));
  return <Abs x={cx - size / 2} y={top} w={size} h={ch} style={style}><GameIcon name="crown" size={size} /></Abs>;
}

function Feeder({ t, at, cx, cy, from, icon, w }: {
  readonly t: SharedValue<number>; readonly at: number; readonly cx: number; readonly cy: number;
  readonly from: -1 | 1; readonly icon: GameIconName; readonly w: number;
}) {
  const size = 30;
  const style = useAnimatedStyle(() => {
    const k = seg(t.value, at, at + 0.14);
    const startX = cx + from * w * 0.36;
    return {
      opacity: interpolate(t.value, [at - 0.01, at + 0.02, at + 0.12, at + 0.15], [0, 1, 1, 0], 'clamp'),
      transform: [{ translateX: startX + (cx - startX) * k - size / 2 }, { translateY: cy - size / 2 - Math.sin(k * Math.PI) * 30 }, { scale: 1 - 0.5 * k }],
    };
  });
  return <Abs x={0} y={0} w={size} h={size} style={style}><GameIcon name={icon} size={size} /></Abs>;
}

/* ------------------------------------------------------------------ Redeem */

function ChestScene({ t, w, h }: SceneProps) {
  const cw = Math.min(h * 0.6, 116);
  const closedH = cw * (305 / 374);
  const openH = cw * (432 / 458);
  const cx = w / 2;
  const base = h - 8;
  const shake = useAnimatedStyle(() => {
    const k = seg(t.value, 0.3, 0.42);
    return {
      opacity: interpolate(t.value, [0.42, 0.44, 0.92, 0.97], [1, 0, 0, 1], 'clamp'),
      transform: [{ rotate: `${Math.sin(k * Math.PI * 6) * 7 * (1 - k * 0.3)}deg` }],
    };
  });
  const open = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.42, 0.44, 0.92, 0.97], [0, 1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(t.value, [0.42, 0.47, 0.52], [0.9, 1.08, 1], 'clamp') }],
  }));
  const dots = [0, 1, 2, 3, 4, 5];
  return (
    <>
      <Abs x={cx - 96} y={h * 0.1} w={192} h={38}>
        <View style={styles.codeField}>
          <GameIcon name="edit" size={20} />
          <View style={{ flexDirection: 'row', gap: 7, marginLeft: 8 }}>
            {dots.map(i => <CodeDot key={i} t={t} at={0.02 + i * 0.04} />)}
          </View>
        </View>
      </Abs>
      <Shadow x={cx} y={base} w={cw * 0.9} />
      <Abs x={cx - cw / 2} y={base - closedH} w={cw} h={closedH} style={shake}><Art source={ART.chestClosed} w={cw} h={closedH} /></Abs>
      <Abs x={cx - cw / 2} y={base - openH} w={cw} h={openH} style={open}><Art source={ART.chestOpen} w={cw} h={openH} /></Abs>
      <Burst t={t} cx={cx} cy={base - openH * 0.55} reach={cw * 0.62} icon="coin" dx={-1.5} dy={0.55} at={0.46} size={32} />
      <Burst t={t} cx={cx} cy={base - openH * 0.55} reach={cw * 0.62} src={ART.ticket} aspect={549 / 799} dx={-0.75} dy={0.95} at={0.5} size={42} />
      <Burst t={t} cx={cx} cy={base - openH * 0.55} reach={cw * 0.62} src={ART.energy} aspect={284 / 196} dx={0.75} dy={0.95} at={0.54} size={24} />
      <Burst t={t} cx={cx} cy={base - openH * 0.55} reach={cw * 0.62} src={ART.cap} aspect={146 / 200} dx={1.5} dy={0.55} at={0.58} size={44} />
    </>
  );
}

function CodeDot({ t, at }: { readonly t: SharedValue<number>; readonly at: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at, at + 0.02, 0.92, 0.97], [0.18, 1, 1, t.value >= 0.999 ? 1 : 0.18], 'clamp'),
    transform: [{ scale: interpolate(t.value, [at, at + 0.02, at + 0.05], [0.6, 1.3, 1], 'clamp') }],
  }));
  return <Animated.View style={[styles.codeDot, style]} />;
}

/* ------------------------------------------------------------------ Social */

function ShareScene({ t, w, h }: SceneProps) {
  const badge = Math.min(h * 0.4, 72);
  const cardW = Math.min(w * 0.56, 220);
  const cardH = 52;
  const x = w * 0.36;
  return (
    <>
      <Abs x={w * 0.08} y={h / 2 - badge / 2} w={badge} h={badge}><PencilBadge t={t} size={badge} /></Abs>
      <PostCard t={t} at={0.06} x={x} y={h * 0.14} w={cardW} h={cardH} face={1} art={ART.churro} likes={['2', '3']} likeAt={0.5} caption="Churro time!" />
      <PostCard t={t} at={0.22} x={x + 14} y={h * 0.14 + cardH + 12} w={cardW} h={cardH} face={0} icon="ride" likes={['4', '5']} likeAt={0.62} caption="Rode it twice!" />
    </>
  );
}

function PencilBadge({ t, size }: { readonly t: SharedValue<number>; readonly size: number }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(t.value, [0, 0.04, 0.08, 0.12], [0, -10, 8, 0], 'clamp')}deg` }, { scale: interpolate(t.value, [0, 0.05, 0.1], [1, 1.08, 1], 'clamp') }] }));
  return <Animated.View style={style}><Art source={ART.compose} w={size} h={size} /></Animated.View>;
}

function PostCard({ t, at, x, y, w, h, face, art, icon, likes, likeAt, caption }: {
  readonly caption: string;
  readonly t: SharedValue<number>; readonly at: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly face: number; readonly art?: number; readonly icon?: GameIconName; readonly likes: readonly [string, string] | string[]; readonly likeAt: number;
}) {
  const style = useAnimatedStyle(() => {
    const k = seg(t.value, at, at + 0.16);
    const ease = 1 - Math.pow(1 - k, 3);
    return {
      opacity: interpolate(t.value, [at, at + 0.06, 0.9, 0.97], [0, 1, 1, t.value >= 0.999 ? 1 : 0], 'clamp'),
      transform: [{ translateY: (1 - ease) * 34 }, { scale: 0.94 + 0.06 * ease }],
    };
  });
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [likeAt, likeAt + 0.05, likeAt + 0.1], [1, 1.45, 1], 'clamp') }] }));
  return (
    <Abs x={x} y={y} w={w} h={h} style={style}>
      <View style={[styles.post, { height: h }]}>
        <View style={styles.postFace}><Image source={ART.sharks[face]} style={{ width: '120%', height: '120%', marginTop: '18%' }} contentFit="cover" /></View>
        <Text numberOfLines={1} style={styles.postCaption}>{caption}</Text>
        {art != null ? <Image source={art} style={{ width: h * 0.62, height: h * 0.62 }} contentFit="contain" /> : <GameIcon name={icon ?? 'ride'} size={h * 0.56} />}
        <View style={styles.likeChip}>
          <Animated.View style={heart}><GameIcon name="heart" size={16} /></Animated.View>
          <Swap t={t} a={likeAt} b={likeAt + 0.04} from={likes[0]} to={likes[1]} style={styles.likeText} />
        </View>
      </View>
    </Abs>
  );
}

function SafeScene({ t, w, h }: SceneProps) {
  const shark = Math.min(h * 0.86, 150);
  const disc = Math.min(h * 0.32, 58);
  const icons: readonly { icon: GameIconName; at: number }[] = [{ icon: 'heart', at: 0.06 }, { icon: 'lock', at: 0.16 }, { icon: 'info', at: 0.26 }];
  const x0 = w * 0.44;
  const span = Math.min(w * 0.5, 210);
  return (
    <>
      <Shadow x={w * 0.24} y={h - 6} w={shark * 0.55} />
      <Abs x={w * 0.24 - shark / 2} y={h - shark + 2} w={shark} h={shark}><Art source={ART.socialShark} w={shark} h={shark} /></Abs>
      {icons.map((item, i) => (
        <SafeDisc key={item.icon} t={t} at={item.at} icon={item.icon} size={disc}
          x={x0 + (span / 3) * i + (span / 3 - disc) / 2} y={h / 2 - disc / 2 + (i === 1 ? -h * 0.12 : h * 0.04)} />
      ))}
    </>
  );
}

function SafeDisc({ t, at, icon, size, x, y }: {
  readonly t: SharedValue<number>; readonly at: number; readonly icon: GameIconName; readonly size: number; readonly x: number; readonly y: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at - 0.01, at + 0.02, 0.9, 0.97], [0, 1, 1, t.value >= 0.999 ? 1 : 0], 'clamp'),
    transform: [{ scale: pop(t.value, at, 0.12) || 0.001 }, { translateY: Math.sin((t.value + at) * Math.PI * 4) * 2 }],
  }));
  return (
    <Abs x={x} y={y} w={size} h={size} style={style}>
      <View style={[styles.safeDisc, { width: size, height: size, borderRadius: size }]}><GameIcon name={icon} size={size * 0.62} /></View>
    </Abs>
  );
}

/* ------------------------------------------------------------------ Data heroes */

function TermScene({ t, w, h, icon, caption }: SceneProps & { readonly icon: GameIconName; readonly caption: string | null }) {
  const size = Math.min(h * 0.5, 92);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: Math.sin(t.value * Math.PI * 2) * 3 }, { rotate: `${Math.sin(t.value * Math.PI * 2 + 1) * 3}deg` }] }));
  const glow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * Math.sin(t.value * Math.PI * 2) }] }));
  const cy = caption ? h * 0.42 : h * 0.5;
  return (
    <>
      <Abs x={w / 2 - size * 0.7} y={cy - size * 0.7} w={size * 1.4} h={size * 1.4} style={glow}>
        <View style={styles.termGlow} />
      </Abs>
      <Abs x={w / 2 - size / 2} y={cy - size / 2} w={size} h={size} style={bob}><GameIcon name={icon} size={size} /></Abs>
      {caption ? (
        <Abs x={w / 2 - 110} y={cy + size * 0.62} w={220} h={32} style={{ alignItems: 'center' }}>
          <View style={styles.captionPill}><Text style={styles.captionText} numberOfLines={1}>{caption}</Text></View>
        </Abs>
      ) : null}
    </>
  );
}

function OddsScene({ t, w, h, rows }: SceneProps & { readonly rows: readonly { tier: RarityTier; percent: number }[] }) {
  const bw = Math.min(w - 40, 320);
  const x0 = (w - bw) / 2;
  const rowH = Math.min(24, (h - 24) / Math.max(1, rows.length) - 5);
  const top = (h - rows.length * (rowH + 5)) / 2;
  const max = Math.max(1, ...rows.map(row => row.percent));
  return (
    <>
      {rows.map((row, i) => (
        <OddsBar key={row.tier} t={t} i={i} x={x0} y={top + i * (rowH + 5)} w={bw} h={rowH} tier={row.tier} percent={row.percent} max={max} />
      ))}
    </>
  );
}

function OddsBar({ t, i, x, y, w, h, tier, percent, max }: {
  readonly t: SharedValue<number>; readonly i: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly tier: RarityTier; readonly percent: number; readonly max: number;
}) {
  const look = RARITY_LOOK[tier];
  const labelW = 104;
  const trackW = w - labelW - 50;
  // True scale against the biggest share; a tiny share still shows as a dot.
  const dot = h * 0.62;
  const fill = Math.max(dot, trackW * (percent / max));
  const grow = useAnimatedStyle(() => ({ width: dot + (fill - dot) * seg(t.value, i * 0.08, 0.5 + i * 0.08) }));
  return (
    <Abs x={x} y={y} w={w} h={h}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: h }}>
        <View style={[styles.oddsLabel, { width: labelW, height: h, backgroundColor: look.chip, borderColor: look.frame }]}>
          <Text numberOfLines={1} style={[styles.oddsLabelText, { color: look.ink }]}>{look.label}</Text>
        </View>
        <View style={[styles.oddsTrack, { width: trackW, height: h * 0.62 }]}>
          <Animated.View style={[{ height: '100%', borderRadius: h, backgroundColor: look.frame }, grow]} />
        </View>
        <Text style={styles.oddsPct}>{percent}%</Text>
      </View>
    </Abs>
  );
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden', backgroundColor: BRAND.skyDeep },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#d7ecfb',
    paddingHorizontal: 8, gap: 8, shadowColor: BRAND.navy, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  rowYou: { backgroundColor: '#fff6d8', borderColor: BRAND.gold, borderWidth: 3 },
  rank: { backgroundColor: BRAND.blue, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, textAlign: 'center', includeFontPadding: false },
  face: { overflow: 'hidden', backgroundColor: '#e8f4ff', borderWidth: 2, borderColor: '#cfe6fb', alignItems: 'center' },
  youName: { flexShrink: 1, fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 2 },
  count: { fontFamily: 'Shark', color: BRAND.blue, textAlign: 'center' },
  upChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.gold, borderRadius: 999, borderWidth: 2,
    borderColor: BRAND.white, paddingHorizontal: 8, height: 26, alignSelf: 'flex-start',
  },
  upText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  boardFace: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e8f4ff', alignItems: 'center', borderWidth: 1.5, borderColor: BRAND.white },
  boardCard: {
    backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 2.5, borderColor: '#cfe6fb', borderBottomWidth: 5, borderBottomColor: '#9cc3e8',
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6,
    shadowColor: BRAND.navy, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  boardRing: { borderRadius: 18, borderWidth: 3, borderColor: BRAND.gold, margin: -3 },
  boardLabel: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  boardScore: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  boardNum: { fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, marginTop: 2 },
  slot: { position: 'absolute', backgroundColor: 'rgba(255,248,228,0.9)', borderWidth: 3, borderColor: BRAND.white, borderStyle: 'dashed' },
  price: {
    position: 'absolute', left: '22%', right: '22%', borderRadius: 999, backgroundColor: 'rgba(5,52,110,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  dailyPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, borderRadius: 999,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.gold,
  },
  dailyText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  grownUp: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, borderRadius: 999,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#d7ecfb',
  },
  grownUpText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  coinPanel: { position: 'absolute', backgroundColor: BRAND.blue, borderRadius: 22, borderWidth: 3, borderColor: BRAND.white },
  coinSlot: {
    position: 'absolute', backgroundColor: '#0a4f9c', borderWidth: 3, borderColor: '#2f86d6', alignItems: 'center', justifyContent: 'center',
  },
  slotGlow: { flex: 1, borderRadius: 999, backgroundColor: 'rgba(255,224,122,0.55)' },
  levelPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, borderRadius: 999, backgroundColor: BRAND.white,
    borderWidth: 2, paddingHorizontal: 12,
  },
  levelNum: { fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, marginTop: 2 },
  levelName: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 2 },
  codeField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white, borderRadius: 14, borderWidth: 2,
    borderColor: '#d7ecfb', paddingHorizontal: 12,
  },
  codeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND.navy },
  post: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 2,
    borderColor: '#d7ecfb', paddingHorizontal: 8, shadowColor: BRAND.navy, shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  postCaption: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  postFace: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: '#e8f4ff', alignItems: 'center' },
  likeChip: {
    position: 'absolute', right: -8, bottom: -10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.white,
    borderRadius: 999, borderWidth: 2, borderColor: '#ffd0cc', paddingHorizontal: 6, height: 24,
  },
  likeText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  safeDisc: {
    backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#d7ecfb',
    shadowColor: BRAND.navy, shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
  },
  termGlow: { flex: 1, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  captionPill: {
    height: 32, borderRadius: 999, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.gold, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  captionText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 2 },
  oddsLabel: { borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  oddsLabelText: { fontFamily: 'Shark', fontSize: 14, marginTop: 2 },
  oddsTrack: { borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', overflow: 'hidden', justifyContent: 'center' },
  oddsPct: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, width: 42, textAlign: 'right' },
});
