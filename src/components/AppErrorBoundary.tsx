/**
 * Last line of defense around the whole app. Without it, any render error in
 * any screen or modal is a fatal JS error and iOS closes the app (that is how
 * one hook-order bug on the coin shelf "crashed the game"). With it, the player
 * sees one friendly card and a button that reloads the app.
 *
 * Error boundaries never see throws in event handlers, timers or async code.
 * services/fatalErrors routes those (release, fatal) here too, so the player
 * gets the same card instead of the app closing. On the testflight and
 * internal channels the card also shows the error text for a screenshot.
 *
 * TAP TO RELOAD remounts the app shell in place. It deliberately does not call
 * Updates.reloadAsync: a JS reload on this New Architecture build hit the
 * Fabric reload crash (2e0e7745), which would turn the safety net into a crash.
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { captureException } from '../services/telemetry';
import { describeError, saveLastError, showsErrorDetail, subscribeFatal, type SavedError } from '../services/fatalErrors';
import { BRAND } from '../ui/tokens';

type State = { readonly failed: boolean; readonly error: SavedError | null; readonly generation: number };

export default class AppErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  state: State = { failed: false, error: null, generation: 0 };
  private unsubscribe: (() => void) | null = null;

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error: describeError(error, true, 'boundary') };
  }

  componentDidMount(): void {
    // A fatal throw outside render (onPress, timer, async): same card, app stays alive.
    this.unsubscribe = subscribeFatal(error => this.setState({ failed: true, error }));
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    void saveLastError(describeError(error, true, 'boundary'));
    try {
      captureException(error, { fatal: false, handled: true, source: 'error-boundary' });
    } catch { /* reporting must never throw here */ }
    if (__DEV__) console.error('AppErrorBoundary caught a render error', error, info?.componentStack);
  }

  // Remount the app shell (a fresh key), never a native JS reload (see the header).
  private reload = () => {
    this.setState(state => ({ failed: false, error: null, generation: state.generation + 1 }));
  };

  render() {
    if (!this.state.failed) return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
    const detail = this.state.error && showsErrorDetail(Updates.channel, __DEV__) ? this.state.error : null;
    return (
      <View style={styles.root}>
        <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">Oops! The app got stuck</Text>
          <Text style={styles.body}>Your coins and progress are safe. Tap the button to start again.</Text>
          <Pressable onPress={this.reload} accessibilityRole="button" accessibilityLabel="Tap to reload"
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
            <Text style={styles.buttonText}>TAP TO RELOAD</Text>
          </Pressable>
          {detail && <Text style={styles.detail} selectable numberOfLines={8}>
            {`${detail.name}: ${detail.message}${detail.stack ? `\n${detail.stack.split('\n').slice(0, 3).map(line => line.trim()).join('\n')}` : ''}`}
          </Text>}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BRAND.blue },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 20,
    borderWidth: 3, borderColor: BRAND.white, padding: 22, gap: 10 },
  title: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, textAlign: 'center' },
  body: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.navy, textAlign: 'center' },
  button: { marginTop: 6, backgroundColor: BRAND.gold, borderRadius: 14, borderBottomWidth: 4, borderBottomColor: '#d99a00',
    paddingVertical: 12, paddingHorizontal: 26 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  detail: { marginTop: 4, fontSize: 11, lineHeight: 14, color: BRAND.navy, opacity: 0.75, textAlign: 'left', alignSelf: 'stretch' },
});
