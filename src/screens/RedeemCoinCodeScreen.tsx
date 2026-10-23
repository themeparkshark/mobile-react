import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import redeemCoinCode from '../api/endpoints/coin-codes/redeemCoinCode';
import InformationModal from '../components/InformationModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW } from '../ui';
import {
  CODE_MAX,
  REDEEM_COPY,
  cleanCode,
  codeReady,
  codeRewardLines,
  redeemError,
  type RedeemErrorView,
  type RewardLine,
} from './RedeemCoinCode/redeemCodeModel';

/**
 * Redeem a code: type a coin or Shark Drop code (4 to 20 letters and numbers),
 * tap the button, and the chest opens with every reward it gave. Errors show
 * on the screen in plain words, never a system alert.
 */
export default function RedeemCoinCodeScreen() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RedeemErrorView | null>(null);
  const [rewards, setRewards] = useState<RewardLine[] | null>(null);
  const [gaveCoins, setGaveCoins] = useState(false);
  const { refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const rotate = useRef(new Animated.Value(0)).current;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // The soft starburst turns slowly behind the chest; it holds still with Reduce Motion on.
  useEffect(() => {
    if (reducedMotion) { rotate.stopAnimation(); return; }
    const turn = Animated.loop(Animated.timing(rotate, {
      toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true,
    }));
    turn.start();
    return () => turn.stop();
  }, [reducedMotion, rotate]);
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // The chest pops open with a short gold burst; prizes then slide in one by one.
  // All on the native driver; with Reduce Motion everything just appears.
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const rowsIn = useRef<Animated.Value[]>([]).current;
  const shake = useRef(new Animated.Value(0)).current;
  const celebrate = useCallback((count: number) => {
    rowsIn.length = 0;
    for (let i = 0; i < count; i++) rowsIn.push(new Animated.Value(reducedMotion ? 1 : 0));
    if (reducedMotion) { pop.setValue(1); burst.setValue(0); return; }
    pop.setValue(0.9);
    burst.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.08, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(burst, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 520, useNativeDriver: true }),
      ]),
      Animated.stagger(110, rowsIn.map(row => Animated.timing(row, {
        toValue: 1, duration: 200, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }))),
    ]).start();
  }, [reducedMotion, pop, burst, rowsIn]);
  const nudge = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    if (reducedMotion) return;
    shake.setValue(0);
    Animated.sequence([6, -6, 4, -4, 0].map(toValue =>
      Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }))).start();
  }, [reducedMotion, shake]);

  const submit = useCallback(async () => {
    if (busy) return;
    if (!codeReady(code)) { setError({ message: REDEEM_COPY.tooShort, icon: 'search' }); nudge(); return; }
    setBusy(true);
    setError(null);
    try {
      const reply = await redeemCoinCode(code);
      if (!mounted.current) return;
      const lines = codeRewardLines(reply);
      celebrate(lines.length);
      setRewards(lines);
      setGaveCoins(lines.some(line => line.key === 'coins'));
      playSound(require('../../assets/sounds/reward.mp3'), { volume: 0.7 });
      void refreshPlayer?.();
    } catch (failure) {
      if (mounted.current) { setError(redeemError(failure)); nudge(); }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, code, refreshPlayer, celebrate, nudge, playSound]);

  const again = useCallback(() => {
    setRewards(null);
    setGaveCoins(false);
    setCode('');
    setError(null);
  }, []);

  const opened = rewards !== null;

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Redeem</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal sheet="redeem" />
        </TopbarColumn>
      </Topbar>
      <ImageBackground
        source={require('../../assets/images/screens/welcome/background.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {!opened && (
            <View style={styles.form}>
              <Text style={styles.prompt}>{REDEEM_COPY.prompt}</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={text => { setCode(cleanCode(text)); if (error) setError(null); }}
                maxLength={CODE_MAX}
                placeholder={REDEEM_COPY.placeholder}
                placeholderTextColor={BRAND.skyDeep}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                returnKeyType="go"
                editable={!busy}
                onSubmitEditing={() => void submit()}
                accessibilityLabel="Code"
                accessibilityHint="Type a coin code or Shark Drop code"
              />
              <View style={styles.button}>
                <GameButton label={REDEEM_COPY.open} icon="chest" onPress={() => void submit()}
                  loading={busy} />
              </View>
              {error && (
                <Animated.View style={[styles.errorCard, { transform: [{ translateX: shake }] }]}
                  accessible accessibilityLiveRegion="polite" accessibilityLabel={error.message}>
                  <GameIcon name={error.icon} size={28} />
                  <Text style={styles.errorText}>{error.message}</Text>
                </Animated.View>
              )}
            </View>
          )}
          <View style={styles.stage}>
            <Animated.Image
              source={require('../../assets/images/screens/explore/starburst.png')}
              style={[styles.starburst, { transform: [{ rotate: spin }] }]}
              resizeMode="contain"
            />
            <Animated.View pointerEvents="none" style={[styles.burst, { opacity: burst,
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }] }]}>
              <Image source={require('../../assets/images/screens/explore/starburst.png')} style={styles.burstImage}
                contentFit="contain" tintColor={BRAND.gold} />
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <Image
                source={!opened
                  ? require('../../assets/images/screens/redeem/chest_closed.png')
                  // A code that gave no coins opens an empty chest, never a pile of gold.
                  : gaveCoins ? require('../../assets/images/screens/redeem/chest_opened.png')
                    : require('../../assets/images/social/chest_open_empty.png')}
                style={styles.chest}
                contentFit="contain"
              />
            </Animated.View>
          </View>
          {opened && (
            <View style={styles.prizeCard} accessibilityLiveRegion="polite">
              <Text style={styles.prizeTitle}>{rewards.length ? REDEEM_COPY.done : REDEEM_COPY.nothing}</Text>
              {rewards.map((line, i) => (
                <Animated.View key={line.key} style={[styles.prizeRow, rowsIn[i] && { opacity: rowsIn[i],
                  transform: [{ translateY: rowsIn[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
                  accessible accessibilityLabel={line.text}>
                  {line.imageUrl
                    ? <Image source={{ uri: line.imageUrl }} style={styles.prizeImage} contentFit="contain" />
                    : <GameIcon name={line.icon} size={30} />}
                  <Text style={styles.prizeText} numberOfLines={2}>{line.text}</Text>
                </Animated.View>
              ))}
              <View style={styles.button}>
                <GameButton label={REDEEM_COPY.again} variant="secondary" onPress={again} />
              </View>
            </View>
          )}
        </ScrollView>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, marginTop: -8 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24 },
  form: { width: '100%', maxWidth: 340, alignItems: 'center' },
  prompt: {
    fontFamily: FONT.display, fontSize: 22, color: BRAND.white, textAlign: 'center', marginBottom: 12,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  input: {
    width: '100%', backgroundColor: BRAND.white, borderColor: BRAND.navy, borderWidth: OUTLINE.thick,
    borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 16, fontFamily: FONT.display,
    fontSize: 26, letterSpacing: 2, color: BRAND.navy, textAlign: 'center', ...SHADOW.card,
  },
  button: { width: '100%', marginTop: 14, alignItems: 'center' },
  errorCard: {
    width: '100%', marginTop: 12, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: OUTLINE.thin,
    borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  errorText: { flex: 1, fontFamily: FONT.body, fontSize: 18, color: BRAND.navy },
  burst: { position: 'absolute', width: 320, height: 320, alignItems: 'center', justifyContent: 'center' },
  burstImage: { width: 320, height: 320, opacity: 0.55 },
  stage: { width: '100%', height: 280, alignItems: 'center', justifyContent: 'center' },
  starburst: { position: 'absolute', width: '100%', height: 300, opacity: 0.08 },
  chest: { height: 240, aspectRatio: 1 },
  prizeCard: {
    width: '100%', maxWidth: 340, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: OUTLINE.thick,
    borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', ...SHADOW.card,
  },
  prizeTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, marginBottom: 6, textAlign: 'center' },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, alignSelf: 'stretch', justifyContent: 'center' },
  prizeImage: { width: 36, height: 36 },
  prizeText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, flexShrink: 1 },
});
