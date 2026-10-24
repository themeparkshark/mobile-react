import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  Keyboard,
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
  // The chest never moves: the code box fades up and away in its own slot, and
  // the prize card takes that same slot just above the chest. The chest swap,
  // the pop and the first burst ray all start in one native-driver batch, so
  // they land on the same frame. With Reduce Motion everything just appears.
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const openCoins = useRef(new Animated.Value(0)).current;
  const openEmpty = useRef(new Animated.Value(0)).current;
  const formIn = useRef(new Animated.Value(1)).current;
  const cardIn = useRef(new Animated.Value(0)).current;
  const rowsIn = useRef<Animated.Value[]>([]).current;
  const shake = useRef(new Animated.Value(0)).current;
  const prepareRows = useCallback((count: number) => {
    rowsIn.length = 0;
    for (let i = 0; i < count; i++) rowsIn.push(new Animated.Value(reducedMotion ? 1 : 0));
  }, [reducedMotion, rowsIn]);
  const celebrate = useCallback((coins: boolean) => {
    playSound(require('../../assets/sounds/reward.mp3'), { volume: 0.7 });
    const chest = coins ? openCoins : openEmpty;
    if (reducedMotion) {
      chest.setValue(1); formIn.setValue(0); pop.setValue(1); burst.setValue(0); cardIn.setValue(1);
      return;
    }
    const now = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration: 0, useNativeDriver: true });
    Animated.parallel([
      now(chest, 1),
      Animated.timing(formIn, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        now(pop, 0.9),
        Animated.timing(pop, { toValue: 1.12, duration: 160, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
      ]),
      Animated.sequence([
        now(burst, 0.5),
        Animated.timing(burst, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 520, useNativeDriver: true }),
      ]),
      Animated.sequence([
        now(cardIn, 0),
        Animated.timing(cardIn, { toValue: 1, duration: 220, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.stagger(110, rowsIn.map(row => Animated.timing(row, {
        toValue: 1, duration: 200, delay: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }))),
    ]).start();
  }, [reducedMotion, pop, burst, openCoins, openEmpty, formIn, cardIn, rowsIn, playSound]);
  const opened = rewards !== null;
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
      const coins = lines.some(line => line.key === 'coins');
      prepareRows(lines.length);
      Keyboard.dismiss();
      // Chest, pop and burst start now, in one batch; the prize card mounts with this render.
      celebrate(coins);
      setRewards(lines);
      void refreshPlayer?.();
    } catch (failure) {
      if (mounted.current) { setError(redeemError(failure)); nudge(); }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, code, refreshPlayer, prepareRows, nudge, celebrate]);

  const again = useCallback(() => {
    cardIn.setValue(0);
    openCoins.setValue(0);
    openEmpty.setValue(0);
    formIn.setValue(1);
    setRewards(null);
    setCode('');
    setError(null);
  }, [cardIn, openCoins, openEmpty, formIn]);


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
          {/* One slot above the chest: the code box, then the prize card in the same
              place. It keeps its height, so the chest never jumps. */}
          <View style={styles.slot}>
            <Animated.View style={[styles.form, { opacity: formIn,
              transform: [{ translateY: formIn.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }]}
              pointerEvents={opened ? 'none' : 'auto'}
              accessibilityElementsHidden={opened} importantForAccessibility={opened ? 'no-hide-descendants' : 'auto'}>
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
            </Animated.View>
            {opened && (
              <Animated.View style={[styles.prizeCard, { opacity: cardIn,
                transform: [{ scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
                accessibilityLiveRegion="polite">
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
              </Animated.View>
            )}
          </View>
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
            {/* All three chests stay loaded and only one shows. The swap is a native
                opacity change in the same batch as the pop and the burst, so all three
                land on one frame. A code that gave no coins opens the empty chest,
                never a pile of gold. */}
            <Animated.View style={[styles.chest, { transform: [{ scale: pop }] }]}>
              <Animated.View style={[styles.chestLayer, { opacity: Animated.subtract(1, Animated.add(openCoins, openEmpty)) }]}>
                <Image source={require('../../assets/images/screens/redeem/chest_closed.png')}
                  style={styles.chestLayer} contentFit="contain" />
              </Animated.View>
              <Animated.View style={[styles.chestLayer, { opacity: openCoins }]}>
                <Image source={require('../../assets/images/screens/redeem/chest_opened.png')}
                  style={styles.chestLayer} contentFit="contain" />
              </Animated.View>
              <Animated.View style={[styles.chestLayer, { opacity: openEmpty }]}>
                <Image source={require('../../assets/images/social/chest_open_empty.png')}
                  style={styles.chestLayer} contentFit="contain" />
              </Animated.View>
            </Animated.View>
          </View>
        </ScrollView>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, marginTop: -8 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24 },
  slot: { width: '100%', maxWidth: 340, alignItems: 'center', justifyContent: 'flex-end', minHeight: 176 },
  form: { width: '100%', alignItems: 'center' },
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
  chestLayer: { ...StyleSheet.absoluteFillObject },
  // Sits on the bottom of the slot, right above the chest, and grows upward if a code gives a lot.
  prizeCard: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: OUTLINE.thick,
    borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', ...SHADOW.card,
  },
  prizeTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, marginBottom: 6, textAlign: 'center' },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, alignSelf: 'stretch', justifyContent: 'center' },
  prizeImage: { width: 36, height: 36 },
  prizeText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, flexShrink: 1 },
});
