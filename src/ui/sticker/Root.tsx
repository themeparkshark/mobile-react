/**
 * StickerRoot: the root host for kit layers and toasts, mounted ONCE above the navigator (step 2,
 * beside GameDialogHost). It draws only when no kit Screen has navigation focus (a legacy screen is
 * on top), so `showStickerDialog` and `showToast` always reach the screen the player is looking at
 * and never wait behind a covered one. Not mounted anywhere a player can reach yet.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LayerHost, { useHostSlot } from './Overlay';
import { PrimaryScopeProvider } from './StickerContext';
import { ToastHost } from './Toast';
import { headerContentTop, headerHeight } from './layout';

function StickerRootImpl() {
  const insets = useSafeAreaInsets();
  const active = useHostSlot(true);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <PrimaryScopeProvider name="root layer">
        <View style={[StyleSheet.absoluteFill, { top: headerHeight(insets.top) }]} pointerEvents="box-none">
          <ToastHost active={active} />
        </View>
        <LayerHost top={headerContentTop(insets.top)} active={active} />
      </PrimaryScopeProvider>
    </View>
  );
}

const StickerRoot = memo(StickerRootImpl);
export default StickerRoot;
