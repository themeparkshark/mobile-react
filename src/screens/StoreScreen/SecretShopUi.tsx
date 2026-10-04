import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import { FxPauseContext } from '../../fx/FxStage';
import { SECRET_THEME } from '../../fx/secretTheme';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './shopUi';

/**
 * Secret Shop chrome (secret-shop/DESIGN.md 4.2 and 6).
 */

/**
 * The grown-up gate in front of the VIP paywall from the Secret Shop (kids UX
 * rounds 1-2): a two-digit times a one-digit sum, typed on a number pad (no
 * choices to guess from). A wrong answer closes kindly and the gate rests for
 * 30 seconds; nothing scolds.
 */
export function grownUpQuestion(seed: number): { a: number; b: number; answer: number } {
  const a = 12 + (seed % 8);
  const b = 3 + (Math.floor(seed / 8) % 7);
  return { a, b, answer: a * b };
}

export const GATE_REST_MS = 30_000;
let gateRestUntil = 0;
type GateRequest = { resolve: (ok: boolean) => void; seed: number };
let showGate: ((r: GateRequest | null) => void) | null = null;

/** Opens the gate (mounted by GrownUpGateHost) and resolves true only on the right answer. */
export async function askGrownUp(seed = Math.floor(Math.random() * 1000), now = Date.now()): Promise<boolean> {
  if (!showGate) return false;
  await loadRest();
  return new Promise(resolve => showGate!({ resolve, seed: now < gateRestUntil ? -1 : seed }));
}

/** Judges a typed answer; a wrong one rests the gate. Exported for tests. */
export function judgeGate(typed: string, seed: number, now = Date.now()): boolean {
  const ok = typed !== '' && Number(typed) === grownUpQuestion(seed).answer;
  if (!ok) {
    gateRestUntil = now + GATE_REST_MS;
    void AsyncStorage.setItem(REST_KEY, String(gateRestUntil)).catch(() => undefined);
  }
  return ok;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;
const REST_KEY = 'secret-shop:grown-up-rest-until';

/** The 30 s rest survives a force-quit (kids UX round 3). */
async function loadRest() {
  try { gateRestUntil = Math.max(gateRestUntil, Number(await AsyncStorage.getItem(REST_KEY)) || 0); } catch { /* storage is best effort */ }
}

/** The gate's dialog. Mounted once by the Secret Shop. */
export function GrownUpGateHost() {
  const [req, setReq] = useState<GateRequest | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { showGate = r => { setTyped(''); setReq(r); }; return () => { showGate = null; }; }, []);
  if (!req) return null;
  const resting = req.seed < 0;
  const q = resting ? null : grownUpQuestion(req.seed);
  const close = (ok: boolean) => { req.resolve(ok); setReq(null); };
  const press = (k: typeof KEYS[number]) => {
    if (k === 'del') { setTyped(t => t.slice(0, -1)); return; }
    if (k === 'ok') { close(judgeGate(typed, req.seed)); return; }
    setTyped(t => (t.length < 3 ? t + k : t));
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={styles.gateScrim}>
        <View style={[styles.gateCard, resting && styles.gateCardRest]} accessibilityViewIsModal>
          <GameIcon name={resting ? 'moon' : 'member'} size={resting ? 56 : 40} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.gateTitle}>{resting ? 'Resting' : 'Ask a grown-up'}</Text>
          {resting ? (
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.gateBody}>Let's try again in a little while.</Text>
          ) : (
            <>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.gateBody} accessibilityLabel={`Grown-ups: what is ${q!.a} times ${q!.b}?`}>
                Grown-ups: what is {q!.a} × {q!.b}?
              </Text>
              <View style={styles.gateAnswer} accessible accessibilityLabel={typed ? `Answer ${typed}` : 'No answer yet'}>
                <Text style={styles.gateAnswerText}>{typed || ' '}</Text>
              </View>
              <View style={styles.pad}>
                {KEYS.map(k => (
                  <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [styles.key, k === 'ok' && styles.keyOk, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete' : k === 'ok' ? 'Done' : k}
                    disabled={k === 'ok' && !typed}>
                    {/* A delete key, never the red Back arrow (that means "leave" everywhere else). */}
                    <Text style={[styles.keyText, k === 'ok' && styles.keyOkText, k === 'del' && styles.keyDelText]}>{k === 'ok' ? 'OK' : k === 'del' ? '⌫' : k}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {resting ? (
            // The same yellow key as the gate's OK one tap earlier.
            <Pressable onPress={() => close(false)} style={({ pressed }) => [styles.key, styles.keyOk, styles.restOk, pressed && { opacity: 0.7 }]}
              accessibilityRole="button" accessibilityLabel="OK">
              <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.keyText, styles.keyOkText]}>OK</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => close(false)} style={styles.gateCancel} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.gateCancelText}>Not now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** From the Secret Shop to VIP: through the grown-up gate. */
export async function openVipWithGrownUp(): Promise<void> {
  if (await askGrownUp()) RootNavigation.navigate('Membership');
}

/** Non-members: one calm line and a door to VIP, behind the grown-up gate. No countdown, no pressure. */
export const SecretPreviewBanner = memo(function SecretPreviewBanner() {
  return (
    <View style={styles.banner} accessible accessibilityRole="summary"
      accessibilityLabel={`${SECRET_PREVIEW_COPY.title}. ${SECRET_PREVIEW_COPY.body}`}>
      <View style={styles.bannerIcon}><GameIcon name="member" size={30} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerTitle}>{SECRET_PREVIEW_COPY.title}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerBody}>{SECRET_PREVIEW_COPY.body}</Text>
      </View>
      <Pressable onPress={() => { void openVipWithGrownUp(); }} style={styles.bannerCta} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Ask a grown-up about VIP">
        <GameIcon name="lock" size={18} />
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerCtaText}>GROWN-UPS</Text>
      </Pressable>
    </View>
  );
});

