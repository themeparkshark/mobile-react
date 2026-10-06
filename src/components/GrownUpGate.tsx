import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameIconName } from '../ui/iconNames';
import RealMoneyMark from './RealMoneyMark';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { BRAND, FONT, GameIcon } from '../ui';

/**
 * The grown-up gate in front of every paywall and real-money purchase
 * (Apple Kids category, guideline 1.3; Secret Shop kids UX rounds 1-5).
 *
 * - A two-digit times a one-digit sum (23..89 times 6..9, no round tens),
 *   typed on a number pad: no choices to guess from, and a 9 or 10 year old
 *   can't do it in their head.
 * - A pass covers only the door it was asked for, plus the next step of that
 *   same flow (the paywall's entry, then its Buy), once, within 2 minutes.
 *   Every other door asks again, and a wrong answer cancels any pass.
 * - A wrong answer closes kindly and the gate rests for 30 seconds (a moon,
 *   "Resting", one line, OK). The rest survives a force-quit. Nothing scolds.
 * - Mounted once at the root (GrownUpGateHost in Root.tsx). With no host,
 *   askGrownUp() answers false: a door never opens ungated.
 *
 * Every way into the VIP paywall goes through openMembership(), and every way
 * out of the app through services/external; source tests fail the build on a
 * bare navigate('Membership'), openURL, openBrowserAsync or share call.
 */
export function grownUpQuestion(seed: number): { a: number; b: number; answer: number } {
  const s = Math.abs(Math.floor(seed));
  const a = (2 + (s % 7)) * 10 + (3 + (Math.floor(s / 7) % 7));
  const b = 6 + (Math.floor(s / 49) % 4);
  return { a, b, answer: a * b };
}

export const GATE_REST_MS = 30_000;
/** How long a pass waits for its flow's next step (the paywall's Buy after its entry). */
export const GATE_PASS_MS = 2 * 60_000;
/** The flows a pass can carry into their next step. */
export type GateFlow = 'vip';
let pass: { flow: GateFlow; until: number } | null = null;
let vipMember = false;
const REST_KEY = 'grown-up-gate:rest-until';
let gateRestUntil = 0;
type GateRequest = { resolve: (ok: boolean) => void; seed: number; reason?: GateReason | null };
let showGate: ((r: GateRequest | null) => void) | null = null;
let open: Promise<boolean> | null = null;

/** The 30 s rest survives a force-quit. */
async function loadRest() {
  try { gateRestUntil = Math.max(gateRestUntil, Number(await AsyncStorage.getItem(REST_KEY)) || 0); } catch { /* storage is best effort */ }
}

/**
 * What the grown-up is saying yes to, in plain words, shown above the sum so
 * nobody answers blind: "This costs real money. $4.99 for 10 tickets."
 * - money: a real-money buy (Supplies, VIP). `price` and `gets` are shown as is.
 * - vip: opening the VIP page (nothing is bought yet).
 * - leave: a link that leaves the game (`where`: "a website", "the App Store", "email").
 * - share: the share sheet.
 */
export type GateReason =
  | { readonly kind: 'money'; readonly price: string; readonly gets: string }
  | { readonly kind: 'vip'; readonly prices?: string }
  | { readonly kind: 'leave'; readonly where: string }
  | { readonly kind: 'share' };

/** The two lines the gate shows for a reason. Exported for tests. */
export function gateReasonLines(reason: GateReason | null | undefined): { head: string; line: string | null; icon: GameIconName | 'money' } | null {
  if (!reason) return null;
  switch (reason.kind) {
    case 'money': return { head: 'This costs real money.', line: `${reason.price} for ${reason.gets}`, icon: 'money' };
    case 'vip': return { head: 'VIP costs real money.', line: reason.prices ?? 'The prices are on the next screen.', icon: 'money' };
    case 'leave': return { head: 'This leaves the game.', line: `It opens ${reason.where}.`, icon: 'arrow' };
    case 'share': return { head: 'This shares outside the game.', line: 'It sends this to another app.', icon: 'arrow' };
  }
}

/** Opens the gate and resolves true only on the right answer. A second ask while it is open shares the first. */
export function askGrownUp(reason: GateReason | null = null, seed = Math.floor(Math.random() * 1000), now = Date.now()): Promise<boolean> {
  if (!showGate) return Promise.resolve(false);
  open ??= loadRest()
    .then(() => new Promise<boolean>(resolve => showGate ? showGate({ resolve, seed: now < gateRestUntil ? -1 : seed, reason }) : resolve(false)))
    .finally(() => { open = null; });
  return open;
}

