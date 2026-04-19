/**
 * QueueGameScreen — Banana Basket (Three.js / WebView).
 *
 * In-line queue mini-game prototype for Despicable Me Minion Mayhem.
 * Mirrors the SharkMiniGame/Sharky HTML5-Three.js pattern since that
 * path is already battle-tested in this app and ships 60fps 3D with
 * PBR lighting + shadows.
 *
 * This screen is the ride-template. Next step after it plays well:
 *   1. Swap asset pack to generate Cauldron Brew / Raptor Nest variants
 *   2. Wire GPS queue-zone gating so it only unlocks in line
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

const BANANA_HTML = require('../assets/minigames/banana-basket/banana-basket.html');

type BridgeMsg =
  | { type: 'ready' }
  | { type: 'start' }
  | { type: 'catch'; variant: 'common' | 'gold' | 'rotten'; score: number }
  | { type: 'gameover'; score: number; best: number; isNewBest: boolean };

export default function QueueGameScreen({ navigation }: any) {
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const resolvedRef = useRef(false);
  const webviewRef = useRef<WebView>(null);

  // Resolve the bundled HTML asset to a local file URI the WebView can load.
  useEffect(() => {
    resolvedRef.current = false;
    Asset.fromModule(BANANA_HTML)
      .downloadAsync()
      .then((asset) => setHtmlUri(asset.localUri || asset.uri))
      .catch(() => setHtmlUri(null));
  }, []);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    navigation?.goBack?.();
  }, [navigation]);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: BridgeMsg | null = null;
      try {
        msg = JSON.parse(e.nativeEvent.data) as BridgeMsg;
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === 'catch') {
        if (msg.variant === 'gold') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (msg.variant === 'rotten') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else if (msg.type === 'gameover') {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        Haptics.notificationAsync(
          msg.isNewBest
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
      } else if (msg.type === 'start') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    []
  );

  // Inject: kill pinch-zoom + block iOS gesture navigation inside WebView.
  const injected = useMemo(
    () => `
    document.addEventListener('gesturestart', e => e.preventDefault());
    true;
  `,
    []
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {htmlUri ? (
        <WebView
          ref={webviewRef}
          source={{ uri: htmlUri, baseUrl: htmlUri }}
          onMessage={handleMessage}
          injectedJavaScript={injected}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          style={styles.webview}
          containerStyle={styles.webview}
        />
      ) : (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#ffd83a" />
          <Text style={styles.loaderText}>LOADING BANANA BASKET...</Text>
        </View>
      )}

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityLabel="Close banana basket game"
        >
          <FontAwesomeIcon icon={faXmark} size={22} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a0e03' },
  webview: { flex: 1, backgroundColor: '#1a0e03' },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a0e03',
  },
  loaderText: {
    color: '#ffd83a',
    marginTop: 16,
    letterSpacing: 3,
    fontSize: 12,
    fontFamily: 'Shark',
  },
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,216,58,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