export const SECRET_PREVIEW_COPY = {
  title: 'Try anything on!',
  body: 'VIP members can buy these. Every piece you buy is yours forever.',
} as const;

const STAR = require('../../../assets/fx/spark.webp');

/**
 * The Secret unlock beat after a buy (game feel round 3): the stage dims for a
 * breath, then the gold-and-violet frame flares while the piece plays its
 * moment twice (Playercard fxPlay). Its own beat, unlike any tap.
 */
export function UnlockBeat({ trigger, still }: { trigger: number; still: boolean }) {
  const dim = useSharedValue(0);
  const flare = useSharedValue(0);
  useEffect(() => {
    if (!trigger || still) return;
    dim.value = withSequence(withTiming(0.55, { duration: 140 }), withDelay(160, withTiming(0, { duration: 260 })));
    flare.value = withDelay(300, withSequence(withTiming(1, { duration: 160 }), withDelay(260, withTiming(0, { duration: 520 }))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const burst = useSharedValue(0);
  useEffect(() => {
    if (!trigger || still) return;
    burst.value = 0;
    burst.value = withDelay(300, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const flareStyle = useAnimatedStyle(() => ({ opacity: flare.value, transform: [{ scale: 1 + 0.02 * flare.value }] }));
  // The drawn gold starburst (pipeline art, charcoal outline) frames the head and upper body: it pops
  // at full strength from 0.6, peaks at 1.25 and is fully gone by 1.1 on the way out, so it never
  // passes the stage width or turns into a soft haze (art panel round 5).
  const burstStyle = useAnimatedStyle(() => {
    const k = burst.value;
    const s = 0.6 + 0.65 * k;
    return {
      // A half-alpha gold on the dim reads brown, so the fade is one quick blink (about 60 ms).
      opacity: k <= 0 ? 0 : s <= 1.02 ? 1 : Math.max(0, (1.1 - s) / 0.08),
      transform: [{ scale: s }, { rotate: `${k * 24}deg` }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0830' }, dimStyle]} />
      <View pointerEvents="none" style={styles.burstAnchor}>
        <Animated.Image source={BURST} style={[{ width: 240, height: 236 }, burstStyle]} />
        {UNLOCK_SPARKS.map(i => <UnlockSpark key={i} i={i} burst={burst} />)}
      </View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flare, flareStyle]} />
    </>
  );
}

// One 768 px gold burst serves the unlock (crisp at 240 pt on 3x) and the fireworks (perf panel round 5).
const BURST = require('../../../assets/fx/burst-gold.webp');
const UNLOCK_SPARKS = [0, 1, 2, 3, 4, 5, 6];

/** Drawn spark stars thrown outward with the unlock burst. */
function UnlockSpark({ i, burst }: { i: number; burst: { value: number } }) {
  const a = (i / UNLOCK_SPARKS.length) * Math.PI * 2 + 0.3;
  const style = useAnimatedStyle(() => {
    const k = burst.value;
    return {
      opacity: k <= 0 ? 0 : k < 0.7 ? 1 : (1 - k) / 0.3,
      transform: [{ translateX: Math.cos(a) * 150 * k }, { translateY: Math.sin(a) * 120 * k }, { scale: 0.6 + 0.6 * (1 - k) }, { rotate: `${k * 200}deg` }],
    };
  });
  return <Animated.Image source={STAR} style={[{ position: 'absolute', width: 26, height: 26 }, style]} />;
}

/** Fixed star spots (fractions of the box) so every render and capture match. */
/** Stars stay out of the title and button column (the left half), and off the pills (top right). */
const MOTES = [
  [0.6, 0.2, 3], [0.7, 0.33, 2], [0.95, 0.3, 2.5], [0.56, 0.42, 2], [0.86, 0.46, 3], [0.64, 0.58, 2],
  [0.93, 0.6, 2.5], [0.58, 0.72, 2], [0.7, 0.88, 2], [0.95, 0.8, 2.5], [0.76, 0.24, 1.5], [0.82, 0.66, 1.5],
] as const;

function Mote({ i, still }: { i: number; still: boolean }) {
  const [x, y, r] = MOTES[i];
  const glow = useSharedValue(0.5);
  useEffect(() => {
    if (still) { glow.value = 0.6; return; }
    glow.value = withDelay(i * 230, withRepeat(withTiming(1, { duration: 1400 + (i % 4) * 300, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [still]);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * glow.value, transform: [{ scale: 0.7 + 0.5 * glow.value }] }));
  // Drawn twinkle stars (the pipeline's spark star), never flat dots (art panel round 2).
  return <Animated.Image source={STAR} style={[styles.mote, { left: `${x * 100}%`, top: `${y * 100}%`, width: r * 4, height: r * 4 }, style]} />;
}

/** Twinkling star motes over the midnight sky. */
export const StarMotes = memo(function StarMotes({ still }: { still: boolean }) {
  // Paused with the shelves (try-on open, scrolled away).
  const paused = useContext(FxPauseContext);
  still = still || paused;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {MOTES.map((_, i) => <Mote key={i} i={i} still={still} />)}
    </View>
  );
});

const styles = StyleSheet.create({
  banner: { marginHorizontal: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20,
    backgroundColor: SECRET_THEME.card, borderWidth: 3, borderColor: SECRET_THEME.gold },
  bannerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: SECRET_THEME.well },
  bannerTitle: { fontFamily: FONT.display, fontSize: 18, color: SECRET_THEME.ink },
  bannerBody: { fontFamily: FONT.body, fontSize: 14, lineHeight: 18, color: SECRET_THEME.inkSoft },
  // Violet, not the gold BUY face: this door leads to grown-ups, not to buying.
  bannerCta: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: SECRET_THEME.violet, borderWidth: 2, borderColor: SECRET_THEME.border },
  bannerCtaText: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
  mote: { position: 'absolute' },
  flare: { borderRadius: 19, borderWidth: 6, borderColor: SECRET_THEME.gold },
  // A zero-height row at 35% of the stage: the burst and sparks centre on the head, not the belly.
  burstAnchor: { position: 'absolute', left: 0, right: 0, top: '35%', height: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  gateScrim: { flex: 1, backgroundColor: 'rgba(10,6,40,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  gateCard: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 10, padding: 18, borderRadius: 24, backgroundColor: SECRET_THEME.panel,
    borderWidth: 3, borderColor: SECRET_THEME.border },
  gateTitle: { fontFamily: FONT.display, fontSize: 24, color: SECRET_THEME.ink },
  gateBody: { fontFamily: FONT.body, fontSize: 18, color: SECRET_THEME.inkSoft, textAlign: 'center' },
  gateAnswer: { minWidth: 120, minHeight: 48, borderRadius: 14, backgroundColor: SECRET_THEME.well, borderWidth: 2, borderColor: SECRET_THEME.violet,
    alignItems: 'center', justifyContent: 'center' },
  gateAnswerText: { fontFamily: FONT.display, fontSize: 28, color: '#ffffff' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: 3 * 72 + 2 * 8 },
  key: { width: 72, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: SECRET_THEME.card,
    borderWidth: 2, borderColor: SECRET_THEME.border },
  gateCardRest: { maxWidth: 270, paddingVertical: 16, gap: 8 },
  restOk: { width: 160, marginTop: 4 },
  keyOk: { backgroundColor: SECRET_THEME.gold, borderColor: BRAND.goldLip },
  keyText: { fontFamily: FONT.display, fontSize: 24, color: '#ffffff' },
  keyOkText: { fontSize: 20, color: BRAND.navy },
  keyDelText: { fontFamily: undefined, fontSize: 26 },
  gateCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  gateCancelText: { fontFamily: FONT.display, fontSize: 17, color: SECRET_THEME.inkSoft },
});
