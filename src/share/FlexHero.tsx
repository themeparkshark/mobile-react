/**
 * The hero of each flex card: the thing itself, big and glorious, inside an
 * Alex-style frame (navy outline, two-tone body, darker lip, one gloss band).
 * Every hero draws in a square box of `size` pt.
 *
 * Art is real only (ART_RULES.md): the payload's own item/coin/stamp/badge art,
 * Alex's originals (references/alex, copied to assets/images/share/props) and
 * art the app already ships as Alex originals (star, trophies, gift, xp).
 * Frames, plates and rays are code-drawn shapes, never generated pictures.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { coinTier } from '../constants/coinTiers';
import type { InventoryType } from '../models/inventory-type';
import { normalizeRarity } from './copy';
import { FlexArtwork } from './FlexArtwork';
import { RARITY_RAMP, type FlexFrame } from './frames';
import { FlexShark } from './FlexShark';
import { Outlined } from './Outlined';
import type { FlexArt, FlexKind, FlexPayload, FlexPayloads } from './types';

export const HERO_ART = {
  coin: require('../../assets/images/coingold.png'),
  gift: require('../../assets/icons/game/gift.png'),
  star: require('../../assets/images/screens/pin-collections/star.png'),
  trophy: require('../../assets/images/screens/park/gold.png'),
  trophySilver: require('../../assets/images/screens/park/silver.png'),
  trophyBronze: require('../../assets/images/screens/park/bronze.png'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  fin: require('../../assets/icons/game/fin.png'),
  diamond: require('../../assets/images/share/props/diamond.webp'),
  goldRound: require('../../assets/images/share/props/gold-round.webp'),
  flame: require('../../assets/images/share/props/fire-ball.webp'),
  lantern: require('../../assets/images/share/props/haunted-lantern.webp'),
  photos: require('../../assets/images/share/props/photos.webp'),
  treasure: require('../../assets/images/share/props/treasure.webp'),
};

const NAVY = '#05346e';

export const FlexHero = memo(function FlexHero({ kind, payload, frame, size, inventory }: {
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
    case 'crowned': return <CoinHero art={(payload as FlexPayloads['crowned']).coinUrl} level={10} size={size} crest />;
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
    case 'fright_lifetime': return <LanternHero size={size} />;
    case 'streak': return <StreakHero size={size} />;
    case 'level_up': return <LevelHero level={(payload as FlexPayloads['level_up']).level} size={size} />;
    case 'title': return <TitleHero frame={frame} size={size} />;
    case 'park_day': return <CoinGridHero arts={(payload as FlexPayloads['park_day']).coinUrls} frame={frame} size={size} />;
  }
  return null;
});

/* ------------------------------------------------------------------ parts */

/** Alex's sticker-slot panel: outline, two-tone body, darker lip, gloss band, colored rim. */
export function Panel({ size, colors, lip, rim, round = false, children, outline = NAVY, radius, gloss = 0.32 }: {
  readonly size: number;
  readonly colors: readonly [string, string];
  readonly lip: string;
  readonly rim: string;
  readonly round?: boolean;
  readonly children?: ReactNode;
  readonly outline?: string;
  readonly radius?: number;
  /** Gloss band strength (0 on dark night panels). */
  readonly gloss?: number;
}) {
  const r = round ? size / 2 : radius ?? size * 0.16;
  const border = Math.max(3, size * 0.022);
  const rimW = Math.max(4, size * 0.04);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { top: size * 0.04, borderRadius: r, backgroundColor: lip, borderWidth: border, borderColor: outline }]} />
      <View style={{ width: size, height: size * 0.96, borderRadius: r, borderWidth: border, borderColor: outline, overflow: 'hidden', backgroundColor: rim }}>
        <View style={{ flex: 1, margin: rimW, borderRadius: Math.max(0, r - rimW), overflow: 'hidden', borderWidth: Math.max(2, border * 0.6), borderColor: outline }}>
          <LinearGradient colors={[colors[0], colors[1]]} style={StyleSheet.absoluteFill} />
          {gloss > 0 && <View style={{ position: 'absolute', left: '8%', right: '8%', top: '4%', height: '22%', borderRadius: size, backgroundColor: `rgba(255,255,255,${gloss})` }} />}
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
        </View>
      </View>
    </View>
  );
}

