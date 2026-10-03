/**
 * The player's real shark in its current outfit, still (no idle bob, no pin,
 * no backdrop): the same layers and order as Playercard and the server avatar
 * (skin or Alex's Classic no-eye body, the eyes, then body, face, neck, hand,
 * head papers), all drawn full frame on the 1353x1530 paper canvas.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { outfitLayerUrls, sharkBaseLayers, CLASSIC_NO_EYE } from '../helpers/wardrobe';
import type { InventoryType } from '../models/inventory-type';
import { FlexArtwork } from './FlexArtwork';

/** Paper canvas aspect (width / height). */
export const SHARK_ASPECT = 1353 / 1530;

export function FlexShark({ inventory, height, flip = false, style }: {
  readonly inventory: InventoryType | null | undefined;
  readonly height: number;
  /** Mirror the whole stack (the art faces left). */
  readonly flip?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const layers = [
    ...sharkBaseLayers(inventory),
    ...outfitLayerUrls(inventory),
  ];
  const width = Math.round(height * SHARK_ASPECT);
  return (
    <View pointerEvents="none" style={[{ width, height }, flip && styles.flip, style]}>
      {/* Soft navy contact shadow so the shark sits on the card, not on top of it. */}
      <View style={[styles.shadow, { width: width * 0.3, height: height * 0.035, left: width * 0.42, top: height * 0.8, borderRadius: height }]} />
      {layers.map((layer, index) => (
        <FlexArtwork key={`${index}:${String(layer)}`} id={`shark${index}`}
          art={typeof layer === 'object' ? layer.uri : layer} fallback={index === 0 ? CLASSIC_NO_EYE : TRANSPARENT}
          style={StyleSheet.absoluteFill} />
      ))}
    </View>
  );
}

/** A clear 1x1 used when an outfit paper cannot load: the shark still captures. */
const TRANSPARENT = require('../../assets/images/share/clear.png');

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
  shadow: { position: 'absolute', backgroundColor: 'rgba(5,52,110,0.22)' },
});
