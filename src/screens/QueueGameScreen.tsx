/**
 * QueueGameScreen — Empty-scene Filament smoke test.
 *
 * Third pass. Previous version with Model + Camera crashed the process on
 * entry (SIGKILL, likely OOM from the 6.4MB shark-avatar.glb OR a Metal
 * surface init race inside the stack animator). This version strips to
 * absolute minimum: FilamentScene + FilamentView + DefaultLight, no camera
 * props, no model. If we see a gradient background through the empty
 * Filament view without a crash, the engine mounts cleanly — then we add
 * a tiny test mesh, then the shark, then gameplay.
 */

import { useCallback } from 'react';
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
} from 'react-native-filament';

// --- 3D scene: just lights, no geometry yet. ---

function Scene() {
  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      <Camera />
      <DefaultLight />
    </FilamentView>
  );
}

// --- Screen wrapper: HUD + host. ---

export default function QueueGameScreen({ navigation }: any) {
  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    navigation?.goBack?.();
  }, [navigation]);

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

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityLabel="Close 3D preview"
        >
          <FontAwesomeIcon icon={faXmark} size={22} color="#fff" />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} pointerEvents="none">
        <Text style={styles.hintText}>Filament mount test</Text>
        <Text style={styles.hintSub}>
          If you see this without a crash, the engine is healthy — we add a
          test cube next.
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