/** Alex's stars in a fixed constellation (deterministic so every capture matches). */
export function Stars({ size, count = 4 }: { readonly size: number; readonly count?: number }) {
  const spots = [
    { x: 0.0, y: 0.04, s: 0.17 }, { x: 0.84, y: 0.0, s: 0.14 }, { x: 0.9, y: 0.66, s: 0.12 },
    { x: -0.06, y: 0.58, s: 0.11 }, { x: 0.46, y: -0.1, s: 0.1 }, { x: 0.72, y: 0.88, s: 0.09 },
  ].slice(0, count);
  return (
    <>
      {spots.map((spot, i) => (
        <FlexArtwork key={i} id={`star${i}`} art={HERO_ART.star} fallback={HERO_ART.star}
          style={{ position: 'absolute', left: spot.x * size, top: spot.y * size, width: spot.s * size, height: spot.s * size, transform: [{ rotate: `${(i % 2 ? 12 : -10)}deg` }] }} />
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
        <FlexArtwork art={p.artUrl} fallback={HERO_ART.gift} style={{ width: size * 0.76, height: size * 0.76 }} />
      </Panel>
      {(rarity >= 4 || p.goldenHour) && <Stars size={size} count={rarity === 5 || p.goldenHour ? 5 : 3} />}
      {p.dailyRare && <View style={{ position: 'absolute', right: -size * 0.06, top: size * 0.02 }}><Tag text="DAILY RARE" color="#9b4dff" size={size} /></View>}
    </View>
  );
}

function PhotoHero({ p, size, inventory }: { readonly p: FlexPayloads['ride_photo']; readonly size: number; readonly inventory?: InventoryType | null }) {
  const frameIt = p.grade === 'frame_it';
  const great = p.grade === 'great';
  const outer = frameIt ? '#ffcf3b' : '#ffffff';
  const mat = frameIt ? '#fff1c2' : great ? '#bfe5ff' : '#ffffff';
  const w = size * 1.14;
  const h = size * 0.94;
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
      {frameIt && <Stars size={size} count={6} />}
    </View>
  );
}

/** Without a captured photo: a sunny park scene (Alex's water, sky, hills) with the find and the player's shark. */
function PhotoScene({ p, inventory, width, height }: { readonly p: FlexPayloads['ride_photo']; readonly inventory?: InventoryType | null; readonly width: number; readonly height: number }) {
  return (
    <View style={{ width, height }}>
      <LinearGradient colors={p.goldenHour ? ['#ff9a5a', '#ffe0a0'] : ['#5fbff5', '#d8f0ff']} style={StyleSheet.absoluteFill} />
      <View style={[styles.sun, { width: height * 0.36, height: height * 0.36, right: width * 0.06, top: height * 0.06, backgroundColor: p.goldenHour ? '#fff1a8' : '#ffe680' }]} />
      <View style={[styles.hill, { backgroundColor: '#7fd36f', width: width * 0.9, height: height * 0.6, left: -width * 0.25, bottom: -height * 0.34, borderRadius: width }]} />
      <View style={[styles.hill, { backgroundColor: '#55b85a', width: width * 1.1, height: height * 0.6, right: -width * 0.4, bottom: -height * 0.4, borderRadius: width }]} />
      <FlexArtwork art={p.artUrl} fallback={HERO_ART.gift} style={{ position: 'absolute', left: width * 0.04, bottom: height * 0.14, width: width * 0.48, height: width * 0.48 }} />
      <View style={{ position: 'absolute', right: -width * 0.04, bottom: -height * 0.06 }}>
        <FlexShark inventory={inventory} height={height * 0.94} />
      </View>
    </View>
  );
}

function SetHero({ p, frame, size }: { readonly p: FlexPayloads['set_complete']; readonly frame: FlexFrame; readonly size: number }) {
  const arts = (p.artUrls ?? []).slice(0, 5);
  // A fan of the set's items across the top, all inside the hero box.
  const s = size * 0.27;
  const fan = arts.map((art, i) => {
    const t = arts.length === 1 ? 0.5 : i / (arts.length - 1);
    const angle = -160 + t * 140;
    const rad = (angle * Math.PI) / 180;
    const r = size * 0.36;
    return { art, left: size / 2 + r * Math.cos(rad) - s / 2, top: size * 0.5 + r * Math.sin(rad) - s / 2, rot: (angle + 90) * 0.35 };
  });
  return (
    <View style={{ width: size, height: size }}>
      {fan.map((f, i) => (
        <View key={i} style={{ position: 'absolute', left: f.left, top: f.top, transform: [{ rotate: `${f.rot}deg` }] }}>
          <Panel size={s} colors={['#ffffff', '#fff6dc']} lip="#d9b25a" rim={frame.rim === '#ffffff' ? '#ffcf3b' : frame.rim} radius={s * 0.2}>
            <FlexArtwork id={`fan${i}`} art={f.art} fallback={HERO_ART.gift} style={{ width: s * 0.72, height: s * 0.72 }} />
          </Panel>
        </View>
      ))}
      <View style={{ position: 'absolute', left: size * 0.19, top: size * 0.27 }}>
        <FlexArtwork art={p.badgeUrl} fallback={HERO_ART.trophy} style={{ width: size * 0.62, height: size * 0.62 }} />
      </View>
      {/* A rubber-stamp "COMPLETE!" across the medallion, only when the giant "12/12" isn't already saying it. */}
      {!(p.total > 0) && <View style={[styles.completeStamp, { top: size * 0.68, left: size * 0.36, paddingHorizontal: size * 0.05, borderRadius: size * 0.04 }]}>
        <Outlined text="COMPLETE!" outline="#7a1610" style={{ fontFamily: 'Shark', fontSize: size * 0.12, color: '#ffffff' }} />
      </View>}
    </View>
  );
}

/** The boss knocked back: tilted, dizzy stars over it, a "KO" panel. */
function BossHero({ p, frame, size }: { readonly p: FlexPayloads['boss_win']; readonly frame: FlexFrame; readonly size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} outline={frame.outline}>
        <View style={{ transform: [{ rotate: '-18deg' }, { translateX: -size * 0.06 }, { translateY: size * 0.08 }] }}>
          <FlexArtwork art={p.artUrl} fallback={HERO_ART.trophy} style={{ width: size * 0.74, height: size * 0.74 }} />
        </View>
      </Panel>
      {/* Dizzy ring of Alex stars over its head. */}
      {[0, 1, 2].map(i => (
        <FlexArtwork key={i} id={`dizzy${i}`} art={HERO_ART.star} fallback={HERO_ART.star}
          style={{ position: 'absolute', left: size * (0.18 + i * 0.16), top: size * (0.08 + (i % 2) * 0.05), width: size * 0.13, height: size * 0.13 }} />
      ))}
      <View style={{ position: 'absolute', right: size * 0.06, top: -size * 0.06 }}>
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
      {rarity >= 4 && <Stars size={size} count={rarity === 5 ? 5 : 3} />}
    </View>
  );
}

/**
 * A ride coin, full colour and uncropped: the coin art is Alex's coin body
 * recoloured per park (with its own thick edge on the right), so it is drawn
 * whole on a cream medallion inside the tier ring (Lv10: navy inside gold, the royal pair).
 */
function CoinHero({ art, level, size, tag, crest = false }: {
  readonly art: FlexArt; readonly level: number; readonly size: number;
  readonly tag?: { readonly text: string; readonly color: string };
  /** Shark Crown: Alex's gold trophy crests the medallion where a crown would sit (no Alex crown exists). */
  readonly crest?: boolean;
}) {
  const tier = coinTier(level);
  const top = level >= 10;
  const ring = Math.max(5, size * 0.03 * (tier.ringWidth / 3));
  const disc = size * 0.94;
  const coinW = size * 0.74;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: disc, height: disc, borderRadius: disc, backgroundColor: tier.ringDeep, borderWidth: 3, borderColor: NAVY }}>
        <View style={{ flex: 1, margin: ring, borderRadius: disc, backgroundColor: tier.ring, borderWidth: 2, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '84%', height: '84%', borderRadius: disc, backgroundColor: top ? '#0b3d91' : '#fff8e4', borderWidth: 2, borderColor: NAVY }} />
        </View>
      </View>
      <FlexArtwork art={art} fallback={HERO_ART.coin} style={{ width: coinW, height: coinW * (484 / 517), transform: [{ rotate: '-6deg' }] }} />
      {(top || level >= 5) && <Stars size={size} count={top ? 6 : 3} />}
      {crest && (
        <View style={{ position: 'absolute', top: -size * 0.2, alignItems: 'center' }}>
          <FlexArtwork id="crest" art={HERO_ART.trophy} fallback={HERO_ART.trophy} style={{ width: size * 0.34, height: size * 0.37 }} />
        </View>
      )}
      {tag && <View style={{ position: 'absolute', bottom: -size * 0.02, right: -size * 0.02 }}><Tag text={tag.text} color={tag.color} size={size} /></View>}
    </View>
  );
}

