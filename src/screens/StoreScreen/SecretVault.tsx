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
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SECRET_THEME as V } from '../../fx/secretTheme';
import { FONT, GameIcon, type GameIconName } from '../../ui';
import { MAX_FONT } from './shopUi';

const RIBBON = require('../../../assets/images/ribbon.png');

export const VAULT = {
  radius: 24,
  rim: 3,
  lip: 7,
} as const;

/** A vault panel: navy body, gold rim, lip and gloss. Children sit on top. */
export function VaultPanel({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  // The lip is its own darker slab under the panel, so the gold rim runs unbroken all the way round.
  return (
    <View style={[styles.lip, style]}>
      <View style={[styles.panel, padded && styles.padded]}>
        <LinearGradient pointerEvents="none" colors={[V.panel, V.panelDeep]} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={styles.gloss} />
        {children}
      </View>
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

/**
 * The vault's secondary door (for example "Ask a grown-up"): navy with a gold rim, white Shark
 * type. Gold faces stay for things a kid can do (try on, buy); this one leads to a grown-up.
 */
export function VaultSecondaryButton({ label, icon, onPress, accessibilityLabel }: { label: string; icon: GameIconName; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.secondary, pressed && { transform: [{ translateY: 2 }], borderBottomWidth: 3 }]}>
      <GameIcon name={icon} size={20} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** A small gold kicker above a title (for example "SECRET SEASON DROP"). */
export function VaultKicker({ text }: { text: string }) {
  return <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>{text}</Text>;
}

const styles = StyleSheet.create({
  lip: { marginHorizontal: 10, borderRadius: VAULT.radius, backgroundColor: V.lip, paddingBottom: VAULT.lip },
  panel: { borderRadius: VAULT.radius, borderWidth: VAULT.rim, borderColor: V.gold, overflow: 'hidden', backgroundColor: V.panelDeep },
  padded: { paddingBottom: 14 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
  ribbon: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: '13%' },
  ribbonText: { fontFamily: FONT.display, fontSize: 23, color: '#7a3d00', marginTop: -6, textAlign: 'center' },
  secondary: { alignSelf: 'center', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20,
    borderRadius: 24, backgroundColor: V.card, borderWidth: 3, borderColor: V.gold, borderBottomWidth: 5, borderBottomColor: V.goldLip },
  secondaryText: { fontFamily: FONT.display, fontSize: 18, color: V.ink, letterSpacing: 0.4,
    textShadowColor: V.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  kicker: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 1.2, color: V.inkGold, textAlign: 'center',
    textShadowColor: V.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
});
