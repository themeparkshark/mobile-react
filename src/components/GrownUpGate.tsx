import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameIconName } from '../ui/iconNames';
import RealMoneyMark from './RealMoneyMark';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { BRAND, FONT, GameIcon } from '../ui';
import { useModalLayer } from '../ui/modalLayers';

/**
 * The grown-up gate in front of every paywall and real-money purchase
 * (Apple Kids category, guideline 1.3; Secret Shop kids UX rounds 1-5).
 *
 * - Two steps for the grown-up: read a sum written out in words ("forty-seven
 *   times six"), then work out a two-digit times a one-digit sum (23..89 times
 *   6..9, no round tens), typed on a number pad. No digits to copy, no choices to
 *   guess from: an adult reads and answers at once, a 9 or 10 year old can't.
 * - The child never sees the offer: before the answer the gate only says "this
 *   costs real money". The price, what it gets, any free trial and, for a plan
 *   that renews, the renewal and cancel terms (App Store 3.1.2) are shown on a
 *   second card only after the grown-up answers, with Continue and Not now.
 * - A pass covers only the door it was asked for, plus the next step of that
 *   same flow (the paywall's entry, then its Buy), once, within 2 minutes.
 *   Every other door asks again, and a wrong answer cancels any pass.
 * - A wrong answer closes kindly and the gate rests for 30 seconds, then 2 and 10 minutes
 *   after repeated misses (a moon,
 *   "Resting", one line, OK). The rest survives a force-quit. Nothing scolds.
 * - Mounted once at the root (GrownUpGateHost in Root.tsx). With no host,
 *   askGrownUp() answers false: a door never opens ungated.
 *
 * Every way into the VIP paywall goes through openMembership(), and every way
 * out of the app through services/external; source tests fail the build on a
 * bare navigate('Membership'), openURL, openBrowserAsync or share call.
 */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** 0..99 in words: "forty-seven". Exported for tests. */
