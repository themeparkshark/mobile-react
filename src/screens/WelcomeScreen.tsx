import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableWithoutFeedback, View,
} from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import updatePlayer from '../api/endpoints/me/update-player';
import FindOriginalAccount from '../components/FindOriginalAccount';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { RECOVERY_COPY } from '../services/accountRecovery/model';
import { BRAND, GameButton, GameIcon, textPreset } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';

// Theme-park-flavored names, all letters/numbers and never over 12 characters.
const FIRST = ['Churro', 'Fin', 'Coaster', 'Splash', 'Chomp', 'Dole', 'Turkey', 'Castle', 'Rocket', 'Pirate',
  'Popcorn', 'Loop', 'Drop', 'Wave', 'Tiki', 'Parade'];
const SECOND = ['Fan', 'Fin', 'Rider', 'Chomp', 'King', 'Boss', 'Shark', 'Queen', 'Hero', 'Pal', 'Buddy', 'Legend'];

function rollName(): string {
  for (let i = 0; i < 20; i++) {
    const a = FIRST[Math.floor(Math.random() * FIRST.length)];
    const b = SECOND[Math.floor(Math.random() * SECOND.length)];
    if (a === b) continue;
    const base = `${a}${b}`;
    const digits = String(Math.floor(Math.random() * 90) + 10);
    const name = base.length + 2 <= 12 ? `${base}${digits}` : base.slice(0, 12);
    if (name.length >= 4) return name;
  }
  return `Shark${Math.floor(Math.random() * 9000) + 1000}`;
}

type Check = { ok: boolean; hint: string };
function check(name: string): Check {
  if (!name) return { ok: false, hint: '4 to 12 letters or numbers' };
  if (/[^a-z0-9]/i.test(name)) return { ok: false, hint: 'Letters and numbers only, no spaces' };
  if (!/[a-z]/i.test(name)) return { ok: false, hint: 'Add at least one letter' };
  if (name.length < 4) return { ok: false, hint: `${4 - name.length} more to go` };
  return { ok: true, hint: 'Looks great!' };
}

