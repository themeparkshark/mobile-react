import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Ribbon from '../../components/Ribbon';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, DIALOG_CARD, GameButton, GameIcon, SPACE } from '../../ui';

/** Share of the walk already done, for the meter: 1 when in range, never below a sliver. */
export function closenessFraction(distanceMeters: number | null, requiredMeters: number): number {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) return 0;
  if (distanceMeters <= requiredMeters) return 1;
  return Math.max(0.06, Math.min(0.94, requiredMeters / distanceMeters));
}

export function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/**
 * "Walk closer": his ribbon title over the blue modal card, with a meter that
 * fills toward the pin. Reduced motion shows the filled meter at once.
 */
export default function TooFarDialog({ visible, distanceMeters, requiredMeters, homeItem, onClose }: {
  readonly visible: boolean;
  /** null while the location is unknown. */
  readonly distanceMeters: number | null;
  readonly requiredMeters: number;
  readonly homeItem: boolean;
  readonly onClose: () => void;
}) {
  const reduced = useReducedGameMotion();
  const fill = useSharedValue(0);
  const unknown = distanceMeters === null;
  const target = closenessFraction(distanceMeters, requiredMeters);
  useEffect(() => {
    if (!visible) { fill.value = 0; return; }
    fill.value = reduced ? target : withDelay(180, withTiming(target, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [visible, target, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const title = unknown ? 'Finding you' : 'Almost there!';
  return <Modal isVisible={visible} onBackdropPress={onClose} onBackButtonPress={onClose}
    animationIn={reduced ? 'fadeIn' : 'zoomIn'} animationOut={reduced ? 'fadeOut' : 'zoomOut'}
    animationInTiming={reduced ? 120 : 260} animationOutTiming={reduced ? 120 : 180}
    backdropColor={BRAND.navy} backdropOpacity={0.3}>
    <View style={styles.wrap} accessibilityViewIsModal>
      <View style={styles.ribbon} accessible accessibilityRole="header" accessibilityLabel={title}><Ribbon text={title} /></View>
      <View style={styles.card}>
        <Text style={styles.message}>
          {unknown ? 'Finding your location. Try again in a moment.'
            : homeItem ? 'Stay on public paths. You can collect from nearby without entering private or restricted areas.'
              : 'Walk a little closer to open this spot.'}
        </Text>
        {!unknown && <View style={styles.meterBlock} accessible accessibilityLabel={`You are ${formatMeters(distanceMeters)} away. Get within ${requiredMeters} meters.`}>
          <View style={styles.meterLabels}>
            <Text style={styles.meterLabel}>You: {formatMeters(distanceMeters)}</Text>
            <Text style={styles.meterLabel}>Within {requiredMeters} m</Text>
          </View>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
            <View style={styles.pin}><GameIcon name="pin" size={30} /></View>
          </View>
        </View>}
        <GameButton label="Got it" accessibilityLabel="Got it" onPress={onClose} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%', maxWidth: 380, alignSelf: 'center' },
  ribbon: { width: '100%', zIndex: 2 },
  card: { ...DIALOG_CARD, width: '92%', marginTop: '-10%', paddingTop: SPACE.xxl + SPACE.sm, paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.lg, alignItems: 'center', gap: SPACE.md },
  message: { fontFamily: 'Knockout', fontSize: 16, lineHeight: 22, color: '#e2f6ff', textAlign: 'center' },
  meterBlock: { width: '100%', gap: 6 },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  meterLabel: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  track: { height: 20, borderRadius: 10, backgroundColor: BRAND.sky, borderWidth: 2.5, borderColor: BRAND.white, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: BRAND.gold },
  pin: { position: 'absolute', right: -12, top: -12 },
});
