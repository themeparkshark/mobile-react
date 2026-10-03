/**
 * A grown-up check before a kid can be found by strangers' searches.
 * Two steps a young child can't pass by tapping around:
 *   1. press and hold the button for 3 seconds (a ring fills);
 *   2. answer a random sum written in words ("forty-seven plus eighteen").
 * "Keep it off" is the primary, gold button; the gate is the quiet one.
 * Resolves true only when both steps pass. Reduce Motion: the ring jumps.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { INK, Pill } from './SocialKit';

const HOLD_MS = 3000;
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0..99 in words. Pure, tested. */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

/** A two-digit sum a young child can't do in their head; `rand` returns [0, 1). */
export function makeProblem(rand: () => number = Math.random): { text: string; answer: number } {
  const a = 23 + Math.floor(rand() * 60);
  const b = 12 + Math.floor(rand() * 15);
  return { text: `${numberWords(a)} plus ${numberWords(b)}`, answer: a + b };
}

export function GrownUpGate({ visible, onDone }: { readonly visible: boolean; readonly onDone: (passed: boolean) => void }) {
  const reduced = useUiReducedMotion();
  const [step, setStep] = useState<'hold' | 'math'>('hold');
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const problem = useMemo(() => makeProblem(), [visible]); // a new sum every time
  const fill = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep('hold'); setValue(''); setWrong(false); fill.value = 0;
  }, [visible, fill]);

  const held = () => { haptic('success'); playSfx('star'); setStep('math'); };
  const startHold = () => {
    fill.value = withTiming(1, { duration: reduced ? 0 : HOLD_MS, easing: Easing.linear });
    timer.current = setTimeout(held, HOLD_MS);
  };
  const stopHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (step === 'hold') { cancelAnimation(fill); fill.value = withTiming(0, { duration: reduced ? 0 : 150 }); }
  };
  const ring = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const check = () => {
    if (Number(value.trim()) === problem.answer) { haptic('success'); onDone(true); return; }
    haptic('failBuzz'); playSfx('fail'); setWrong(true); setValue('');
  };

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => onDone(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          <GameIcon name="lock" size={56} />
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.2}>For grown-ups</Text>
          {step === 'hold' ? (
            <>
              <Text style={styles.body} maxFontSizeMultiplier={1.3}>
                With this on, any shark can find you by typing part of your name. Kids: tap Keep it off.
              </Text>
              <Pill label="Keep it off" tone="gold" onPress={() => onDone(false)} style={{ marginTop: 16, alignSelf: 'stretch' }} />
              <Pressable onPressIn={startHold} onPressOut={stopHold} style={styles.hold}
                accessibilityRole="button" accessibilityLabel="Grown-ups: press and hold for 3 seconds"
                accessibilityActions={[{ name: 'activate', label: 'Hold' }]} onAccessibilityAction={() => held()}>
                <Animated.View style={[styles.holdFill, ring]} />
                <Text style={styles.holdText} maxFontSizeMultiplier={1.2}>Grown-ups: press and hold</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body} maxFontSizeMultiplier={1.3}>What is {problem.text}?</Text>
              <TextInput value={value} onChangeText={t => { setValue(t.replace(/[^0-9]/g, '')); setWrong(false); }}
                keyboardType="number-pad" maxLength={3} autoFocus style={styles.input} accessibilityLabel={`Answer: what is ${problem.text}`}
                onSubmitEditing={check} returnKeyType="done" />
              {wrong && <Text style={styles.wrong} accessibilityLiveRegion="polite">Not quite. Try again.</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
                <Pill label="Check" tone="white" compact onPress={check} disabled={!value} style={{ flex: 1 }} />
                <Pill label="Keep it off" tone="gold" compact onPress={() => onDone(false)} style={{ flex: 2 }} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: BRAND.cream, borderRadius: 24, borderWidth: 3, borderBottomWidth: 6, borderColor: INK, padding: 20, alignItems: 'center' },
  title: { fontFamily: FONT.display, fontSize: 24, color: INK, textTransform: 'uppercase', marginTop: 6 },
  body: { fontFamily: FONT.body, fontSize: 18, color: BRAND.navySoft, textAlign: 'center', marginTop: 6 },
  hold: { marginTop: 14, alignSelf: 'stretch', height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#AFC0D4', overflow: 'hidden', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#D7E4F2' },
  holdText: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft, textAlign: 'center' },
  input: { marginTop: 12, alignSelf: 'stretch', height: 54, borderRadius: 14, borderWidth: 3, borderColor: INK, backgroundColor: '#FFFFFF', fontFamily: FONT.display, fontSize: 26, color: INK, textAlign: 'center' },
  wrong: { fontFamily: FONT.body, fontSize: 16, color: BRAND.redLip, marginTop: 6 },
});
