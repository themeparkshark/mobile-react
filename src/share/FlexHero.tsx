/**
 * The hero of each flex card: the thing itself, big and glorious, inside an
 * Alex-style frame (navy outline, two-tone body, darker lip, one gloss band).
 * Every hero draws in a square box of `size` pt.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { coinTier } from '../constants/coinTiers';
import { normalizeRarity } from './copy';
import { FlexArtwork } from './FlexArtwork';
import { Outlined } from './Outlined';
import { RARITY_RAMP, type FlexFrame } from './frames';
import { FlexShark } from './FlexShark';
import type { InventoryType } from '../models/inventory-type';
import type { FlexArt, FlexKind, FlexPayload, FlexPayloads } from './types';

export const HERO_ART = {
  coin: require('../../assets/images/coingold.png'),
  gift: require('../../assets/icons/game/gift.png'),
  crown: require('../../assets/icons/game/crown.png'),
  sparkle: require('../../assets/icons/game/sparkle.png'),
  streak: require('../../assets/icons/game/streak.png'),
  medal1: require('../../assets/icons/game/medal1.png'),
  medal2: require('../../assets/icons/game/medal2.png'),
  medal3: require('../../assets/icons/game/medal3.png'),
  trophy: require('../../assets/images/screens/park/gold.png'),
  star: require('../../assets/images/screens/pin-collections/star.png'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  fin: require('../../assets/icons/game/fin.png'),
};

const NAVY = '#05346e';

export function FlexHero({ kind, payload, frame, size, inventory }: {
  readonly inventory?: InventoryType | null;
  readonly kind: FlexKind;
  readonly payload: FlexPayload;
  readonly frame: FlexFrame;
  readonly size: number;
}) {
  switch (kind) {
    case 'find': return <FindHero p={payload as FlexPayloads['find']} size={size} />;
    case 'ride_photo': return <PhotoHero p={payload as FlexPayloads['ride_photo']} size={size} inventory={inventory} />;
    case 'set_complete': return <SetHero p={payload as FlexPayloads['set_complete']} frame={frame} size={size} />;
    case 'boss_win': return <BossHero p={payload as FlexPayloads['boss_win']} frame={frame} size={size} />;
    case 'stamp': return <StampHero p={payload as FlexPayloads['stamp']} frame={frame} size={size} />;
    case 'crowned': {
      const p = payload as FlexPayloads['crowned'];
      return <CoinHero art={p.coinUrl} level={10} size={size} crown />;
    }
    case 'coin_level': {
      const p = payload as FlexPayloads['coin_level'];
      return <CoinHero art={p.coinUrl} level={p.tierIndex ?? p.level} size={size} />;
    }
    case 'ride_coin': {
      const p = payload as FlexPayloads['ride_coin'];
      return <CoinHero art={p.coinUrl} level={1} size={size}
        tag={p.limited ? { text: 'LIMITED', color: '#ef4a3c' } : p.edition?.name ? { text: 'EDITION', color: p.edition.color || '#0879ca' } : p.isNew ? { text: 'NEW!', color: '#3cb85c' } : undefined} />;
    }
    case 'standings': return <StandingsHero p={payload as FlexPayloads['standings']} size={size} />;
    case 'fright_night': return <MarqueeHero p={payload as FlexPayloads['fright_night']} frame={frame} size={size} />;
    case 'fright_badge': return <HauntBadgeHero p={payload as FlexPayloads['fright_badge']} frame={frame} size={size} />;
    case 'fright_lifetime': return <MoonHero n={(payload as FlexPayloads['fright_lifetime']).hauntsSurvived} frame={frame} size={size} />;
    case 'streak': return <StreakHero days={(payload as FlexPayloads['streak']).days} size={size} />;
    case 'level_up': return <LevelHero level={(payload as FlexPayloads['level_up']).level} size={size} />;
    case 'title': return <TitleHero title={(payload as FlexPayloads['title']).title} size={size} />;
    case 'park_day': return <CoinGridHero arts={(payload as FlexPayloads['park_day']).coinUrls} frame={frame} size={size} />;
  }
  return null;
}

/* ------------------------------------------------------------------ parts */

