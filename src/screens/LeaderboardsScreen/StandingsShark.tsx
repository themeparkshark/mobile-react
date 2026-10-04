/**
 * A player's shark on the Standings boards. A worn outfit (or, on the Friends
 * board, a photo) draws through the list-tuned Face below; a player with no outfit gets one of
 * Alex's eight real shark colors, picked by player id, so the podium and the
 * list read as different players at a glance (ART_RULES 1: real art only).
 */
import { Image as ExpoImage, type ImageRef } from 'expo-image';
import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { DEFAULT_PORTRAIT } from '../../components/Avatar';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import { hasDressedShark, liveOutfitFor, outfitLayerUrls, sharkBaseLayers } from '../../helpers/wardrobe';
import type { InventoryType } from '../../models/inventory-type';
import type { PlayerType } from '../../models/player-type';
import { BRAND } from '../../ui';
import { faceBucket, loadLayer, readyLayer, type LayerSource } from './faceLayers';
import { sharkVariant, type StandingsRowModel } from './standingsV2Model';

export const SHARK_ART = [
  require('../../../assets/images/screens/leaderboard/sharks/shark-0.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-1.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-2.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-3.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-4.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-5.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-6.png'),
  require('../../../assets/images/screens/leaderboard/sharks/shark-7.png'),
] as const;

const AVATAR_PX = 50;

/**
 * The default look is the free Classic skin with nothing worn. Those players
 * get a color from Alex's set instead, so a board is not a wall of twins.
 */
export function wearsOwnLook(inventory: InventoryType | null | undefined): boolean {
  if (!inventory) return false;
  if (outfitLayerUrls(inventory).length > 0) return true;
  const skin = inventory.skin_item as (InventoryType['skin_item'] & { cost?: number | null }) | null | undefined;
  return !!skin?.no_eye_url && Number(skin.cost ?? 0) > 0;
}

/** The layers of a dressed shark, bottom to top (the same order as <Avatar>). */
export function faceLayerSources(inventory: InventoryType | null | undefined): LayerSource[] {
  return [
    ...(inventory?.background_item?.paper_url ? [{ uri: inventory.background_item.paper_url }] : []),
    ...(sharkBaseLayers(inventory) as LayerSource[]),
    ...outfitLayerUrls(inventory).map(uri => ({ uri })),
  ];
}

/** Points a face is drawn at for a shark of `size` (the 50 pt avatar's 1.2x layer box, scaled). */
export const facePoints = (size: number) => AVATAR_PX * 1.2 * (size / AVATAR_PX);

/**
 * Decoded layers for one face at its drawn size: at once when they are
 * cached (no blank frame), otherwise after one small decode. Null meanwhile.
 */