/** Podium: Alex's trophy (gold, silver, bronze by rank); the giant "#2" sticker carries the rank. */
function StandingsHero({ p, size }: { readonly p: FlexPayloads['standings']; readonly size: number }) {
  const rank = Math.floor(Number(p.rank));
  const art = rank === 2 ? HERO_ART.trophySilver : rank === 3 ? HERO_ART.trophyBronze : HERO_ART.trophy;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', top: size * 0.04, width: size * 0.86, height: size * 0.86, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.18)' }} />
      <FlexArtwork art={art} fallback={HERO_ART.trophy} style={{ width: size * 0.78, height: size * 0.84, marginBottom: size * 0.04 }} />
      <Stars size={size} count={3} />
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

/** A haunt badge in a pumpkin-rimmed coin; the fin glyph when the art is not there yet. */
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
  const coin = size * 0.8;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: 'rgba(255,138,31,0.2)' }} />
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <HauntCoin art={p.badgeUrl} size={coin} frame={frame} id="badge" />
      </View>
      {p.pinUrl != null && (
        // The pin sits clear of the badge rim, on its own corner.
        <View style={{ position: 'absolute', right: -size * 0.02, bottom: -size * 0.02 }}>
          <Panel size={size * 0.38} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} round outline={frame.outline} gloss={0}>
            <FlexArtwork id="pin" art={p.pinUrl} fallback={HERO_ART.fin} style={{ width: size * 0.24, height: size * 0.24 }} />
          </Panel>
        </View>
      )}
    </View>
  );
}