export function numberWords(n: number): string {
  if (n < 10) return ONES[n];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  if (n < 20) return teens[n - 10];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

export function grownUpQuestion(seed: number): { a: number; b: number; answer: number; words: string } {
  const s = Math.abs(Math.floor(seed));
  const a = (2 + (s % 7)) * 10 + (3 + (Math.floor(s / 7) % 7));
  const b = 6 + (Math.floor(s / 49) % 4);
  return { a, b, answer: a * b, words: `${numberWords(a)} times ${numberWords(b)}` };
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
  /** A plan that renews by itself (VIP). `period` is "month", "year" or "3 months". */
  | { readonly kind: 'renews'; readonly what: string; readonly price: string; readonly period: string; readonly trial: string | null }
  | { readonly kind: 'vip'; readonly prices?: string }
  | { readonly kind: 'leave'; readonly where: string }
  | { readonly kind: 'share' };

/**
 * What the gate says BEFORE the grown-up answers: only that it is real money or leaves
 * the game. No price, no free trial, nothing to tempt a child. Exported for tests.
 */
export function gateReasonLines(reason: GateReason | null | undefined): { head: string; line: string | null; icon: GameIconName | 'money' } | null {
  if (!reason) return null;
  switch (reason.kind) {
    case 'money':
    case 'renews': return { head: 'This costs real money.', line: 'A grown-up sees the details next.', icon: 'money' };
    case 'vip': return { head: 'VIP costs real money.', line: 'A grown-up sees the details next.', icon: 'money' };
    case 'leave': return { head: 'This leaves the game.', line: `It opens ${reason.where}.`, icon: 'arrow' };
    case 'share': return { head: 'This shares outside the game.', line: 'It sends this to another app.', icon: 'arrow' };
  }
}

/** "a month", "a year" or "every 3 months". */
function perPeriod(period: string): string {
  return /\s/.test(period) ? `every ${period}` : `a ${period}`;
}

/**
 * The offer card the grown-up sees AFTER answering: the price, what it gets, any free
 * trial, and for a plan that renews the App Store 3.1.2 terms. Null: no second card.
 * Exported for tests.
 */
export function gateDetails(reason: GateReason | null | undefined): { head: string; lines: string[] } | null {
  if (!reason) return null;
  switch (reason.kind) {
    case 'money': return { head: `${reason.price}`, lines: [`For ${reason.gets}.`, 'Paid with the Apple ID on this device.'] };
    case 'renews': return {
      head: reason.trial ? `${reason.trial}, then ${reason.price} ${perPeriod(reason.period)}` : `${reason.price} ${perPeriod(reason.period)}`,
      lines: [
        `For ${reason.what}.`,
        reason.trial
          ? `After the free time it renews by itself at ${reason.price} ${perPeriod(reason.period)} until you cancel.`
          : `It renews by itself at ${reason.price} ${perPeriod(reason.period)} until you cancel.`,
        'Cancel anytime: Settings, your name, Subscriptions.',
        'Cancel at least 24 hours before it renews.',
        'Paid with the Apple ID on this device.',
      ],
    };
    case 'vip': return reason.prices ? { head: reason.prices, lines: ['For bigger rewards every day and no ads.', 'Plans that renew do so by themselves until you cancel.', 'Paid with the Apple ID on this device.'] } : null;
    default: return null;
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

/** Misses in a row (within 10 minutes) make the rest longer: 30 s, then 2 min, then 10 min. */
let misses: { count: number; last: number } = { count: 0, last: 0 };
export function restMsFor(missCount: number): number {
  return missCount <= 1 ? GATE_REST_MS : missCount === 2 ? 120_000 : 600_000;
}
/** "30 seconds", "2 minutes", "10 minutes": the rest the gate just started. */
let lastRestText = '30 seconds';
function restText(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)} seconds` : `${Math.round(ms / 60_000)} minutes`;
}

/** Judges a typed answer; a wrong one rests the gate (longer after repeated misses). Exported for tests. */
export function judgeGate(typed: string, seed: number, now = Date.now()): boolean {
  const ok = seed >= 0 && typed !== '' && Number(typed) === grownUpQuestion(seed).answer;
  if (ok) misses = { count: 0, last: 0 };
  if (!ok) {
    pass = null; // a wrong answer cancels any pass
    misses = { count: now - misses.last < 600_000 ? misses.count + 1 : 1, last: now };
    const rest = restMsFor(misses.count);
    lastRestText = restText(rest);
    gateRestUntil = now + rest;
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
  misses = { count: 0, last: 0 };
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

export async function vipDoorReason(): Promise<GateReason> {
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

async function openMembershipOnce(_options: { devPreview?: boolean }): Promise<boolean> {
  // Pitch first (Oct 8 2026, money stream): anyone may SEE what VIP gives and costs. The grown-up
  // gate sits on the paywall's Buy, the one real-money step (grownUpForNextStep in MembershipScreen),
  // and restates the plan and price there. Members land on their perks page.
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
  // After a right answer: the offer card (price, trial, renewal terms) for the grown-up only.
  const [details, setDetails] = useState<{ head: string; lines: string[] } | null>(null);
  useEffect(() => {
    showGate = r => { setTyped(''); setDetails(null); setReq(r); };
    return () => { showGate = null; };
  }, []);
  // Waits behind any open sheet instead of stacking a second <Modal> (ui/modalLayers.ts).
  const front = useModalLayer(!!req, 'wait');
  if (!req || !front) return null;
  const resting = req.seed < 0;
  const q = resting ? null : grownUpQuestion(req.seed);
  const why = resting ? null : gateReasonLines(req.reason);
  const close = (ok: boolean) => { req.resolve(ok); setReq(null); setDetails(null); };
  const press = (k: typeof KEYS[number]) => {
    if (k === 'del') { setTyped(t => t.slice(0, -1)); return; }
    if (k === 'ok') {
      const ok = judgeGate(typed, req.seed);
      const offer = ok ? gateDetails(req.reason) : null;
      if (offer) setDetails(offer); else close(ok);
      return;
    }
    setTyped(t => (t.length < 3 ? t + k : t));
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={styles.scrim}>
        {details ? (
          <View style={styles.card} accessibilityViewIsModal>
            <RealMoneyMark size={36} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title}>For grown-ups</Text>
            <View style={styles.offer} accessible accessibilityLabel={[details.head, ...details.lines].join(' ')}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.offerHead}>{details.head}</Text>
              {details.lines.map(line => <Text key={line} maxFontSizeMultiplier={MAX_FONT} style={styles.offerLine}>{line}</Text>)}
            </View>
            <Pressable onPress={() => close(true)} style={({ pressed }) => [styles.key, styles.keyOk, styles.restOk, pressed && { opacity: 0.7 }]}
              accessibilityRole="button" accessibilityLabel="Continue to buy in the App Store">
              <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.keyText, styles.keyOkText]}>Continue to buy</Text>
            </Pressable>
            <Pressable onPress={() => close(false)} style={styles.cancel} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.cancelText}>Not now</Text>
            </Pressable>
          </View>
        ) : (
        <View style={[styles.card, resting && styles.cardRest]} accessibilityViewIsModal>
          {/* The lock means "grown-ups only". The VIP badge means VIP and nothing else. */}
          <GameIcon name={resting ? 'moon' : 'lock'} size={resting ? 56 : 40} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title}>{resting ? 'Not quite' : 'Ask a grown-up'}</Text>
          {resting ? (
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.body}>{`A grown-up can try again in ${lastRestText}. No worries!`}</Text>
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
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.body}>Hand the phone to a grown-up.</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.body} accessibilityLabel={`Grown-up question: type the answer to ${q!.words}.`}>
                Grown-up question:{'\n'}<Text style={styles.words}>{q!.words}</Text>
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
        )}
      </View>
    </Modal>
  );
}

/** House navy panel, white rim, gold OK key (blue/white/gold palette): every ink is AA on its surface. */
export const GATE_COLORS = {
  panel: '#0b3a75', card: '#1a5c9e', well: '#082d5c', ink: '#ffffff', inkSoft: '#e2f6ff',
  border: '#ffffff', gold: '#ffd34d', sky: '#7cc6f5',
} as const;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(5,30,70,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 10, padding: 18, borderRadius: 24, backgroundColor: GATE_COLORS.panel,
    borderWidth: 3, borderColor: GATE_COLORS.border },
  cardRest: { maxWidth: 270, paddingVertical: 16, gap: 8 },
  title: { fontFamily: FONT.display, fontSize: 24, color: GATE_COLORS.ink },
  body: { fontFamily: FONT.body, fontSize: 18, color: GATE_COLORS.inkSoft, textAlign: 'center' },
  why: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, backgroundColor: GATE_COLORS.well, borderWidth: 2, borderColor: GATE_COLORS.gold },
  whyHead: { fontFamily: FONT.display, fontSize: 17, color: GATE_COLORS.gold },
  whyLine: { fontFamily: FONT.body, fontSize: 16, color: GATE_COLORS.ink },
  words: { fontFamily: FONT.display, fontSize: 21, color: GATE_COLORS.gold },
  offer: { alignSelf: 'stretch', gap: 6, padding: 12, borderRadius: 14, backgroundColor: GATE_COLORS.well, borderWidth: 2, borderColor: GATE_COLORS.gold },
  offerHead: { fontFamily: FONT.display, fontSize: 20, color: GATE_COLORS.gold, textAlign: 'center' },
  offerLine: { fontFamily: FONT.body, fontSize: 16, color: GATE_COLORS.ink, textAlign: 'center' },
  answer: { minWidth: 120, minHeight: 48, borderRadius: 14, backgroundColor: GATE_COLORS.well, borderWidth: 2, borderColor: GATE_COLORS.sky,
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
