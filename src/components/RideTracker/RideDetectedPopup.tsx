import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, shadows, borderRadius } from '../../design-system';
import { RideType } from '../../api/endpoints/rides';

const { width } = Dimensions.get('window');

interface RideDetectedPopupProps {
  ride: RideType;
  onConfirm: () => void;
  onDismiss: () => void;
}

const RideDetectedPopup: React.FC<RideDetectedPopupProps> = ({ ride, onConfirm, onDismiss }) => {
  const slideAnim = useRef(new Animated.Value(200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 200, duration: 200, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.popup, { transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.emoji}>🎢</Text>
        <Text style={styles.title}>Did you just ride...</Text>
        <Text style={styles.rideName}>{ride.name}?</Text>

        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.confirmBtnText}>🦈 Yes! Rate it</Text>
        </Pressable>

        <Pressable onPress={handleDismiss} style={styles.dismissBtn}>
          <Text style={styles.dismissBtnText}>Not this time</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 40,
    zIndex: 1000,
  },
  popup: {
    backgroundColor: colors.bgMedium,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...shadows.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,165,245,0.3)',
  },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  rideName: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', fontFamily: 'Knockout', marginBottom: 16, textAlign: 'center' },
  confirmBtn: {
    backgroundColor: colors.secondary, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 40, width: '100%', alignItems: 'center', ...shadows.sm,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', fontFamily: 'Knockout' },
  dismissBtn: { marginTop: 12, padding: 8 },
  dismissBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});

export default RideDetectedPopup;