/** Alex's sticker-slot panel: navy outline, two-tone body, darker lip, gloss band, colored rim. */
export function Panel({ size, colors, lip, rim, round = false, children, outline = NAVY, radius, gloss = 0.32 }: {
  readonly size: number;
  readonly colors: readonly [string, string];
  readonly lip: string;
  readonly rim: string;
  readonly round?: boolean;
  readonly children?: ReactNode;
  readonly outline?: string;
  readonly radius?: number;
  /** Gloss band strength (lower on dark night panels). */
  readonly gloss?: number;
}) {
  const r = round ? size / 2 : radius ?? size * 0.16;
  const border = Math.max(3, size * 0.022);
  const rimW = Math.max(4, size * 0.04);
  return (
    <View style={{ width: size, height: size }}>
      {/* lip */}
      <View style={[StyleSheet.absoluteFill, { top: size * 0.04, borderRadius: r, backgroundColor: lip, borderWidth: border, borderColor: outline }]} />
      <View style={{ width: size, height: size * 0.96, borderRadius: r, borderWidth: border, borderColor: outline, overflow: 'hidden', backgroundColor: rim }}>
        <View style={{ flex: 1, margin: rimW, borderRadius: Math.max(0, r - rimW), overflow: 'hidden', borderWidth: Math.max(2, border * 0.6), borderColor: outline }}>
          <LinearGradient colors={[colors[0], colors[1]]} style={StyleSheet.absoluteFill} />
          {/* gloss band */}
          <View style={{ position: 'absolute', left: '8%', right: '8%', top: '4%', height: '22%', borderRadius: size, backgroundColor: `rgba(255,255,255,${gloss})` }} />
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
        </View>
      </View>
    </View>
  );
}

/** Fixed sparkle constellation (deterministic so every capture matches). */
function Sparkles({ size, count = 4 }: { readonly size: number; readonly count?: number }) {
  const spots = [
    { x: 0.02, y: 0.06, s: 0.16 }, { x: 0.84, y: 0.02, s: 0.13 }, { x: 0.9, y: 0.7, s: 0.11 },
    { x: -0.04, y: 0.66, s: 0.1 }, { x: 0.46, y: -0.08, s: 0.09 }, { x: 0.74, y: 0.9, s: 0.08 },
  ].slice(0, count);
  return (
    <>
      {spots.map((spot, i) => (
        <FlexArtwork key={i} id={`sparkle${i}`} art={HERO_ART.sparkle} fallback={HERO_ART.sparkle}
          style={{ position: 'absolute', left: spot.x * size, top: spot.y * size, width: spot.s * size, height: spot.s * size }} />
      ))}
    </>
  );
}

function Tag({ text, color, size }: { readonly text: string; readonly color: string; readonly size: number }) {
  return (
    <View style={[styles.tag, { backgroundColor: color, transform: [{ rotate: '-6deg' }], paddingHorizontal: size * 0.06, height: size * 0.17, borderRadius: size * 0.04 }]}>
      <Outlined text={text} outline={NAVY} style={{ fontFamily: 'Shark', fontSize: size * 0.1, color: '#ffffff' }} />
    </View>
  );
}

/* ----------------------------------------------------------------- heroes */

function FindHero({ p, size }: { readonly p: FlexPayloads['find']; readonly size: number }) {
  const rarity = normalizeRarity(p.rarity);
  const look = RARITY_RAMP[rarity];
  const colors: [string, string] = p.goldenHour ? ['#fff4c2', '#ffcf3b'] : ['#ffffff', look.chip];
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={colors} lip={p.goldenHour ? '#d99a00' : look.frame} rim={look.frame}>
        <FlexArtwork art={p.artUrl} fallback={HERO_ART.gift} style={{ width: size * 0.74, height: size * 0.74 }} />
      </Panel>
      {(rarity >= 4 || p.goldenHour) && <Sparkles size={size} count={rarity === 5 || p.goldenHour ? 5 : 3} />}
      {p.dailyRare && <View style={{ position: 'absolute', left: -size * 0.04, top: size * 0.04 }}><Tag text="DAILY RARE" color="#9b4dff" size={size} /></View>}
    </View>
  );
}

