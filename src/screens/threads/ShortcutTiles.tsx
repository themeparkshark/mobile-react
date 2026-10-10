/**
 * The "More Shark fun" sheet behind Social's chest: one row of Alex's
 * shortcut art (Pin Trading, Coin Codes, Merch, VIP, Watch). Each tile
 * presses like every other Social tap (squash, click, haptic) and pops in
 * one after another when the chest opens. Locked tiles keep the lock badge
 * and still answer the tap (the permission check explains why).
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import usePermissions from '../../hooks/usePermissions';
import type { ButtonType } from '../../models/button-type';
import { BRAND } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { PressScale } from './socialLook';

const LOCK = require('../../../assets/images/locked.png');

export default function ShortcutTiles({ tiles }: { readonly tiles: readonly ButtonType[] }) {
  const { hasPermission } = usePermissions();
  const reduced = useUiReducedMotion();
  const shown = tiles.filter((tile) => tile.show !== false);
  return (
    <View style={styles.row}>
      {shown.map((tile, i) => {
        const locked = tile.permission !== undefined && !hasPermission(tile.permission);
        return (
          <Animated.View key={tile.text ?? i} entering={reduced ? undefined : FadeInDown.delay(120 + i * 45).springify().damping(13)}
            style={styles.cell}>
            <PressScale onPress={tile.onPress} scaleTo={0.86} accessibilityLabel={locked ? `${tile.text}, locked` : tile.text}
              style={styles.tile}>
              <Image source={tile.image} style={styles.art} contentFit="contain" />
              {locked && <Image source={LOCK} style={styles.lock} contentFit="contain" />}
              {!!tile.text && <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tile.text}</Text>}
            </PressScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 14, marginBottom: 6 },
  cell: { width: 76, alignItems: 'center' },
  tile: { alignItems: 'center', width: 74, paddingVertical: 2 },
  art: { width: 66, height: 66 },
  lock: { position: 'absolute', top: 46, right: 6, width: 20, height: 20 },
  label: { marginTop: 6, fontFamily: 'Knockout', fontSize: 15, textTransform: 'uppercase', color: BRAND.navy, textAlign: 'center' },
});
