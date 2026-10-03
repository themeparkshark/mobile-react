/**
 * The player's real shark in its current outfit, still (no idle bob, no pin,
 * no backdrop): the same layers and order as Playercard and the server avatar
 * (skin or Alex's Classic no-eye body, the eyes, then body, face, neck, hand,
 * head papers), all drawn full frame on the 1353x1530 paper canvas.
 *
 * The shark is the co-star: it holds one category prop (real Alex or shipped
 * production art) at its front fin. The prop is drawn outside the mirrored
 * stack, so text on it (the foam finger's "#1") never reads backwards.
 */
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { outfitLayerUrls, sharkBaseLayers, CLASSIC_NO_EYE } from '../helpers/wardrobe';
import type { InventoryType } from '../models/inventory-type';
import { FlexArtwork } from './FlexArtwork';
import type { PropKey } from './types';

/** Paper canvas aspect (width / height). */
export const SHARK_ASPECT = 1353 / 1530;

/** Real props only: Alex's originals (references/alex) and shipped production item art. */
export const PROP_ART: Readonly<Record<PropKey, number>> = {
  trophy: require('../../assets/images/screens/park/gold.png'),
  magnifier: require('../../assets/images/share/props/magnifier.webp'),
  treasure: require('../../assets/images/share/props/treasure.webp'),
  'foam-finger': require('../../assets/images/share/props/foam-finger.webp'),
  compass: require('../../assets/images/share/props/compass.webp'),
  coins: require('../../assets/images/share/props/coin-pile.webp'),
  lantern: require('../../assets/images/share/props/haunted-lantern.webp'),
  flame: require('../../assets/images/share/props/fire-ball.webp'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  photos: require('../../assets/images/share/props/photos.webp'),
};

/** Where each prop sits against the shark box (fractions of its width/height), facing left. */
const PROP_SPOT: Readonly<Record<PropKey, { x: number; y: number; w: number; h: number; rotate: number; behind?: boolean }>> = {
  // Held at the front fin (the fin sits near x 0.19, y 0.54 of the paper): each prop overlaps it by ~15%.
  trophy: { x: -0.2, y: 0.3, w: 0.42, h: 0.46, rotate: -10 },
  magnifier: { x: -0.22, y: 0.28, w: 0.44, h: 0.48, rotate: -14 },
  treasure: { x: -0.24, y: 0.42, w: 0.48, h: 0.42, rotate: -6 },
  'foam-finger': { x: -0.18, y: 0.16, w: 0.42, h: 0.48, rotate: -12 },
  compass: { x: -0.18, y: 0.34, w: 0.4, h: 0.44, rotate: -10 },
  coins: { x: -0.14, y: 0.42, w: 0.38, h: 0.42, rotate: 0 },
  lantern: { x: -0.06, y: 0.24, w: 0.24, h: 0.54, rotate: -6 },
  flame: { x: 0.52, y: -0.06, w: 0.5, h: 0.66, rotate: 14, behind: true },
  xp: { x: -0.14, y: 0.38, w: 0.36, h: 0.36, rotate: -8 },
  photos: { x: -0.22, y: 0.4, w: 0.48, h: 0.38, rotate: -8 },
};

export const FlexShark = memo(function FlexShark({ inventory, height, flip = false, prop = null, style }: {
  readonly inventory: InventoryType | null | undefined;
  readonly height: number;
  /** Mirror the shark (the art faces left). The prop is mirrored in place, never its art. */
  readonly flip?: boolean;
  readonly prop?: PropKey | null;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const layers = [...sharkBaseLayers(inventory), ...outfitLayerUrls(inventory)];
  const width = Math.round(height * SHARK_ASPECT);
  const spot = prop ? PROP_SPOT[prop] : null;
  const propView = prop && spot ? (
    <View pointerEvents="none" style={{
      position: 'absolute', width: width * spot.w, height: height * spot.h, top: height * spot.y,
      left: flip ? width * (1 - spot.x - spot.w) : width * spot.x,
      transform: [{ rotate: `${flip ? -spot.rotate : spot.rotate}deg` }],
    }}>
      <FlexArtwork id={`prop-${prop}`} art={PROP_ART[prop]} fallback={PROP_ART[prop]} style={StyleSheet.absoluteFill} />
    </View>
  ) : null;
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      {spot?.behind && propView}
      <View style={[StyleSheet.absoluteFill, flip && styles.flip]}>
        {/* Soft navy contact shadow so the shark sits on the card, not on top of it. */}
        <View style={[styles.shadow, { width: width * 0.3, height: height * 0.035, left: width * 0.42, top: height * 0.8, borderRadius: height }]} />
        {layers.map((layer, index) => (
          <FlexArtwork key={`${index}:${String(layer)}`} id={`shark${index}`}
            art={typeof layer === 'object' ? layer.uri : layer} fallback={index === 0 ? CLASSIC_NO_EYE : TRANSPARENT}
            style={StyleSheet.absoluteFill} />
        ))}
      </View>
      {!spot?.behind && propView}
    </View>
  );
});

/** A clear 1x1 used when an outfit paper cannot load: the shark still captures. */
const TRANSPARENT = require('../../assets/images/share/clear.png');

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
  shadow: { position: 'absolute', backgroundColor: 'rgba(5,52,110,0.22)' },
});