function PhotoHero({ p, size, inventory }: { readonly p: FlexPayloads['ride_photo']; readonly size: number; readonly inventory?: InventoryType | null }) {
  const frameIt = p.grade === 'frame_it';
  const great = p.grade === 'great';
  const outer = frameIt ? '#ffcf3b' : great ? '#ffffff' : '#ffffff';
  const mat = frameIt ? '#fff1c2' : great ? '#bfe5ff' : '#ffffff';
  const w = size * 1.12;
  const h = size * 0.9;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.photoOuter, { width: w, height: h, backgroundColor: outer, borderColor: NAVY, borderRadius: size * 0.06 }]}>
        <View style={{ flex: 1, margin: size * 0.035, backgroundColor: mat, borderRadius: size * 0.04, padding: size * 0.03 }}>
          <View style={[styles.photoWindow, { borderRadius: size * 0.03, borderColor: NAVY }]}>
            {p.photoUri
              ? <FlexArtwork art={p.photoUri} fallback={HERO_ART.gift} contentFit="cover" style={StyleSheet.absoluteFill} />
              : <PhotoScene p={p} inventory={inventory} width={w - size * 0.13} height={h - size * 0.13} />}
          </View>
        </View>
      </View>
      {frameIt && <>
        <FlexArtwork id="starL" art={HERO_ART.star} fallback={HERO_ART.star} style={{ position: 'absolute', left: -w * 0.08, top: -size * 0.06, width: size * 0.2, height: size * 0.2 }} />
        <FlexArtwork id="starR" art={HERO_ART.star} fallback={HERO_ART.star} style={{ position: 'absolute', right: -w * 0.08, top: -size * 0.06, width: size * 0.2, height: size * 0.2 }} />
      </>}
    </View>
  );
}

/** Without a captured photo: a sunny scene with the find and the player's shark. */
function PhotoScene({ p, inventory, width, height }: { readonly p: FlexPayloads['ride_photo']; readonly inventory?: InventoryType | null; readonly width: number; readonly height: number }) {
  return (
    <View style={{ width, height }}>
      <LinearGradient colors={p.goldenHour ? ['#ffb347', '#ffe9a8'] : ['#7cc6f5', '#d8f0ff']} style={StyleSheet.absoluteFill} />
      <View style={[styles.hill, { backgroundColor: p.goldenHour ? '#9bc65a' : '#5fc46a', width: width * 1.4, height: height * 0.5, left: -width * 0.2, bottom: -height * 0.28, borderRadius: width }]} />
      <FlexArtwork art={p.artUrl} fallback={HERO_ART.gift} style={{ position: 'absolute', left: width * 0.04, bottom: height * 0.12, width: width * 0.5, height: width * 0.5 }} />
      <View style={{ position: 'absolute', right: -width * 0.06, bottom: -height * 0.05 }}>
        <FlexShark inventory={inventory} height={height * 0.9} />
      </View>
    </View>
  );
}

