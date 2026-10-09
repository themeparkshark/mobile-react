import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { FxFloat, FxRigLayers, wornFx } from '../../fx/FxLayers';
import { outfitSlotsDrawn, sharkBaseLayers } from '../../helpers/wardrobe';
import type { InventoryType } from '../../models/inventory-type';

const BOX = 60;

/**
 * The player's dressed shark on the map, with its Secret Shop pieces moving
 * (Dustin, Oct 8: "Even though I'm wearing animated items my shark on the map
 * still looks static"). The same rigs as the Dressing Room, at the 'lite'
 * level (the loop and its moments, no particles), on one shared clock that
 * runs only while this copy is on screen (Map pauses it off screen, in the
 * background, under a catch and for Reduce Motion). An animated piece draws as
 * its rig, not as its rest-frame paper, exactly like Playercard.
 *
 * `animate` false draws the rest frames only (the panned-away marker copies:
 * MapLibre marker views keep a fixed child list).
 */
function MapSharkLook({ inventory, t, kick, animate, playing }: {
  readonly inventory: InventoryType | null | undefined;
  readonly t: SharedValue<number>;
  readonly kick: SharedValue<number>;
  /** Draw the rigs (the follow-view copy). */
  readonly animate: boolean;
  /** The blinking eyes play (on screen, not Reduce Motion). */
  readonly playing: boolean;
}) {
  const fx = useMemo(() => wornFx(inventory), [inventory]);
  const rigs = animate && fx.rigs.length > 0;
  const rigSlots = useMemo(() => new Set(rigs ? fx.rigs.map(r => r.slot) : []), [rigs, fx]);
  const layers = (
    <View style={styles.box}>
      {rigs && <FxRigLayers fx={fx} side="back" t={t} kick={kick} lod="lite" />}
      {/* Skin (or Alex's Classic) with no eyes, then the eyes layer (an animated blink). */}
      {sharkBaseLayers(inventory).map((source, index) => (
        <Image key={`base-${index}`} source={source} autoplay={playing} style={styles.layer}
          cachePolicy="memory-disk" transition={0} contentFit="contain" />
      ))}
      {/* Worn pieces, back to front; a moving piece is drawn by its rig instead. */}
      {outfitSlotsDrawn(inventory).filter(({ slot }) => !rigSlots.has(slot)).map(({ uri }) => (
        <Image key={uri} source={{ uri }} style={styles.layer} cachePolicy="memory-disk" transition={0} contentFit="contain" />
      ))}
      {rigs && <FxRigLayers fx={fx} side="front" t={t} kick={kick} lod="lite" />}
    </View>
  );
  if (!rigs) return layers;
  // Pieces that lift or rock the shark (the jetpack float, a blade's lean) move it here.
  return <View style={styles.box}><FxFloat fx={fx} t={t} kick={kick} width={BOX} height={BOX} hat={!!inventory?.head_item}>{layers}</FxFloat></View>;
}

export default memo(MapSharkLook);

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, position: 'relative' },
  layer: { width: BOX, height: BOX, position: 'absolute' },
});