/** Judges a typed answer; a wrong one rests the gate. Exported for tests. */
export function judgeGate(typed: string, seed: number, now = Date.now()): boolean {
  const ok = seed >= 0 && typed !== '' && Number(typed) === grownUpQuestion(seed).answer;
  if (!ok) {
    pass = null; // a wrong answer cancels any pass
    gateRestUntil = now + GATE_REST_MS;
    void AsyncStorage.setItem(REST_KEY, String(gateRestUntil)).catch(() => undefined);
  }
  return ok;
}

/**
 * The next step of a flow a grown-up just opened (the paywall's Buy): uses the
 * pass once if it is this flow's and still fresh, otherwise asks again.
 */
export async function grownUpForNextStep(flow: GateFlow, now = Date.now(), reason: GateReason | null = null): Promise<boolean> {
  const held = pass;
  pass = null; // single use, whatever happens next
  if (held && held.flow === flow && now < held.until) return true;
  return askGrownUp(reason);
}

/** The paywall lost focus: its pass is gone (a kid coming back later meets the gate again). */
export function clearGrownUpPass(): void {
  pass = null;
}

/** The signed-in player's VIP state (AuthProvider keeps it current). Members open their perks with no gate. */
export function setGateVipMember(member: boolean): void {
  vipMember = member;
}

/** Tests only. */
export function resetGrownUpGateForTests(): void {
  gateRestUntil = 0;
  open = null;
  pass = null;
  vipMember = false;
}

/**
 * The one way into the VIP paywall. Whether it is gated depends on the player,
 * never on which button was tapped: a VIP member is only opening their perks;
 * everyone else meets the grown-up gate. `devPreview` is the dev-only QA jump.
 */
const VIP_DOOR: GateReason = { kind: 'vip' };

/**
 * The VIP door says the real App Store prices when they come back within a
 * moment ("One week free. Then $39.99 a year or $4.99 a month."), so a grown-up
 * never says yes to real money without a number. Otherwise the plain door line.
 */
/**
 * Each plan with its own free trial, so a free week never sounds like it covers
 * every plan: "$39.99 a year, with one week free first. Or $4.99 a month."
 */
export function vipPriceLine(plans: readonly { price: string; trial: string | null }[]): string {
  const parts = plans.map(plan => (plan.trial ? `${plan.price}, with ${plan.trial.toLowerCase()} first` : plan.price));
  return parts.map((part, i) => (i === 0 ? part : `Or ${part}`)).join('. ') + '.';
}

async function vipDoorReason(): Promise<GateReason> {
  if (!showGate) return VIP_DOOR;
  try {
    // Loaded here, not at the top: the gate stays light for every other door and for tests.
    const store = require('../services/purchases') as typeof import('../services/purchases');
    if (!store.storeAvailable()) return VIP_DOOR;
    // Warm plans answer at once; a cold load gets a moment, and its timer is always cleared.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const plans = store.cachedVipPlans() ?? await Promise.race([
      store.warmVipPlans(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1200); }),
    ]).finally(() => clearTimeout(timer));
    if (!plans?.length) return VIP_DOOR;
    return { kind: 'vip', prices: vipPriceLine(plans.map(plan => ({ price: store.priceText(plan), trial: plan.trial }))) };
  } catch {
    return VIP_DOOR;
  }
}

let doorInFlight: Promise<boolean> | null = null;

/** Two quick taps share one door: one gate, one paywall. */
export function openMembership(options: { devPreview?: boolean } = {}): Promise<boolean> {
  doorInFlight ??= openMembershipOnce(options).finally(() => { doorInFlight = null; });
  return doorInFlight;
}

async function openMembershipOnce(options: { devPreview?: boolean }): Promise<boolean> {
  const skip = vipMember || (options.devPreview === true && __DEV__);
  if (!skip) {
    if (!(await askGrownUp(await vipDoorReason()))) return false;
    // The pass covers this flow's next step only: the paywall's Buy.
    pass = { flow: 'vip', until: Date.now() + GATE_PASS_MS };
  }
  RootNavigation.navigate('Membership');
  return true;
}

/**
 * A screen named by the server (a push tap, an inbox row). The paywall goes
 * through openMembership like every other door; anything else navigates.
 */