function SetHero({ p, frame, size }: { readonly p: FlexPayloads['set_complete']; readonly frame: FlexFrame; readonly size: number }) {
  const arts = (p.artUrls ?? []).slice(0, 6);
  const fan = arts.map((art, i) => {
    const t = arts.length === 1 ? 0.5 : i / (arts.length - 1);
    const angle = -150 + t * 120; // arc across the top
    const rad = (angle * Math.PI) / 180;
    const r = size * 0.44;
    const s = size * 0.3;
    return { art, left: size / 2 + r * Math.cos(rad) - s / 2, top: size * 0.52 + r * Math.sin(rad) - s / 2, s, rot: (angle + 90) * 0.4 };
  });
  return (
    <View style={{ width: size, height: size }}>
      {fan.map((f, i) => (
        <View key={i} style={{ position: 'absolute', left: f.left, top: f.top, transform: [{ rotate: `${f.rot}deg` }] }}>
          <Panel size={f.s} colors={['#ffffff', '#e6f4ff']} lip="#9ccdf0" rim={frame.rim} radius={f.s * 0.2}>
            <FlexArtwork id={`fan${i}`} art={f.art} fallback={HERO_ART.gift} style={{ width: f.s * 0.72, height: f.s * 0.72 }} />
          </Panel>
        </View>
      ))}
      <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.24 }}>
        <FlexArtwork art={p.badgeUrl} fallback={HERO_ART.trophy} style={{ width: size * 0.68, height: size * 0.68 }} />
      </View>
      <Sparkles size={size} count={3} />
    </View>
  );
}

function BossHero({ p, frame, size }: { readonly p: FlexPayloads['boss_win']; readonly frame: FlexFrame; readonly size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} outline={frame.outline}>
        <View style={{ transform: [{ rotate: '-8deg' }] }}>
          <FlexArtwork art={p.artUrl} fallback={HERO_ART.trophy} style={{ width: size * 0.78, height: size * 0.78 }} />
        </View>
      </Panel>
      <FlexArtwork art={HERO_ART.trophy} fallback={HERO_ART.trophy} style={{ position: 'absolute', right: -size * 0.06, bottom: -size * 0.02, width: size * 0.3, height: size * 0.36 }} />
      <View style={{ position: 'absolute', left: -size * 0.06, top: size * 0.02 }}>
        <Tag text={p.difficulty === 'shark' ? 'SHARK MODE' : p.difficulty === 'hard' ? 'HARD MODE' : 'TAMED!'} color="#ef4a3c" size={size} />
      </View>
    </View>
  );
}

function StampHero({ p, frame, size }: { readonly p: FlexPayloads['stamp']; readonly frame: FlexFrame; readonly size: number }) {
  const rarity = normalizeRarity(p.rarity);
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={RARITY_RAMP[rarity].frame}>
        <View style={[styles.passportDash, { width: size * 0.84, height: size * 0.84, borderRadius: size * 0.1 }]} />
        <FlexArtwork art={p.artUrl} fallback={HERO_ART.star} style={{ position: 'absolute', width: size * 0.82, height: size * 0.82 }} />
      </Panel>
      {rarity >= 4 && <Sparkles size={size} count={rarity === 5 ? 5 : 3} />}
    </View>
  );
}

function CoinHero({ art, level, size, crown = false, tag }: {
  readonly art: FlexArt; readonly level: number; readonly size: number; readonly crown?: boolean;
  readonly tag?: { readonly text: string; readonly color: string };
}) {
  const tier = coinTier(level);
  const ring = Math.max(6, size * 0.035 * (tier.ringWidth / 3));
  const coin = size * 0.78;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 0.98, height: size * 0.98, borderRadius: size, backgroundColor: tier.halo, opacity: 0.55 }} />
      <View style={{ width: coin + ring * 4, height: coin + ring * 4, borderRadius: coin, backgroundColor: tier.ringDeep, borderWidth: 3, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: coin + ring * 2, height: coin + ring * 2, borderRadius: coin, backgroundColor: tier.ring, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: NAVY }}>
          <FlexArtwork art={art} fallback={HERO_ART.coin} style={{ width: coin, height: coin, borderRadius: coin / 2 }} />
        </View>
      </View>
      {crown && <FlexArtwork art={HERO_ART.crown} fallback={HERO_ART.crown} style={{ position: 'absolute', top: -size * 0.2, width: size * 0.46, height: size * 0.46 }} />}
      {(crown || level >= 5) && <Sparkles size={size} count={crown ? 5 : 3} />}
      {tag && <View style={{ position: 'absolute', bottom: -size * 0.02 }}><Tag text={tag.text} color={tag.color} size={size} /></View>}
    </View>
  );
}

