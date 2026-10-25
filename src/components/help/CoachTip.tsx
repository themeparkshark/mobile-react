import { Image } from 'expo-image';
import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated as NativeAnimated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, RADIUS, SHADOW } from '../../ui';

const FINN = require('../../../assets/images/tutorial/teacher-shark.png');

/** A picture inside a tip's art calls this (with its own name) once it has drawn. */
export const TipArtLoaded = createContext<(name: string) => void>(() => undefined);
/** The longest a tip waits for its pictures before it shows anyway (a missing file never hides it). */
export const TIP_ART_WAIT_MS = 700;

/**
 * A one-time Finn tip. Never a modal: it floats where the caller puts it, the
 * rest of the screen keeps working, a tap closes it, and it leaves on its own.
 */
export default function CoachTip({ title, body, onDismiss, style, autoHideMs = 9000, compact = false, small = false, art, pointerLeft,
  fit = false, narrow = false, artImages = 0 }: {
  readonly title: string;
  readonly body: string;
  readonly onDismiss: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly autoHideMs?: number;
  /** No Finn art, for tips inside cards and sheets. */
  readonly compact?: boolean;
  /** A short phone: a smaller Finn. */
  readonly small?: boolean;
  /** A picture that says the body with no reading (shown in place of the body text; VoiceOver still reads it). */
  readonly art?: ReactNode;
  /** A little pointer under the card, this far from its left edge, aimed at what the tip is about. */
  readonly pointerLeft?: number;
  /** The card is as wide as its content (up to the style's maxWidth), so OK sits right by the picture. */
  readonly fit?: boolean;
  /** Little room: the title may take two lines and the OK word steps aside (a tap anywhere still closes it). */
  readonly narrow?: boolean;
  /** How many pictures inside `art` report through TipArtLoaded (the card waits for them and Finn). */
  readonly artImages?: number;
}) {
  const [cardWidth, setCardWidth] = useState(0);
  const reduced = useReducedGameMotion();
  // The card shows only once Finn and every picture in it have drawn, so its first visible frame is
  // complete (never an arrow alone, then the ticket, then Finn). It fades in on the UI thread.
  const expected = (compact ? 0 : 1) + (art ? artImages : 0);
  const drawnArt = useRef(new Set<string>());
  const [ready, setReady] = useState(expected === 0);
  const artLoaded = useCallback((name: string) => {
    drawnArt.current.add(name);
    if (drawnArt.current.size >= expected) setReady(true);
  }, [expected]);
  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => setReady(true), TIP_ART_WAIT_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  // Native driver: the card re-renders as it measures itself, and a native value never drops back.
  const shown = useRef(new NativeAnimated.Value(0)).current;
  useEffect(() => {
    if (!ready) return;
    if (reduced) shown.setValue(1);
    else NativeAnimated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [ready, reduced, shown]);
  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
    if (autoHideMs <= 0) return;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
    // Announce and time once per tip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TipArtLoaded.Provider value={artLoaded}>
    <Animated.View pointerEvents={ready ? 'box-none' : 'none'}
      exiting={reduced ? undefined : FadeOut.duration(150)} style={style}>
      <NativeAnimated.View pointerEvents="box-none" style={{ opacity: shown }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} accessibilityHint="Closes the tip"
        onPress={onDismiss} onLayout={pointerLeft !== undefined ? event => setCardWidth(event.nativeEvent.layout.width) : undefined}
        style={[styles.card, compact && styles.compactCard, fit && styles.fitCard]}>
        {!compact && <Image source={FINN} style={[styles.finn, small && styles.finnSmall]} contentFit="contain"
          onLoad={() => artLoaded('finn')} onError={() => artLoaded('finn')} />}
        <View style={fit ? styles.fitCopy : styles.copy}>
          <Text style={styles.title} numberOfLines={art ? (narrow ? 2 : 1) : undefined} adjustsFontSizeToFit={!!art} minimumFontScale={0.8}>{title}</Text>
          {art ? <View style={styles.art}>{art}</View> : <Text style={styles.body}>{body}</Text>}
        </View>
        {!narrow && <Text style={styles.ok}>OK</Text>}
      </Pressable>
      {pointerLeft !== undefined && <View pointerEvents="none"
        style={[styles.pointer, { left: cardWidth > 0 ? Math.min(pointerLeft, cardWidth - 34) : pointerLeft }]} />}
      </NativeAnimated.View>
    </Animated.View>
    </TipArtLoaded.Provider>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.lg,
    borderWidth: 3, borderColor: BRAND.white, paddingVertical: 10, paddingLeft: 6, paddingRight: 12, ...SHADOW.card,
  },
  compactCard: { paddingLeft: 12, borderColor: BRAND.gold },
  finn: { width: 58, height: 58, marginRight: 6 },
  finnSmall: { width: 42, height: 42 },
  art: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  // A cream triangle with the card's white rim, pointing down from the card's bottom edge.
  pointer: { position: 'absolute', bottom: -11, width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BRAND.white },
  copy: { flex: 1 },
  fitCard: { alignSelf: 'flex-start' },
  fitCopy: { flexShrink: 1 },
  title: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginBottom: 2 },
  body: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navySoft },
  ok: { fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, marginLeft: 8 },
});