export function openServerRoute(screen: string, params?: object): void {
  if (screen === 'Membership') { void openMembership(); return; }
  RootNavigation.navigate(screen, params ?? {});
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;
const MAX_FONT = 1.3;

/** The gate's dialog. Mounted once, at the root. */
export function GrownUpGateHost() {
  const [req, setReq] = useState<GateRequest | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    showGate = r => { setTyped(''); setReq(r); };
    return () => { showGate = null; };
  }, []);
  if (!req) return null;
  const resting = req.seed < 0;
  const q = resting ? null : grownUpQuestion(req.seed);
  const why = resting ? null : gateReasonLines(req.reason);
  const close = (ok: boolean) => { req.resolve(ok); setReq(null); };
  const press = (k: typeof KEYS[number]) => {
    if (k === 'del') { setTyped(t => t.slice(0, -1)); return; }
    if (k === 'ok') { close(judgeGate(typed, req.seed)); return; }
    setTyped(t => (t.length < 3 ? t + k : t));
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={[styles.card, resting && styles.cardRest]} accessibilityViewIsModal>
          {/* The lock means "grown-ups only". The VIP badge means VIP and nothing else. */}
          <GameIcon name={resting ? 'moon' : 'lock'} size={resting ? 56 : 40} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title}>{resting ? 'Not quite' : 'Ask a grown-up'}</Text>
          {resting ? (
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.body}>That wasn't right. A grown-up can try again in 30 seconds.</Text>
          ) : (
            <>
              {why && (
                // What the yes is for, before the sum: real money, or leaving the game.
                <View style={styles.why} accessible accessibilityLabel={why.line ? `${why.head} ${why.line}` : why.head}>
                  {why.icon === 'money' ? <RealMoneyMark size={28} /> : <GameIcon name={why.icon} size={26} />}
                  <View style={{ flexShrink: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.whyHead}>{why.head}</Text>
                    {why.line && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.whyLine}>{why.line}</Text>}
                  </View>
                </View>
              )}
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.body} accessibilityLabel={`Grown-ups: what is ${q!.a} times ${q!.b}?`}>
                Grown-ups: what is {q!.a} × {q!.b}?
              </Text>
              <View style={styles.answer} accessible accessibilityLabel={typed ? `Answer ${typed}` : 'No answer yet'}>
                <Text style={styles.answerText}>{typed || ' '}</Text>
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
            <Pressable onPress={() => close(false)} style={({ pressed }) => [styles.key, styles.keyOk, styles.restOk, pressed && { opacity: 0.7 }]}
              accessibilityRole="button" accessibilityLabel="OK">
              <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.keyText, styles.keyOkText]}>OK</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => close(false)} style={styles.cancel} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.cancelText}>Not now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Midnight panel, gold keys: every ink is AA on its surface. */
export const GATE_COLORS = {
  panel: '#2a1d6e', card: '#3a2a8a', well: '#20165a', ink: '#ffffff', inkSoft: '#e8defd',
  border: '#d9c6ff', gold: '#ffd34d', violet: '#8f6bff',
} as const;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(10,6,40,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 10, padding: 18, borderRadius: 24, backgroundColor: GATE_COLORS.panel,
    borderWidth: 3, borderColor: GATE_COLORS.border },
  cardRest: { maxWidth: 270, paddingVertical: 16, gap: 8 },
  title: { fontFamily: FONT.display, fontSize: 24, color: GATE_COLORS.ink },
  body: { fontFamily: FONT.body, fontSize: 18, color: GATE_COLORS.inkSoft, textAlign: 'center' },
  why: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, backgroundColor: GATE_COLORS.well, borderWidth: 2, borderColor: GATE_COLORS.gold },
  whyHead: { fontFamily: FONT.display, fontSize: 17, color: GATE_COLORS.gold },
  whyLine: { fontFamily: FONT.body, fontSize: 16, color: GATE_COLORS.ink },
  answer: { minWidth: 120, minHeight: 48, borderRadius: 14, backgroundColor: GATE_COLORS.well, borderWidth: 2, borderColor: GATE_COLORS.violet,
    alignItems: 'center', justifyContent: 'center' },
  answerText: { fontFamily: FONT.display, fontSize: 28, color: '#ffffff' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: 3 * 72 + 2 * 8 },
  key: { width: 72, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: GATE_COLORS.card,
    borderWidth: 2, borderColor: GATE_COLORS.border },
  restOk: { width: 160, marginTop: 4 },
  keyOk: { backgroundColor: GATE_COLORS.gold, borderColor: BRAND.goldLip },
  keyText: { fontFamily: FONT.display, fontSize: 24, color: '#ffffff' },
  keyOkText: { fontSize: 20, color: BRAND.navy },
  keyDelText: { fontFamily: undefined, fontSize: 26 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  cancelText: { fontFamily: FONT.display, fontSize: 17, color: GATE_COLORS.inkSoft },
});