function StandingsHero({ p, size }: { readonly p: FlexPayloads['standings']; readonly size: number }) {
  const rank = Math.floor(Number(p.rank));
  const art = rank === 1 ? HERO_ART.medal1 : rank === 2 ? HERO_ART.medal2 : rank === 3 ? HERO_ART.medal3 : HERO_ART.trophy;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: 'rgba(255,207,59,0.28)' }} />
      <FlexArtwork art={art} fallback={HERO_ART.trophy} style={{ width: size * 0.8, height: size * 0.9 }} />
      <Sparkles size={size} count={4} />
    </View>
  );
}

/** Night marquee: bulb-studded frame holding the night's haunt badges. */
function MarqueeHero({ p, frame, size }: { readonly p: FlexPayloads['fright_night']; readonly frame: FlexFrame; readonly size: number }) {
  const badges = (p.badgeUrls ?? []).slice(0, 9);
  const count = Math.max(badges.length, Math.min(9, Math.max(0, Math.floor(p.haunts))));
  const cols = count <= 4 ? 2 : 3;
  const cell = (size * 0.7) / cols;
  const bulbs = 7;
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} outline={frame.outline} radius={size * 0.1} gloss={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cell * cols, justifyContent: 'center' }}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
              <HauntCoin art={badges[i] ?? null} size={cell * 0.88} frame={frame} id={`haunt${i}`} />
            </View>
          ))}
        </View>
      </Panel>
      {/* marquee bulbs along the top and bottom rims */}
      {[0, 1].map(row => Array.from({ length: bulbs }, (_, i) => (
        <View key={`${row}-${i}`} style={[styles.bulb, {
          left: size * 0.1 + (i * size * 0.8) / (bulbs - 1) - size * 0.022,
          top: row === 0 ? size * 0.004 : size * 0.925,
          width: size * 0.044, height: size * 0.044, borderRadius: size,
        }]} />
      )))}
    </View>
  );
}

/** A haunt badge in a pumpkin-rimmed coin; a fin glyph when the art is not there yet. */
function HauntCoin({ art, size, frame, id }: { readonly art: FlexArt | null; readonly size: number; readonly frame: FlexFrame; readonly id: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size, backgroundColor: frame.rim, borderWidth: 2.5, borderColor: frame.outline, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.84, height: size * 0.84, borderRadius: size, backgroundColor: '#fff1d6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <FlexArtwork id={id} art={art} fallback={HERO_ART.fin} style={{ width: size * 0.74, height: size * 0.74 }} />
      </View>
    </View>
  );
}

function HauntBadgeHero({ p, frame, size }: { readonly p: FlexPayloads['fright_badge']; readonly frame: FlexFrame; readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: 'rgba(255,138,31,0.22)' }} />
      <HauntCoin art={p.badgeUrl} size={size * 0.86} frame={frame} id="badge" />
      {p.pinUrl != null && <View style={{ position: 'absolute', right: -size * 0.02, bottom: -size * 0.02 }}>
        <Panel size={size * 0.34} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} round outline={frame.outline}>
          <FlexArtwork id="pin" art={p.pinUrl} fallback={HERO_ART.fin} style={{ width: size * 0.22, height: size * 0.22 }} />
        </Panel>
      </View>}
    </View>
  );
}

/** Flat cream moon with two craters and the lifetime count on it. */
function MoonHero({ n, frame, size }: { readonly n: number; readonly frame: FlexFrame; readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: 'rgba(255,241,214,0.14)' }} />
      <View style={{ width: size * 0.84, height: size * 0.84, borderRadius: size, backgroundColor: '#fff1d6', borderWidth: 4, borderColor: frame.outline, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: size * 0.1, top: size * 0.12, width: size * 0.2, height: size * 0.2, borderRadius: size, backgroundColor: '#f2d9a8' }} />
        <View style={{ position: 'absolute', right: size * 0.12, bottom: size * 0.14, width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: '#f2d9a8' }} />
        <View style={{ position: 'absolute', left: '10%', right: '10%', top: '5%', height: '18%', borderRadius: size, backgroundColor: 'rgba(255,255,255,0.5)' }} />
        <Outlined text={String(Math.max(0, Math.floor(n)))} outline={frame.outline} style={{ fontFamily: 'Shark', fontSize: size * 0.34, color: '#ff8a1f', textAlign: 'center' }} />
      </View>
    </View>
  );
}

