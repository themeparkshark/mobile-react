import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';

const SHARKY_HTML = require('../assets/minigames/sharky/sharky.html');
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  taskName: string;
  targetScore?: number;
  onClose: () => void;
  onComplete: (multiplier: number, payload: { score: number; best: number; isNewBest: boolean }) => void;
}

type BridgeMsg =
  | { type: 'start' }
  | { type: 'flap' }
  | { type: 'score'; score: number }
  | { type: 'gameover'; score: number; best: number; isNewBest: boolean };

// Score → multiplier mapping (pass/fail with tiers, matches the other minigames' feel)
function scoreToMultiplier(score: number, target: number): number {
  if (score < target) return 0;
  if (score >= target * 3) return 2.0;
  if (score >= target * 2) return 1.5;
  return 1.0;
}

export default function SharkMiniGame({ visible, taskName, targetScore = 5, onClose, onComplete }: Props) {
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState(0);
  const resolvedRef = useRef(false);
  const webviewRef = useRef<WebView>(null);

  // Resolve the bundled HTML asset to a local URI the WebView can load.
  useEffect(() => {
    if (!visible) return;
    resolvedRef.current = false;
    setLiveScore(0);
    Asset.fromModule(SHARKY_HTML)
      .downloadAsync()
      .then(asset => setHtmlUri(asset.localUri || asset.uri))
      .catch(() => setHtmlUri(null));
  }, [visible]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: BridgeMsg | null = null;
    try { msg = JSON.parse(e.nativeEvent.data) as BridgeMsg; } catch { return; }
    if (!msg) return;

    if (msg.type === 'flap') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (msg.type === 'score') {
      setLiveScore(msg.score);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (msg.type === 'gameover') {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      Haptics.notificationAsync(
        msg.isNewBest
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      const mult = scoreToMultiplier(msg.score, targetScore);
      // Let the game's GAME OVER screen play for a beat before closing.
      setTimeout(() => {
        onComplete(mult, { score: msg.score, best: msg.best, isNewBest: msg.isNewBest });
      }, 1400);
    }
  }, [targetScore, onComplete]);

  const injected = useMemo(() => `
    // Suppress zoom, disable text selection just to be safe inside the WebView.
    document.addEventListener('gesturestart', e => e.preventDefault());
    true;
  `, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent supportedOrientations={['portrait']}>
      <View style={styles.container}>
        {htmlUri ? (
          <WebView
            ref={webviewRef}
            source={{ uri: htmlUri, baseUrl: htmlUri }}
            onMessage={handleMessage}
            injectedJavaScript={injected}
            originWhitelist={["*"]}
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
            <ActivityIndicator size="large" color="#32e6d3" />
            <Text style={styles.loaderText}>LOADING SHARKY...</Text>
          </View>
        )}

        {/* Header: task name + close, floats over the WebView */}
        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.taskBadge}>
            <Text style={styles.taskBadgeText} numberOfLines={1}>
              {taskName}
            </Text>
            <Text style={styles.targetText}>GOAL: {targetScore}+</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#02060f',
  },
  webview: {
    flex: 1,
    backgroundColor: '#02060f',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#02060f',
  },
  loaderText: {
    color: '#aeeae3',
    marginTop: 16,
    letterSpacing: 3,
    fontSize: 12,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskBadge: {
    flex: 1,
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(6,18,36,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(174,234,227,0.35)',
    borderRadius: 10,
  },
  taskBadgeText: {
    color: '#fafdff',
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 13,
  },
  targetText: {
    color: '#ffe28a',
    letterSpacing: 2,
    fontSize: 10,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6,18,36,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,154,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#ff6b9a',
    fontSize: 18,
    fontWeight: '700',
  },
});
