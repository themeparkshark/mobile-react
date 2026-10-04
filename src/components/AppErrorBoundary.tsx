/**
 * Last line of defense around the whole app. Without it, any render error in
 * any screen or modal is a fatal JS error and iOS closes the app (that is how
 * one hook-order bug on the coin shelf "crashed the game"). With it, the player
 * sees one friendly card and a button that reloads the app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { captureException } from '../services/telemetry';
import { BRAND } from '../ui/tokens';

type State = { readonly failed: boolean };

export default class AppErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    try {
      captureException(error, { fatal: false, handled: true, source: 'error-boundary' });
    } catch { /* reporting must never throw here */ }
    if (__DEV__) console.error('AppErrorBoundary caught a render error', error, info?.componentStack);
  }

  private reload = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Dev builds and Expo Go cannot reload this way: try rendering the app again.
      this.setState({ failed: false });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">Something went wrong</Text>
          <Text style={styles.body}>Your coins and progress are safe.</Text>
          <Pressable onPress={() => void this.reload()} accessibilityRole="button" accessibilityLabel="Tap to reload"
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
            <Text style={styles.buttonText}>TAP TO RELOAD</Text>
          </Pressable>
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
});