function StreakHero({ days, size }: { readonly days: number; readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <FlexArtwork art={HERO_ART.streak} fallback={HERO_ART.streak} style={{ width: size * 0.82, height: size * 0.95 }} />
      <View style={{ position: 'absolute', bottom: size * 0.1 }}>
        <Outlined text={String(Math.max(0, Math.floor(days)))} outline="#5a2306" style={{ fontFamily: 'Shark', fontSize: size * 0.3, color: '#ffffff', textAlign: 'center' }} />
      </View>
    </View>
  );
}

function LevelHero({ level, size }: { readonly level: number; readonly size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={['#ffe07a', '#ffb400']} lip="#d99a00" rim="#ffffff" round>
        <Text style={{ fontFamily: 'Shark', fontSize: size * 0.13, color: NAVY, marginBottom: -size * 0.04 }}>LEVEL</Text>
        <Outlined text={String(Math.max(1, Math.floor(level)))} outline={NAVY} style={{ fontFamily: 'Shark', fontSize: size * 0.4, color: '#ffffff', textAlign: 'center' }} />
      </Panel>
      <FlexArtwork art={HERO_ART.xp} fallback={HERO_ART.xp} style={{ position: 'absolute', right: -size * 0.04, bottom: 0, width: size * 0.3, height: size * 0.3 }} />
      <Sparkles size={size} count={3} />
    </View>
  );
}

function TitleHero({ title, size }: { readonly title: string; readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <FlexArtwork art={HERO_ART.crown} fallback={HERO_ART.crown} style={{ width: size * 0.5, height: size * 0.5, marginBottom: -size * 0.08, zIndex: 1 }} />
      <View style={[styles.plaque, { width: size * 1.05, paddingVertical: size * 0.07, borderRadius: size * 0.08 }]}>
        <LinearGradient colors={['#ffe07a', '#ffb400']} style={[StyleSheet.absoluteFill, { borderRadius: size * 0.06 }]} />
        <Outlined text={title} lines={2} outline="#7a3d00" style={{ fontFamily: 'Shark', fontSize: size * 0.13, color: '#ffffff', textAlign: 'center', paddingHorizontal: size * 0.05 }} />
      </View>
      <Sparkles size={size} count={4} />
    </View>
  );
}

function CoinGridHero({ arts, frame, size }: { readonly arts: readonly FlexArt[]; readonly frame: FlexFrame; readonly size: number }) {
  const shown = arts.slice(0, 9);
  const cols = shown.length <= 4 ? 2 : 3;
  const cell = (size * 0.78) / cols;
  return (
    <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cell * cols, justifyContent: 'center' }}>
        {shown.map((art, i) => (
          <View key={i} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <FlexArtwork id={`coin${i}`} art={art} fallback={HERO_ART.coin} style={{ width: cell * 0.9, height: cell * 0.9 }} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  tag: { borderWidth: 2.5, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  photoOuter: { borderWidth: 3, borderBottomWidth: 7 },
  photoWindow: { flex: 1, overflow: 'hidden', borderWidth: 2 },
  hill: { position: 'absolute' },
  passportDash: { position: 'absolute', borderWidth: 2.5, borderStyle: 'dashed', borderColor: 'rgba(239,74,60,0.45)' },
  bulb: { position: 'absolute', backgroundColor: '#fff1a8', borderWidth: 1.5, borderColor: '#7a3d00' },
  plaque: { borderWidth: 3, borderBottomWidth: 7, borderColor: '#7a3d00', alignItems: 'center', justifyContent: 'center' },
});