/** The Deep Lantern: a real lantern (shipped Haunted Lantern art) glowing in the dark. */
function LanternHero({ size }: { readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {[1, 0.74, 0.5].map((k, i) => (
        <View key={i} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: size, backgroundColor: `rgba(255,170,60,${0.12 + i * 0.1})` }} />
      ))}
      <FlexArtwork art={HERO_ART.lantern} fallback={HERO_ART.lantern} style={{ width: size * 0.4, height: size * 0.94 }} />
      <Stars size={size} count={2} />
    </View>
  );
}

/** Streak: Alex-era production flame, big, on a warm glow (the giant number rides over it). */
function StreakHero({ size }: { readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: 'rgba(255,240,160,0.35)' }} />
      <FlexArtwork art={HERO_ART.flame} fallback={HERO_ART.flame} style={{ width: size * 0.7, height: size * 1.0, marginTop: -size * 0.06 }} />
    </View>
  );
}

/** Level medallion: Alex's gold coin body with the level in it (the shark holds the XP gem). */
function LevelHero({ level, size }: { readonly level: number; readonly size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <FlexArtwork art={HERO_ART.goldRound} fallback={HERO_ART.goldRound} style={{ position: 'absolute', width: size, height: size * 0.935 }} />
      <Text style={{ fontFamily: 'Shark', fontSize: size * 0.12, color: '#7a3d00', marginBottom: -size * 0.05, marginTop: -size * 0.04 }}>LEVEL</Text>
      <Outlined text={String(Math.max(1, Math.floor(level)))} outline="#7a3d00" style={{ fontFamily: 'Shark', fontSize: size * 0.38, color: '#ffffff', textAlign: 'center' }} />
      <Stars size={size} count={3} />
    </View>
  );
}

/** New title: Alex's gold trophy on a navy plinth (the title itself is the card's headline). */
function TitleHero({ frame, size }: { readonly frame: FlexFrame; readonly size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim} round>
        <FlexArtwork art={HERO_ART.trophy} fallback={HERO_ART.trophy} style={{ width: size * 0.62, height: size * 0.66 }} />
      </Panel>
      <Stars size={size} count={5} />
    </View>
  );
}

/** Park day: the day's coins, full colour, in a grid sized to the count. */
function CoinGridHero({ arts, frame, size }: { readonly arts: readonly FlexArt[]; readonly frame: FlexFrame; readonly size: number }) {
  const shown = arts.slice(0, 9);
  const n = Math.max(1, shown.length);
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cell = (size * 0.82) / Math.max(cols, rows);
  return (
    <Panel size={size} colors={frame.panel} lip={frame.panelLip} rim={frame.rim}>
      <View style={{ width: cell * cols, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {shown.map((art, i) => (
          <View key={i} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <FlexArtwork id={`coin${i}`} art={art} fallback={HERO_ART.coin} style={{ width: cell * 0.96, height: cell * 0.96 * (484 / 517) }} />
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
  hill: { position: 'absolute', borderWidth: 2, borderColor: '#2f7d2a' },
  sun: { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: '#e0a100' },
  passportDash: { position: 'absolute', borderWidth: 2.5, borderStyle: 'dashed', borderColor: 'rgba(239,74,60,0.45)' },
  bulb: { position: 'absolute', backgroundColor: '#fff1a8', borderWidth: 1.5, borderColor: '#7a3d00' },
  completeStamp: { position: 'absolute', backgroundColor: '#ef4a3c', borderWidth: 2.5, borderColor: '#7a1610', transform: [{ rotate: '-10deg' }] },
});