function useFaceLayers(sources: readonly LayerSource[], px: number): readonly ImageRef[] | null {
  const key = useMemo(() => sources.map(src => (typeof src === 'number' ? `#${src}` : src.uri)).join('|') + `@${px}`, [sources, px]);
  const ready = () => {
    const out = sources.map(src => readyLayer(src, px));
    return out.every(Boolean) ? (out as ImageRef[]) : null;
  };
  const [state, setState] = useState<{ key: string; layers: readonly ImageRef[] | null }>(() => ({ key, layers: ready() }));
  const current = state.key === key ? state.layers : ready();
  useEffect(() => {
    if (current) { if (state.key !== key) setState({ key, layers: current }); return undefined; }
    let live = true;
    void Promise.all(sources.map(src => loadLayer(src, px))).then(out => {
      if (live) setState({ key, layers: out.every(Boolean) ? (out as ImageRef[]) : [] });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return current;
}

/**
 * The dressed shark (or a friend's photo) for one row: the same layers and
 * geometry as Avatar (size sm), without its badges, tuned for a scrolling
 * list. Each layer is drawn from a small bitmap decoded at the size it shows
 * (faceLayers.ts), never the 1353 px art; until it is ready the player's
 * color shark stands in, and a recycled row never shows the last face.
 */
const Face = memo(function Face({ id, photo, inventory, size }: {
  readonly id: number; readonly photo: string | null; readonly inventory: InventoryType | null; readonly size: number;
}) {
  const s = AVATAR_PX;
  // Same rule as <Avatar>: a worn outfit wins over a photo.
  const usePhoto = !!photo && !hasDressedShark(inventory);
  const sources = useMemo(() => (usePhoto ? [{ uri: photo as string }] : faceLayerSources(inventory)), [usePhoto, photo, inventory]);
  const layerKeys = useMemo(() => sources.map(src => (typeof src === 'number' ? `#${src}` : src.uri)), [sources]);
  const layers = useFaceLayers(sources, faceBucket(facePoints(size)));
  return (
    <View style={{ width: s, height: s, borderWidth: 1, borderColor: config.lightBlue, overflow: 'hidden', borderRadius: s / 2, backgroundColor: BRAND.sky }}>
      {layers == null ? (
        // Still decoding: the plain sky disc (r2 art: never a different-colored shark that then changes identity).
        null
      ) : !usePhoto && layers.length < 2 ? (
        // The art failed: the player's color shark, never a floating outfit.
        <Image source={SHARK_ART[sharkVariant(id)]} style={{ width: s * 1.12, height: s * 1.12, marginTop: s * 0.12, alignSelf: 'center' }}
          resizeMode="contain" fadeDuration={0} />
      ) : usePhoto && !layers.length ? (
        // A photo that 404s or is not an image: the TPS shark, never a blank blob (QA P2-7).
        <ExpoImage source={DEFAULT_PORTRAIT} contentFit="contain" style={{ width: s * 1.2, height: s * 1.2, position: 'absolute', left: '-10%' }} />
      ) : (
        <View style={{ width: s * 1.2, height: s * 1.2, position: 'absolute', left: '-10%' }}>
          {layers.map((ref, index) => (
            // Keyed by player and layer: a recycled cell never reuses an image
            // view across players (r1: a reused view kept the last frame size).
            <ExpoImage key={`${id}:${layerKeys[index]}`} source={ref} transition={0}
              contentFit="contain" style={{ width: '100%', height: '100%', position: 'absolute' }} />
          ))}
        </View>
      )}
    </View>
  );
});

function StandingsShark({ avatar, size, muted = false, ring }: {
  readonly avatar: StandingsRowModel['avatar'];
  readonly size: number;
  readonly muted?: boolean;
  /** Outline color (medal metal, gold for you). */
  readonly ring?: string;
}) {
  const { player: signedIn } = useContext(AuthContext);
  const player = avatar as unknown as PlayerType;
  // You always see your own shark (the Classic you see on Profile), never a color.
  const isMe = !!signedIn && signedIn.id === avatar.id;
  const outfit = liveOutfitFor(player, signedIn) ?? null;
  const dressed = !!avatar.avatar_url || wearsOwnLook(outfit);
  // Your own default look: Alex's Classic shark from the bundle (no network, no blank frame).
  const ownClassic = isMe && !dressed;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: BRAND.sky,
      borderWidth: ring ? Math.max(2, Math.round(size / 20)) : 2, borderColor: ring ?? BRAND.white, opacity: muted ? 0.55 : 1,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {ownClassic ? (
        <View style={{ width: size * 1.1, height: size * 1.1, marginTop: size * 0.18 }}>
          {sharkBaseLayers(null).map((layer, i) => (
            <Image key={i} source={layer as number} fadeDuration={0} resizeMode="contain"
              style={{ position: 'absolute', left: 0, top: 0, width: size * 1.1, height: size * 1.1 }} />
          ))}
        </View>
      ) : dressed ? (
        <View style={{ width: AVATAR_PX, height: AVATAR_PX, transform: [{ scale: size / AVATAR_PX }] }}>
          <Face id={avatar.id} photo={avatar.avatar_url} inventory={outfit} size={size} />
        </View>
      ) : (
        // RN Image: bundled art decodes from the in-memory cache, so a tab switch never paints a blank face.
        <Image source={SHARK_ART[sharkVariant(avatar.id)]} style={{ width: size * 1.12, height: size * 1.12, marginTop: size * 0.12 }}
          resizeMode="contain" fadeDuration={0} accessibilityIgnoresInvertColors />
      )}
    </View>
  );
}

export default memo(StandingsShark);
