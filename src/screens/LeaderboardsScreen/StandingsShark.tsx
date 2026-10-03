/**
 * A player's shark on the Standings boards. A worn outfit (or, on the Friends
 * board, a photo) draws through <Avatar>; a player with no outfit gets one of
 * Alex's eight real shark colors, picked by player id, so the podium and the
 * list read as different players at a glance (ART_RULES 1: real art only).
 */
import { memo, useContext } from 'react';
import { Image, View } from 'react-native';
import Avatar from '../../components/Avatar';
import { AuthContext } from '../../context/AuthProvider';
import { liveOutfitFor, outfitLayerUrls, sharkBaseLayers } from '../../helpers/wardrobe';
import type { InventoryType } from '../../models/inventory-type';
import type { PlayerType } from '../../models/player-type';
import { BRAND } from '../../ui';
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
          <Avatar player={player} size="sm" />
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
