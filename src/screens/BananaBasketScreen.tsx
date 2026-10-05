/**
 * BananaBasketScreen — Three.js / WebView in-line queue mini-game.
 *
 * Loads the self-contained HTML5 game at
 * src/assets/minigames/banana-basket/banana-basket.html
 * via WebView, mirroring the Sharky/Flappy pattern used elsewhere.
 *
 * JS-only iteration — edits to the .html reload after a Metro bundle,
 * no native rebuild needed.
 */

import { MINIGAME_ORIGIN_WHITELIST, allowMinigameNavigation } from '../components/minigameWeb';
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
  | { type: 'catch'; variant: 'common' | 'gold' | 'rotten' | 'apple' | 'orange'; score: number }
  | { type: 'gameover'; score: number; best: number; isNewBest: boolean };

export default function BananaBasketScreen({ navigation }: any) {
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const resolvedRef = useRef(false);
  const webviewRef = useRef<WebView>(null);

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

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: BridgeMsg | null = null;
    try { msg = JSON.parse(e.nativeEvent.data) as BridgeMsg; } catch { return; }
    if (!msg) return;

    if (msg.type === 'catch') {
      if (msg.variant === 'gold') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (msg.variant === 'rotten') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  }, []);

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
          originWhitelist={MINIGAME_ORIGIN_WHITELIST}
          onShouldStartLoadWithRequest={allowMinigameNavigation}
          setSupportMultipleWindows={false}
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
          <ActivityIndicator size="large" color="#ffd32a" />
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
  root: { flex: 1, backgroundColor: '#0b0603' },
  webview: { flex: 1, backgroundColor: '#0b0603' },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0603',
  },
  loaderText: {
    color: '#ffd32a',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,211,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
