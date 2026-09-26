/**
 * RideDetectionOverlay
 * 
 * Global overlay rendered at the Root level (above all screens).
 * Handles foreground single-ride detection popups.
 * 
 * When the app is in the foreground and a ride is detected:
 *   - Shows a slide-up popup: "Did you just ride [name]?"
 *   - User taps "Yes! Log it" -> navigates to RideLog screen for that ride
 *   - User taps "Not this time" -> removes that detection from the queue
 * 
 * Does NOT show when user is on the RideBatchConfirmScreen.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { shadows } from '../../design-system';
import { DetectedRide } from '../../services/RideDetectionService';
import { removePendingDetection } from '../../services/RideDetectionService';
import { rideDetectionEmitter } from '../../services/RideDetectionEmitter';
import { navigationRef, navigate } from '../../RootNavigation';

const RideDetectionOverlay: React.FC = () => {
  const [currentDetection, setCurrentDetection] = useState<DetectedRide | null>(null);
  const [queue, setQueue] = useState<DetectedRide[]>([]);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  // Track whether buttons should be disabled during animation (BUG 13 fix)
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const currentDetectionRef = useRef<DetectedRide | null>(null);

  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_RIDE_DETECTION_PREVIEW === '1') {
      const previewDetection: DetectedRide = {
        id: 'det_preview_popup', rideId: 10, rideName: 'Space Mountain',
        rideType: 'coaster', parkId: 2, enteredAt: Date.now() - 600000,
        exitedAt: Date.now(), dwellTimeMs: 600000, confidence: 'high',
        isReRide: false, detectedAt: Date.now(),
      };
      setQueue(prev => currentDetectionRef.current?.id === previewDetection.id ||
        prev.some(d => d.id === previewDetection.id) ? prev : [previewDetection]);
    }
  }, []);

  // Keep ref in sync for dupe checking
  useEffect(() => {
    currentDetectionRef.current = currentDetection;
  }, [currentDetection]);

  // Listen for foreground ride detections
  useEffect(() => {
    const unsubscribe = rideDetectionEmitter.on('rideDetected', (detection: DetectedRide) => {
      if (detection.confidence === 'low') return;

      // Don't show popup if user is on batch confirm screen (ISSUE 15 fix)
      if (navigationRef.isReady()) {
        const currentRoute = navigationRef.getCurrentRoute();
        if (currentRoute?.name === 'RideBatchConfirm') return;
      }

      setQueue(prev => {
        // Check both queue AND currently displayed detection for dupes (ISSUE 14 fix)
        const isDupeInQueue = prev.some(
          d => d.rideId === detection.rideId && Math.abs(d.detectedAt - detection.detectedAt) < 300_000
        );
        const isDupeCurrent = currentDetectionRef.current != null &&
          currentDetectionRef.current.rideId === detection.rideId &&
          Math.abs(currentDetectionRef.current.detectedAt - detection.detectedAt) < 300_000;

        if (isDupeInQueue || isDupeCurrent) return prev;
        return [...prev, detection];
      });
    });

    return unsubscribe;
  }, []);

  // Show next detection from queue
  useEffect(() => {
    if (!currentDetection && queue.length > 0) {
      const next = queue[0];
      setQueue(prev => prev.slice(1));
      setCurrentDetection(next);
      setButtonsDisabled(false);

      slideAnim.setValue(300);
      opacityAnim.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [currentDetection, queue]);

  const animateOut = useCallback((callback: () => void) => {
    // Disable buttons immediately to prevent double-tap (BUG 13 fix)
    setButtonsDisabled(true);

    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      callback();
      setCurrentDetection(null);
      setButtonsDisabled(false);
    });
  }, [slideAnim, opacityAnim]);

  const handleConfirm = useCallback(() => {
    if (!currentDetection || buttonsDisabled) return;
    const detection = currentDetection;

    animateOut(() => {
      // Keep this detection until the journal API confirms the save.
      // Other queued detections stay in persistent storage for later review;
      // no second popup should cover the memory form.
      setQueue([]);
      navigate('RideLog', {
        rideId: detection.rideId,
        rideName: detection.rideName,
        rideType: detection.rideType,
        parkId: detection.parkId,
        detectionId: detection.id,
        autoDetected: true,
        rodeAt: new Date(detection.enteredAt).toISOString(),
      } as any);
    });
  }, [currentDetection, buttonsDisabled, animateOut]);

  const handleDismiss = useCallback(() => {
    if (!currentDetection || buttonsDisabled) return;
    const detection = currentDetection;

    animateOut(() => {
      void removePendingDetection(detection.id).catch(() => undefined);
    });
  }, [currentDetection, buttonsDisabled, animateOut]);

  if (!currentDetection) return null;

  const dwellMin = Math.round(currentDetection.dwellTimeMs / 60_000);
  const timeStr = new Date(currentDetection.enteredAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Animated.View
      style={[styles.container, { opacity: opacityAnim }]}
      pointerEvents="box-none"
    >
      <Animated.View style={[styles.popup, { transform: [{ translateY: slideAnim }] }]}>
        <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
          style={styles.shark} contentFit="contain" />
        <Text style={styles.title}>DID YOU JUST RIDE...</Text>
        <Text style={styles.rideName}>{currentDetection.rideName}?</Text>
        <Text style={styles.detail}>
          ~{dwellMin} min near the ride {'\u2022'} {timeStr}
          {currentDetection.isReRide ? ' \u2022 Re-ride!' : ''}
        </Text>

        <Pressable
          onPress={handleConfirm}
          disabled={buttonsDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Yes, I rode ${currentDetection.rideName}`}
          style={({ pressed }) => [
            styles.confirmBtn,
            (pressed || buttonsDisabled) && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.confirmBtnText}>Yes, Add My Ride</Text>
        </Pressable>

        <Pressable
          onPress={handleDismiss}
          disabled={buttonsDisabled}
          accessibilityRole="button"
          style={styles.dismissBtn}
          hitSlop={12}
        >
          <Text style={styles.dismissBtnText}>Not this time</Text>
        </Pressable>

        {queue.length > 0 && (
          <Text style={styles.queueHint}>
            +{queue.length} more ride{queue.length > 1 ? 's' : ''} detected
          </Text>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 50,
    zIndex: 9999,
    elevation: 9999,
  },
  popup: {
    backgroundColor: '#F4FBFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    ...shadows.xl,
    borderWidth: 2,
    borderColor: '#84CAEE',
  },
  shark: { width: 112, height: 112, marginBottom: 2 },
  title: {
    color: '#126BAB',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  rideName: {
    color: '#0B4B83',
    fontSize: 27,
    fontWeight: '800',
    fontFamily: 'Shark',
    marginBottom: 6,
    textAlign: 'center',
  },
  detail: {
    color: '#315C7C',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: '#F6C847',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    ...shadows.sm,
  },
  confirmBtnText: {
    color: '#174064',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Shark',
  },
  dismissBtn: {
    marginTop: 12,
    padding: 8,
  },
  dismissBtnText: {
    color: '#315C7C',
    fontSize: 14,
    fontWeight: '600',
  },
  queueHint: {
    color: '#126BAB',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});

export default RideDetectionOverlay;
