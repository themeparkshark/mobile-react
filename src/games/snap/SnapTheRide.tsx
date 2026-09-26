/**
 * SnapTheRide — ride challenge: frame the ride's entrance and snap it before
 * the timer runs out. The photo is kept on the phone as that ride coin's
 * souvenir (ride-souvenirs/<rideKey>.jpg). Camera off / denied: a big shutter
 * still lets the guest mark the moment, so no one loses a coin to a setting.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { playSfx } from '../../gamekit/SFX';

const ROUND_SECONDS = 30;

export function souvenirPath(rideName?: string): string | null {
  if (!FileSystem.documentDirectory) return null;
  const key = (rideName ?? 'ride').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ride';
  return `${FileSystem.documentDirectory}ride-souvenirs/${key}.jpg`;
}

export function SnapTheRide({ visible, seed, taskName, onComplete, onClose, onQuit }: {
  readonly visible: boolean;
  readonly seed?: number;
  readonly taskName?: string;
  readonly onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  readonly onClose: () => void;
  readonly onQuit?: (resume: () => void) => void;
}) {
  const shellRef = useRef<GameShellV2Handle>(null);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const startedAt = useRef(0);
  const endsAt = useRef(0);
  const flash = useSharedValue(0);
  const polaroid = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setPlaying(false); setPhotoUri(null); setResult(null); setSecondsLeft(ROUND_SECONDS);
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const finish = useCallback((uri: string | null, snapped: boolean) => {
    const elapsedMs = Date.now() - startedAt.current;
    const left = Math.max(0, (endsAt.current - Date.now()) / 1000);
    const stars = !snapped ? 0 : left >= 20 ? 3 : left >= 10 ? 2 : 1;
    setPlaying(false);
    setResult({
      score: snapped ? Math.round(100 + left * 10) : 0,
      stars,
      message: snapped ? 'PICTURE PERFECT!' : 'MISSED THE SHOT!',
      meta: { score: snapped ? 1 : 0, duration: elapsedMs / 1000, seed: seed ?? 0, photo: !!uri },
    });
  }, [seed]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const left = Math.ceil(Math.max(0, endsAt.current - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) finish(null, false);
      else if (left <= 5) Haptics.selectionAsync();
    }, 1000);
    return () => clearInterval(id);
  }, [playing, finish]);

  const snap = async () => {
    if (!playing) return;
    setPlaying(false);
    flash.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 320 }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSfx('tick');
    let saved: string | null = null;
    try {
      const photo = permission?.granted ? await cameraRef.current?.takePictureAsync({ quality: 0.6, skipProcessing: true }) : null;
      const dest = souvenirPath(taskName);
      if (photo?.uri && dest) {
        await FileSystem.makeDirectoryAsync(dest.slice(0, dest.lastIndexOf('/')), { intermediates: true }).catch(() => undefined);
        await FileSystem.copyAsync({ from: photo.uri, to: dest });
        saved = dest;
      }
    } catch { /* the moment still counts without a saved photo */ }
    setPhotoUri(saved);
    polaroid.value = withSpring(1, { damping: 10, stiffness: 140 });
    playSfx('coin');
    setTimeout(() => finish(saved, true), 900);
  };

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const polaroidStyle = useAnimatedStyle(() => ({
    opacity: polaroid.value,
    transform: [{ translateY: (1 - polaroid.value) * 200 }, { rotate: `${-6 + polaroid.value * 2}deg` }],
  }));
  const ride = taskName ?? 'the ride';

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Snap the Ride"
      subtitle={`${secondsLeft}s left`}
      objective={`Find the ${ride} sign or entrance and snap it!`}
      goal={{ current: photoUri !== null || (result?.stars ?? 0) > 0 ? 1 : 0, target: 1, label: 'PHOTO' }}
      score={0}
      result={result}
      onStart={() => {
        startedAt.current = Date.now();
        endsAt.current = Date.now() + ROUND_SECONDS * 1000;
        polaroid.value = 0;
        setPlaying(true);
      }}
      onPause={() => setPlaying(false)}
      onResume={() => { endsAt.current = Date.now() + secondsLeft * 1000; setPlaying(true); }}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <View style={StyleSheet.absoluteFill}>
        {permission?.granted
          ? <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          : <Image source={require('../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />}

        {/* Gold viewfinder corners, like framing a postcard. */}
        <View style={styles.frame} pointerEvents="none">
          {(['tl', 'tr', 'bl', 'br'] as const).map(c => <View key={c} style={[styles.corner, styles[c]]} />)}
          <Text style={styles.prompt}>{permission?.granted ? `Frame the ${ride} sign` : 'Camera is off · tap to mark the moment'}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Take the photo" onPress={() => void snap()}
          disabled={!playing} style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.92 }] }]}>
          <View style={styles.shutterInner} />
        </Pressable>

        <Animated.View style={[styles.polaroid, polaroidStyle]} pointerEvents="none">
          {photoUri
            ? <Image source={{ uri: photoUri }} style={styles.polaroidPhoto} contentFit="cover" />
            : <View style={[styles.polaroidPhoto, { backgroundColor: '#0768b9' }]} />}
          <Text style={styles.polaroidCaption} numberOfLines={1}>{ride}</Text>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} pointerEvents="none" />
      </View>
    </GameShellV2>
  );
}

const C = 38;
const styles = StyleSheet.create({
  frame: { position: 'absolute', left: 28, right: 28, top: 40, bottom: 170, justifyContent: 'flex-end', alignItems: 'center' },
  corner: { position: 'absolute', width: C, height: C, borderColor: '#ffcf3b' },
  tl: { top: 0, left: 0, borderTopWidth: 6, borderLeftWidth: 6, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: 6, borderRightWidth: 6, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 6, borderLeftWidth: 6, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: 6, borderRightWidth: 6, borderBottomRightRadius: 12 },
  prompt: { marginBottom: 14, fontFamily: 'Shark', fontSize: 20, color: '#fff', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  shutter: { position: 'absolute', bottom: 48, alignSelf: 'center', width: 92, height: 92, borderRadius: 46,
    borderWidth: 6, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#ffcf3b' },
  polaroid: { position: 'absolute', alignSelf: 'center', top: '22%', width: 230, backgroundColor: '#fff', padding: 10,
    paddingBottom: 14, borderRadius: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  polaroidPhoto: { width: '100%', aspectRatio: 1, borderRadius: 2 },
  polaroidCaption: { marginTop: 8, fontFamily: 'Shark', fontSize: 18, color: '#075083', textAlign: 'center' },
});
