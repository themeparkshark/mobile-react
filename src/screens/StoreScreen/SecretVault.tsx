/**
 * The Members' Vault look (Secret Shop redesign, October 5): the house language at midnight.
 *
 * - VaultPanel: deep navy body (two tones), one gold rim, the darker house lip under it and a
 *   top-35% gloss (the Collection Book's blue panel recipe, DexParts bluePanel, in vault navy).
 * - VaultRibbon: Alex's ribbon.png plate with the title in Shark 23 on #7a3d00 (DexParts header).
 * - No purple, no glass, no black text shadows: navy shadows only (TextPresets onBlue).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SECRET_THEME as V } from '../../fx/secretTheme';
import { FONT } from '../../ui';
import { MAX_FONT } from './shopUi';

const RIBBON = require('../../../assets/images/ribbon.png');

export const VAULT = {
  radius: 24,
  rim: 3,
  lip: 7,
} as const;

/** A vault panel: navy body, gold rim, lip and gloss. Children sit on top. */
export function VaultPanel({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return (
    <View style={[styles.panel, padded && styles.padded, style]}>
      <LinearGradient pointerEvents="none" colors={[V.panel, V.panelDeep]} style={[StyleSheet.absoluteFill, styles.round]} />
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={styles.gloss} />
      {children}
    </View>
  );
}

/** The ribbon plate title (Alex's ribbon.png): one per shelf. */
export const VaultRibbon = memo(function VaultRibbon({ title, width = 250 }: { title: string; width?: number }) {
  return (
    <View style={[styles.ribbon, { width, height: Math.round(width / 3.92) }]} accessible accessibilityRole="header" accessibilityLabel={title}>
      <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
      <Text maxFontSizeMultiplier={1.15} style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
    </View>
  );
});

/** A small gold kicker above a title (for example "SECRET SEASON DROP"). */
export function VaultKicker({ text }: { text: string }) {
  return <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>{text}</Text>;
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 10, borderRadius: VAULT.radius, borderWidth: VAULT.rim, borderColor: V.gold,
    borderBottomWidth: VAULT.lip, borderBottomColor: V.lip, overflow: 'hidden', backgroundColor: V.panelDeep,
  },
  padded: { paddingBottom: 14 },
  round: { borderRadius: VAULT.radius - VAULT.rim },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
  ribbon: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: '13%' },
  ribbonText: { fontFamily: FONT.display, fontSize: 23, color: '#7a3d00', marginTop: -6, textAlign: 'center' },
  kicker: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 1.2, color: V.inkGold, textAlign: 'center',
    textShadowColor: V.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
});
