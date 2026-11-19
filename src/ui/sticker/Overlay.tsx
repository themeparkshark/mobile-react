/**
 * Overlay: the navy scrim (52 percent, never black) and the room a floating sheet or dialog sits
 * in, centred between the safe area's top and bottom with the 24 pt side margin of the board.
 * Everything in it is mounted on the world (level 1): the floating Page gives its own children
 * level 2.
 */
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaceProvider } from './StickerContext';
import { WORLD } from './level';
import { INK } from './tokens';

/** Side margin of a floating sheet or dialog (the board: 24 on a 390 phone). */
export const OVERLAY_MARGIN = 24;

function OverlayImpl({ children, top = 0 }: { readonly children: ReactNode; /** Extra room at the top (a ribbon above the sheet). */ readonly top?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents="box-none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }]} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: OVERLAY_MARGIN, paddingTop: insets.top + 12 + top, paddingBottom: Math.max(insets.bottom, 12) + 8 }} pointerEvents="box-none">
        <PlaceProvider value={WORLD}>{children}</PlaceProvider>
      </View>
    </View>
  );
}

const Overlay = memo(OverlayImpl);
export default Overlay;
