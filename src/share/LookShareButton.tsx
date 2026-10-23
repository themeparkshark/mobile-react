/**
 * Show off a Closet look: a round Share button that makes a 9:16 picture of the shark in what it
 * is wearing now ("MY LOOK!", the look QR and link), then the grown-up gate and the share sheet.
 * Root screens only (Closet). Kid safety: no name, no place, no date on the picture.
 * A bare shark (nothing worn) has no look to show off yet, so the button stays hidden.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { outfitLayerUrls } from '../helpers/wardrobe';
import type { InventoryType } from '../models/inventory-type';
import { captureFlex, openShareSheet } from './capture';
import { ShareFace } from './FlexShareButton';
import { FlexShark } from './FlexShark';
import { OFFSCREEN, StoryShareFrame } from './StoryShareFrame';

/** True once the shark wears at least one piece (a hat, a shirt, a hand item...). Exported for tests. */
export function hasLookToShare(inventory: InventoryType | null | undefined): boolean {
  return outfitLayerUrls(inventory).length > 0;
}

export function LookShareButton({ inventory, style }: { readonly inventory: InventoryType | null | undefined; readonly style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  const busy = useRef(false);
  const [making, setMaking] = useState(false);
  const share = async () => {
    if (busy.current || !inventory) return;
    busy.current = true;
    setMaking(true);
    void Haptics.selectionAsync();
    try {
      const uri = await captureFlex(ref, 'story');
      await openShareSheet(uri);
    } catch {
      // Closed or not made: nothing left the phone.
    } finally {
      busy.current = false;
      setMaking(false);
    }
  };
  if (!inventory || !hasLookToShare(inventory)) return null;
  return (
    <View style={style}>
      <Pressable onPress={() => void share()} disabled={making} hitSlop={6} accessibilityRole="button" accessibilityLabel="Share my look"
        accessibilityHint="Make a picture of your shark to show it off" style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]}>
        <ShareFace size="sm" caption dim={making} />
      </Pressable>
      <View style={OFFSCREEN} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <StoryShareFrame ref={ref} ribbon="MY LOOK!" cta="Dress up a shark with me!" campaign="look">
          {/* The shark fills the stage: its worn pieces are the star of the picture. */}
          <View style={styles.stage}>
            <FlexShark inventory={inventory} height={350} />
          </View>
        </StoryShareFrame>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 316, height: 366, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 4, borderColor: '#ffffff', paddingBottom: 4, overflow: 'hidden' },
});