export default function WelcomeScreen({ navigation }: NativeStackScreenProps<any>) {
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [findingOriginal, setFindingOriginal] = useState(false);
  const { refreshPlayer } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const inputRef = useRef<TextInput>(null);
  const reduced = useUiReducedMotion();

  // Shark swims in, then bobs; the starburst turns slowly behind it.
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  const cheer = useSharedValue(0);
  const dice = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    bob.value = withDelay(700, withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    spin.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(spin); };
  }, [bob, spin]);
  const sharkStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -bob.value * 14 - cheer.value * 60 },
      { rotate: `${-4 + bob.value * 8 + cheer.value * 360}deg` },
      { scale: 1 + cheer.value * 0.08 },
    ],
  }));
  const burstStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const diceStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${dice.value * 360}deg` }] }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const status = check(username);
  const hint = serverError ?? status.hint;
  const hintOk = !serverError && status.ok;

  const roll = () => {
    Haptics.selectionAsync();
    dice.value = 0;
    dice.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) });
    setServerError(null);
    setUsername(rollName());
  };

  const submit = async () => {
    Keyboard.dismiss();
    const name = username.trim();
    if (!check(name).ok || submitting) {
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }),
        withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      await updatePlayer({ username: name });
      await refreshPlayer();
      setDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      cheer.value = withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 9 }));
      // Straight to play after the little celebration. Team choice waits
      // until it matters (first Ride Control moment).
      setTimeout(() => navigation.navigate('Explore'), 1300);
    } catch (error: any) {
      const message = error?.response?.data?.errors?.username?.[0]
        ?? error?.response?.data?.message ?? 'Something went wrong. Try again.';
      setServerError(/taken/i.test(message) ? 'That name is taken. Try another or roll one!' : message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }),
        withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <Image source={require('../../assets/images/screens/welcome/background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.column}>
            <Animated.View entering={ZoomIn.delay(100).springify().damping(12)}>
              <Image source={require('../../assets/images/screens/login/logo.png')} style={styles.logo} contentFit="contain" />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(300).duration(500)} style={styles.hook}>
              {done ? `You're in, ${username}!` : 'Catch every ride coin.\nBeat bosses. Win rides for your team.'}
            </Animated.Text>

            <View style={styles.stage}>
              <Animated.Image source={require('../../assets/images/screens/explore/starburst.png')}
                style={[styles.burst, burstStyle]} resizeMode="contain" />
              <Animated.View entering={FadeInUp.delay(450).springify().damping(11)} style={sharkStyle}>
                <Image source={require('../../assets/images/screens/welcome/shark.png')} style={styles.shark} contentFit="contain" />
              </Animated.View>
            </View>

            {!done && (
              <Animated.View entering={FadeInUp.delay(650).duration(500)} style={[styles.card, cardStyle]}>
                <Text style={styles.cardTitle}>{labels?.welcome ? `${labels.welcome} ` : ''}Name your shark</Text>
                <View style={styles.inputRow}>
                  <Pressable style={styles.inputWrap} onPress={() => inputRef.current?.focus()}>
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      value={username}
                      onChangeText={t => { setServerError(null); setUsername(t.replace(/\s/g, '')); }}
                      placeholder="SharkName"
                      placeholderTextColor="#9bb4cf"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={12}
                      returnKeyType="go"
                      onSubmitEditing={() => void submit()}
                      accessibilityLabel="Shark name"
                    />
                  </Pressable>
                  <Pressable onPress={roll} style={styles.dice} accessibilityRole="button" accessibilityLabel="Roll a random name">
                    <Animated.View style={diceStyle}><GameIcon name="dice" size={36} /></Animated.View>
                  </Pressable>
                </View>
                <View style={styles.hintRow}>
                  {hintOk && <GameIcon name="check" size={18} />}
                  <Text style={[styles.hint, hintOk && styles.hintOk, !!serverError && styles.hintBad]}>{hint}</Text>
                </View>
                {/* His yellow button. An invalid name still takes the press so the card can shake and say why. */}
                <View style={[styles.go, !status.ok && styles.goOff]}>
                  <GameButton label={labels?.letsgo || "Let's Go!"} loading={submitting} haptics={false}
                    onPress={() => void submit()} accessibilityHint="Saves your shark name" />
                </View>
              </Animated.View>
            )}
            {!done && (
              <Animated.View entering={reduced ? undefined : FadeInUp.delay(800).duration(400)}>
                {/* Returning players from the original app: bring back the old account instead of naming a new shark. */}
                <GameButton label={RECOVERY_COPY.welcomeLink} variant="ghost" tone="onBlue"
                  fullWidth={false} onPress={() => setFindingOriginal(true)}
                  accessibilityHint="Reconnects the account you had in the original Theme Park Shark app" testID="welcome-find-original" />
              </Animated.View>
            )}
            {!done && (
              <Animated.Text entering={reduced ? undefined : FadeInUp.delay(900).duration(400)} style={styles.disclaimer}>
                Theme Park Shark is an independent fan app, not affiliated with or endorsed by any theme park.
              </Animated.Text>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
        <FindOriginalAccount visible={findingOriginal} onClose={() => setFindingOriginal(false)} />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  safe: { flex: 1 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 16 },
  logo: { width: 250, height: 110, marginTop: 8 },
  hook: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 4, lineHeight: 22,
    textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  stage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 170 },
  burst: { position: 'absolute', width: 420, height: 420, opacity: 0.1 },
  shark: { width: 260, height: 260 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 26, borderWidth: 4, borderColor: '#0b4f96', padding: 16,
    shadowColor: '#021e45', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  cardTitle: { fontFamily: 'Shark', fontSize: 24, color: '#09268f', textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  inputWrap: { flex: 1, backgroundColor: '#eef6ff', borderRadius: 16, borderWidth: 3, borderColor: '#bcd9f5' },
  input: { fontFamily: 'Shark', fontSize: 26, color: '#09268f', textAlign: 'center', paddingVertical: 10 },
  dice: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#ffcf3b', alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  hint: { fontFamily: 'Knockout', fontSize: 15, color: '#5b7a9c', textAlign: 'center' },
  hintOk: { color: '#16a34a' },
  hintBad: { color: '#dc2626' },
  go: { marginTop: 10, alignItems: 'center' },
  goOff: { opacity: 0.55 },
  disclaimer: { ...textPreset('caption', 'onBlue'), color: BRAND.white, opacity: 0.9, textAlign: 'center', marginTop: 10,
    marginHorizontal: 12, textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
