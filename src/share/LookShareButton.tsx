/**
 * Show off a Closet look: a round Share button that makes a 9:16 picture of the shark in what it
 * is wearing now ("MY LOOK!", the look QR and link), then the grown-up gate and the share sheet.
 * Root screens only (Closet). Kid safety: no name, no place, no date on the picture.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from '../helpers/haptics';
import type { InventoryType } from '../models/inventory-type';
import { BRAND } from '../ui/tokens';
import { captureFlex, openShareSheet } from './capture';
import { ShareGlyph } from './FlexShareButton';
import { FlexShark } from './FlexShark';
import { OFFSCREEN, StoryShareFrame } from './StoryShareFrame';

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
  if (!inventory) return null;
  return (
    <View style={style}>
      <Pressable onPress={() => void share()} disabled={making} hitSlop={6} accessibilityRole="button" accessibilityLabel="Share my look"
        accessibilityHint="Make a picture of your shark to show it off" style={({ pressed }) => [{ alignItems: 'center' }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <View style={[styles.round, making && { opacity: 0.6 }]}>
          <View style={styles.gloss} />
          <ShareGlyph size={20} />
        </View>
        <Text style={styles.caption}>Share</Text>
      </Pressable>
      <View style={OFFSCREEN} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <StoryShareFrame ref={ref} ribbon="MY LOOK!" cta="Dress up a shark with me!" campaign="look">
          <View style={styles.stage}>
            <FlexShark inventory={inventory} height={330} />
          </View>
        </StoryShareFrame>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.blueBright, borderWidth: 3, borderBottomWidth: 5, borderColor: BRAND.navy,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', left: 6, right: 6, top: 3, height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)' },
  caption: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 1, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  stage: { width: 300, height: 360, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 4, borderColor: '#ffffff', paddingBottom: 12 },
});
