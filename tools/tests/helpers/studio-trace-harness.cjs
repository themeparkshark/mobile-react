'use strict';
/**
 * The real studio engine (playMoment -> GameAudio -> MusicDirector) on the
 * silent TraceBackend, on a virtual clock, in node (wow-sound lane, Oct 24 2026).
 * Nothing here can make a sound: there is no audio module at all, only the
 * trace. Used by tools/tests/wow-sound-trace.test.cjs and
 * tools/audio/trace-catch-session.cjs (the 50-catch log for the lane report).
 */
const path = require('node:path');
const { loadTs } = require('./ts-module.cjs');

function virtualClock(start) {
  let now = start;
  let seq = 1;
  const q = [];
  const setT = (fn, ms = 0, ...args) => { const t = { id: seq++, at: now + Math.max(0, Number(ms) || 0), fn: () => fn(...args) }; q.push(t); return t.id; };
  const clearT = (id) => { const k = q.findIndex((t) => t.id === id); if (k >= 0) q.splice(k, 1); };
  const intervals = new Map();
  const setI = (fn, ms) => {
    const id = seq++;
    const arm = () => { intervals.set(id, setT(() => { if (!intervals.has(id)) return; arm(); fn(); }, ms)); };
    arm();
    return id;
  };
  const clearI = (id) => { const t = intervals.get(id); intervals.delete(id); if (t) clearT(t); };
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }
  return {
    get now() { return now; },
    /** The next timer's time (or Infinity). */
    nextAt() { return q.reduce((m, t) => Math.min(m, t.at), Infinity); },
    Date: FakeDate, setTimeout: setT, clearTimeout: clearT, setInterval: setI, clearInterval: clearI,
    /** Run every timer due in the next `ms`, in time order. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = q[0];
        if (!t || t.at > end) break;
        q.shift();
        now = t.at;
        t.fn();
      }
      now = end;
    },
  };
}

/**
 * Load the engine in trace mode. `start` is the virtual wall clock (ms).
 * Returns the modules plus the trace and haptic logs.
 */
function traceEngine({ start = Date.UTC(2026, 9, 24, 17, 0, 0), hybrid = true, trace = true, dev = true } = {}) {
  const clock = virtualClock(start);
  const ids = new Map();
  const exts = new Map();
  const __assetId = (file) => {
    if (!ids.has(file)) { ids.set(file, ids.size + 1); exts.set(ids.size, path.extname(file).slice(1).toLowerCase()); }
    return ids.get(file);
  };
  const quiet = { log: () => undefined, warn: () => undefined, error: console.error, info: () => undefined };
  const haptics = [];
  const audio = { touched: 0 };
  const storage = new Map();
  const stubs = {
    react: { useEffect: () => undefined, useRef: (v) => ({ current: v }), useState: (v) => [v, () => undefined] },
    // Any attempt to open a real player fails the test (audio.touched counts it).
    'expo-av': { Audio: { Sound: class { constructor() { audio.touched++; } static async createAsync() { audio.touched++; throw new Error('no audio in tests'); } },
      setAudioModeAsync: async () => { audio.touched++; } }, InterruptionModeIOS: {}, InterruptionModeAndroid: {} },
    'expo-asset': { Asset: { fromModule: (src) => ({ type: exts.get(src) ?? 'wav' }) } },
    'expo-haptics': new Proxy({}, { get: (_t, k) => (typeof k === 'string' && /Async$/.test(k) ? async () => undefined : {}) }),
    'react-native': {
      AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
      Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      NativeModules: {},
    },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); }, removeItem: async (k) => { storage.delete(k); },
    } },
    'react-native-audio-api': hybrid ? { AudioContext: function AudioContext() { audio.touched++; throw new Error('never constructed in trace mode'); } } : null,
  };
  const globals = {
    __DEV__: dev,
    process: { env: { EXPO_PUBLIC_STUDIO_TRACE: trace ? '1' : undefined, EXPO_PUBLIC_STUDIO_MUTE: '1' } },
    Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    console: quiet, __assetId,
    createAudioContext: hybrid ? () => { audio.touched++; throw new Error('never constructed in trace mode'); } : undefined,
  };
  // One realm for everything so GameAudio, playMoment and catchAudio share their singletons.
  const realm = loadTs('tools/tests/helpers/studio-trace-entry.ts', stubs, globals);
  realm.Haptics.setHapticTraceListener((intent) => { haptics.push({ t: clock.now, intent }); realm.Trace.traceEvent('haptic', intent); });
  // As SoundEffectProvider does once the player's settings load (the engine starts muted until then).
  realm.GameAudio.setSfxEnabled(true);
  realm.GameAudio.setMusicEnabled(true);
  return { clock, haptics, audio, ...realm };
}

module.exports = { traceEngine, virtualClock };
