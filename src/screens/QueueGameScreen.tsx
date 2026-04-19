/**
 * QueueGameScreen — Minimal Filament smoke test.
 *
 * Deliberately stripped down: FilamentScene + FilamentView + Camera +
 * DefaultLight + Model, nothing else. If this renders, Filament works
 * and we layer complexity on top one piece at a time (camera manipulator,
 * touch handlers, HUD, game loop).
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

import {
  FilamentScene,
  FilamentView,
  Camera,
  DefaultLight,
  Model,
} from 'react-native-filament';

const SHARK_GLB = require('../../assets/models/shark-avatar.glb');

// --- Inner scene: only the 3D pieces, all inside <FilamentScene>. ---

function Scene() {
  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      <Camera />
      <DefaultLight />
      <Model source={SHARK_GLB} />
    </FilamentView>
  );
}

// --- Screen wrapper: HUD + host. ---

export default function QueueGameScreen({ navigation }: any) {
  const [tapCount, setTapCount] = useState(0);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    navigation?.goBack?.();
  }, [navigation]);

  const bumpTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTapCount((n) => n + 1);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0b1b3a', '#1a3b6e', '#2b6cb0', '#4c9cd6']}
        style={StyleSheet.absoluteFill}
      />

      <FilamentScene>
        <Scene />
      </FilamentScene>

      {/* Transparent tap layer on top of the scene — bumps a counter so we
          can see the screen is responsive even without FilamentView touch. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={bumpTap} />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityLabel="Close 3D preview"
        >
          <FontAwesomeIcon icon={faXmark} size={22} color="#fff" />
        </Pressable>
        <View style={styles.tapPill}>
          <Text style={styles.tapText}>Taps: {tapCount}</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} pointerEvents="none">
        <Text style={styles.hintText}>3D smoke test</Text>
        <Text style={styles.hintSub}>
          If you see the shark: Filament works. Next: game loop.
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1b3a' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tapText: {
    color: '#fff',
    fontFamily: 'Shark',
    fontSize: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
  hintText: {
    color: '#fff',
    fontFamily: 'Shark',
    fontSize: 20,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hintSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
