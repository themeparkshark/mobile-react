import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GameIcon } from '../../ui';
import { allowPlayerNavigation, EMBED_BASE_URL, embedHtml } from './watchFeed';

/**
 * In-app YouTube player for the Watch page. Privacy-enhanced embed with
 * rel=0: no comments, no autoplay into unrelated videos, and taps that would
 * leave for youtube.com stay inside the player.
 */
export default function YouTubePlayerModal({
  videoId,
  title,
  onClose,
}: {
  readonly videoId: string | null;
  readonly title: string;
  readonly onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [videoId]);
  const source = useMemo(
    () => (videoId ? { html: embedHtml(videoId), baseUrl: EMBED_BASE_URL } : null),
    [videoId],
  );

  return (
    <Modal
      visible={videoId !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      {/* A Modal is a separate native root: it needs its own provider for insets. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#05080f' }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close video"
            hitSlop={12}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <GameIcon name="close" size={22} />
          </Pressable>
          <Text
            numberOfLines={2}
            style={{ flex: 1, fontFamily: 'Knockout', fontSize: 16, lineHeight: 19, color: 'white' }}
          >
            {title}
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
            {source && (
              <WebView
                source={source}
                style={{ flex: 1, backgroundColor: '#000' }}
                originWhitelist={['*']}
                allowsInlineMediaPlayback
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                allowsLinkPreview={false}
                setSupportMultipleWindows={false}
                javaScriptCanOpenWindowsAutomatically={false}
                onShouldStartLoadWithRequest={req => allowPlayerNavigation(req.url, req.isTopFrame)}
                onLoadEnd={() => setReady(true)}
                scrollEnabled={false}
                bounces={false}
              />
            )}
            {!ready && (
              <View
                pointerEvents="none"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
              >
                <ActivityIndicator color="white" />
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
