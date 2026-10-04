/**
 * Case File reveal: the card flips from the locked silhouette to its front
 * (server art when present, the title overlaid on the blank plate), with the
 * year badge, a NEW stamp for a first find, the body and "Into the Lantern",
 * which really opens the Deep Lantern (FrightCard for this event); without an
 * event slug the button reads "Keep it" and just closes.
 * Reduce Motion: a plain fade, no flip.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import type { FrightCaseFileDrop } from '../../api/endpoints/fright';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import * as RootNavigation from '../../RootNavigation';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import ArtImage from './ArtImage';
import { NightButton } from './ui';

const CARD_W = 260;
const CARD_H = 360;

export default function CaseFileReveal({ file, onClose, eventSlug = null }: {
  readonly file: FrightCaseFileDrop | null;
  readonly onClose: () => void;
  /** The event whose Deep Lantern "Into the Lantern" opens. */
  readonly eventSlug?: string | null;
}) {
  const reduced = useReducedGameMotion();
  const flip = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [front, setFront] = useState(false);

  useEffect(() => {
    if (!file) return;
    flip.setValue(0);
    fade.setValue(0);
    setFront(reduced);
    Animated.timing(fade, { toValue: 1, duration: reduced ? 250 : 200, useNativeDriver: true }).start();
    if (reduced) return;
    // Back (locked silhouette) for a beat, then flip to the front at the halfway point.
    const halfway = flip.addListener(({ value }) => { if (value >= 0.5) setFront(true); });
    Animated.sequence([
      Animated.delay(450),
      Animated.timing(flip, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]).start();
    return () => flip.removeListener(halfway);
  }, [file, reduced, flip, fade]);

  if (!file) return null;
  const rotateY = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
  const label = `${file.new ? 'New ' : ''}Case File ${file.number}, ${file.year_label}. ${file.title}. ${file.body}`;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, { opacity: fade }]}>
        <Animated.View accessible accessibilityLabel={label}
          style={[styles.card, { transform: reduced ? [] : [{ perspective: 900 }, { rotateY }] }]}>
          {front ? (
            <>
              <ArtImage uri={file.image} fit="cover" style={StyleSheet.absoluteFill}
                fallback={<View style={[StyleSheet.absoluteFill, styles.plainFront]} />} />
              <View style={styles.yearBadge}><Text style={styles.yearText}>{file.year_label}</Text></View>
              {file.new && <View style={styles.stamp}><Text style={styles.stampText}>NEW</Text></View>}
              <View style={styles.plate}>
                <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{file.title}</Text>
              </View>
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.back]}>
              <GameIcon name="lock" size={56} />
              <Text style={styles.backText}>CASE FILE</Text>
            </View>
          )}
        </Animated.View>
        {front && <Text style={styles.body}>{file.body}</Text>}
        <NightButton label={eventSlug ? 'Into the Lantern' : 'Keep it'} style={{ marginTop: 14, minWidth: 220 }}
          onPress={() => {
            onClose();
            if (eventSlug) RootNavigation.navigate('FrightCard', { eventSlug });
          }} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: CARD_W, height: CARD_H, borderRadius: 22, borderWidth: 4, borderColor: NIGHT.candy, overflow: 'hidden',
    backgroundColor: NIGHT.haunt, shadowColor: NIGHT.ink, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  plainFront: { backgroundColor: NIGHT.haunt },
  back: { backgroundColor: NIGHT.midnight, alignItems: 'center', justifyContent: 'center', gap: 10 },
  backText: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.fog, letterSpacing: 2 },
  yearBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: NIGHT.midnight, borderRadius: 10, borderWidth: 2,
    borderColor: NIGHT.lantern, paddingHorizontal: 8, paddingVertical: 3 },
  yearText: { fontFamily: 'Shark', fontSize: 14, color: NIGHT.lantern },
  stamp: { position: 'absolute', top: 14, right: 10, borderWidth: 3, borderColor: NIGHT.pumpkin, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '12deg' }], backgroundColor: 'rgba(30,24,56,0.6)' },
  stampText: { fontFamily: 'Shark', fontSize: 18, color: NIGHT.pumpkin },
  plate: { position: 'absolute', left: 16, right: 16, bottom: 18, minHeight: 56, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8 },
  title: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.moon, textAlign: 'center',
    textShadowColor: NIGHT.ink, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  body: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 22, color: NIGHT.fogLight, textAlign: 'center', marginTop: 14, maxWidth: 320 },
});
