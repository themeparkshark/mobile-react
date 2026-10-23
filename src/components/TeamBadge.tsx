/**
 * A team's badge art with a plain emblem over the middle (IP safety, Oct 23 2026).
 *
 * The Gold and Green shields were drawn with a round-eared mouse face and an
 * Earth globe in their center circle, which read as two famous park brands.
 * Until Dustin's new emblems arrive (his GPT Image pipeline from Alex's
 * references), the center circle is covered with a beveled gold rim, a
 * team-color ring, a cream face and one of Alex's icons: a star for Team
 * Gold, the compass for Team Green. The shield frame stays Alex's art. Team Shark is unchanged.
 *
 * Geometry is measured on each PNG (center and size as fractions of the
 * art's own width and height), so the cover sits on the circle at any size.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { TEAMS, type TeamId } from '../constants/teams';
import GameIcon from '../ui/GameIcon';
import type { GameIconName } from '../ui/iconNames';

export type TeamArtKind = 'small' | 'big' | 'pillar';

type Cover = { readonly cx: number; readonly cy: number; readonly d: number };
type Art = { readonly source: number; readonly w: number; readonly h: number; readonly cover?: Cover };

/** Exported for tests. */
export const TEAM_ART: Record<TeamArtKind, Record<TeamId, Art>> = {
  small: {
    mouse: { source: TEAMS.mouse.badge, w: 95, h: 96, cover: { cx: 0.5, cy: 0.371, d: 0.52 } },
    globe: { source: TEAMS.globe.badge, w: 85, h: 96, cover: { cx: 0.482, cy: 0.3125, d: 0.45 } },
    shark: { source: TEAMS.shark.badge, w: 95, h: 96 },
  },
  big: {
    mouse: { source: require('../../assets/images/team-mouse-badge.png'), w: 955, h: 964, cover: { cx: 0.5, cy: 0.386, d: 0.53 } },
    globe: { source: require('../../assets/images/team-globe-badge.png'), w: 909, h: 1030, cover: { cx: 0.5, cy: 0.316, d: 0.47 } },
    shark: { source: require('../../assets/images/team-shark-badge.png'), w: 879, h: 951 },
  },
  pillar: {
    mouse: { source: require('../../assets/images/pillar-mouse.png'), w: 459, h: 814, cover: { cx: 0.505, cy: 0.095, d: 0.25 } },
    globe: { source: require('../../assets/images/pillar-globe.png'), w: 456, h: 856, cover: { cx: 0.487, cy: 0.1, d: 0.2 } },
    shark: { source: require('../../assets/images/pillar-shark.png'), w: 442, h: 834 },
  },
};

/** The plain emblem each covered team shows. Exported for tests. */
export const TEAM_EMBLEM: Partial<Record<TeamId, { readonly icon: GameIconName; readonly fill: string }>> = {
  mouse: { icon: 'star', fill: TEAMS.mouse.color },
  globe: { icon: 'map', fill: TEAMS.globe.color },
};
const RIM = '#F5C842';
const RIM_LIGHT = '#FFE9A3';
const RIM_DEEP = '#B7861A';
const FACE = '#FFF7E0';

/**
 * The emblem layers, sized from the cover disc (exported for tests):
 * a gold rim lit from the top, a team-color ring, a cream face so the glyph
 * reads on any chip color (the compass was a blue-on-green blob at chip size),
 * a soft shadow at the top of the face and one highlight, like Alex's bevels.
 */
export function emblemLayers(size: number) {
  const rim = Math.max(1, Math.round(size * 0.06));
  const ring = Math.max(1, Math.round(size * 0.1));
  const face = Math.max(2, size - 2 * (rim + ring));
  return { rim, ring, face, glyph: Math.max(4, Math.round(face * 0.82)), shade: Math.max(1, Math.round(face * 0.06)) };
}

function Emblem({ icon, fill, size, left, top }: { icon: GameIconName; fill: string; size: number; left: number; top: number }) {
  const l = emblemLayers(size);
  return (
    <View style={{
      position: 'absolute', left, top, width: size, height: size, borderRadius: size / 2, backgroundColor: fill,
      borderWidth: l.rim, borderColor: RIM, borderTopColor: RIM_LIGHT, borderBottomColor: RIM_DEEP,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <View style={{
        width: l.face, height: l.face, borderRadius: l.face / 2, backgroundColor: FACE,
        borderTopWidth: l.shade, borderColor: 'rgba(5, 52, 110, 0.22)', alignItems: 'center', justifyContent: 'center',
      }}>
        <GameIcon name={icon} size={l.glyph} />
      </View>
      <View style={{
        position: 'absolute', top: l.rim * 0.6, left: size * 0.2, width: size * 0.28, height: size * 0.12,
        borderRadius: size, backgroundColor: 'rgba(255, 255, 255, 0.45)', transform: [{ rotate: '-20deg' }],
      }} />
    </View>
  );
}

/** Where the cover disc sits inside a box of this size (the art is drawn "contain", centered). Exported for tests. */
export function coverFrame(art: Art, boxW: number, boxH: number): { left: number; top: number; size: number } | null {
  if (!art.cover || boxW <= 0 || boxH <= 0) return null;
  const aspect = art.w / art.h;
  const fitW = Math.min(boxW, boxH * aspect);
  const fitH = fitW / aspect;
  const size = art.cover.d * fitW;
  return {
    left: (boxW - fitW) / 2 + art.cover.cx * fitW - size / 2,
    top: (boxH - fitH) / 2 + art.cover.cy * fitH - size / 2,
    size,
  };
}

type Props = {
  readonly team: TeamId;
  readonly kind?: TeamArtKind;
  /**
   * A square box in points. Without it the box is `style`'s number width and
   * height, or its laid-out size (then the cover waits for the first layout).
   */
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessible?: boolean;
  readonly accessibilityLabel?: string;
};

export default function TeamBadge({ team, kind = 'small', size, style, accessible, accessibilityLabel }: Props) {
  const art = TEAM_ART[kind][team];
  const emblem = art.cover ? TEAM_EMBLEM[team] : undefined;
  const flat = StyleSheet.flatten(style) ?? {};
  const fixed = size ? { w: size, h: size }
    : typeof flat.width === 'number' && typeof flat.height === 'number' ? { w: flat.width, h: flat.height } : null;
  const [laid, setBox] = useState<{ w: number; h: number } | null>(null);
  const box = fixed ?? laid;
  const onLayout = fixed || !emblem ? undefined : (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox(prev => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };
  const frame = emblem && box ? coverFrame(art, box.w, box.h) : null;
  // A covered badge never shows its old center, not even for the first frame.
  const hidden = !!emblem && !frame;
  return (
    <View style={[size ? { width: size, height: size } : null, style]} onLayout={onLayout}
      accessible={accessible} accessibilityLabel={accessibilityLabel} pointerEvents="none">
      <Image source={art.source} style={{ width: '100%', height: '100%', opacity: hidden ? 0 : 1 }} contentFit="contain" />
      {emblem && frame && <Emblem icon={emblem.icon} fill={emblem.fill} size={frame.size} left={frame.left} top={frame.top} />}
    </View>
  );
}
