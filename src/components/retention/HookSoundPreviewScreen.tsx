import * as FileSystem from 'expo-file-system';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthContext, type AuthContextType } from '../../context/AuthProvider';
import { setHapticTraceListener } from '../../gamekit/Haptics';
import { flameDay, playDaily3, preloadLoopMoments } from '../../gamekit/audio/loopSound';
import { CAPTURE_LINES, captureLine } from '../../gamekit/audio/studioTrace';
import { setBatterySaver } from '../../power/batterySaver';
import type { PaidRewards } from '../../api/endpoints/retention';
import type { DailyGiftType } from '../../models/daily-gift-type';
import type { PlayerType } from '../../models/player-type';
import { BRAND } from '../../ui';
import DailyGiftModal from '../DailyGiftModal';
import Daily3MapButton from './Daily3MapButton';
import RewardReveal from './RewardReveal';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');

/**
 * Release-like hook capture (wow-sound wave 5 round 2; EXPO_PUBLIC_MOTION_CAPTURE=HookSoundPreview with `expo start
 * --no-dev`, set only by the lane tooling, never in a store or OTA bundle). On a muted simulator it plays the daily
 * loop's hooks on their real components, one after another, through the same calls the map makes: three Daily 3
 * check-offs on the map button (the third finishes the set on streak day 6), a level chest, then the daily chest
 * (a local claim, no server), then all of it again on Battery Saver. Every sound start, every buzz that fires and
 * every key frame (a pip's pop, a lid's peak) is written with its time to Documents/hook-trace.log. Nothing here can
 * make a sound: the studio mute pins the master gain to 0.
 */
const PASS_MS = 29_000;
const STREAK: { days: number; counted_today: boolean } = { days: 5, counted_today: false };
const LEVEL_REWARDS: PaidRewards = { coins: 40, tickets: 1 };
const GIFT: DailyGiftType = {
  id: 1, coins: 25, redeemed_at: null, day: 3, streak: 3,
  ladder: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, coins: day * 10, energy: 0, tickets: day === 7 ? 1 : 0 })),
};
const PREVIEW_PLAYER = { username: 'HookPreview', coins: 350 } as unknown as PlayerType;

const mark = (what: string) => captureLine(`[hook] ${Date.now()} ${what}`);

export default function HookSoundPreviewScreen() {
  const auth = useContext(AuthContext);
  const [pips, setPips] = useState<boolean[]>([false, false, false]);
  const [pop, setPop] = useState<{ index: number | null; key: number }>({ index: null, key: 0 });
  const [stage, setStage] = useState<'daily3' | 'level' | 'daily' | 'done'>('daily3');
  const [pass, setPass] = useState(0);
  const [levelOpening, setLevelOpening] = useState(false);
  const [levelRewards, setLevelRewards] = useState<PaidRewards | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const authValue = useMemo<AuthContextType>(() => ({ ...auth, player: auth.player ?? PREVIEW_PLAYER,
    refreshPlayer: async () => auth.player ?? PREVIEW_PLAYER }), [auth]);

  useEffect(() => {
    setHapticTraceListener(intent => captureLine(`[haptic] ${Date.now()} fired ${intent}`));
    preloadLoopMoments();
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    // Pass 0 as players hear it, pass 1 on Battery Saver (one moment and one pulse each).
    [0, 1].forEach(n => {
      const t0 = n * PASS_MS;
      at(t0 + 100, () => {
        setBatterySaver(n === 1);
        mark(`pass ${n} saver=${n}`);
        setPass(n); setStage('daily3'); setPips([false, false, false]); setLevelOpening(false); setLevelRewards(null);
      });
      // The three check-offs, as useRetention.applyDaily plays them (the pip pops, the sound and buzz in the same turn).
      [0, 1, 2].forEach(i => at(t0 + 3000 + i * 2500, () => {
        const done = i + 1;
        mark(`daily3-check ${done} day ${flameDay(STREAK)}`);
        setPips(p => p.map((on, k) => on || k === i));
        setPop(p => ({ index: i, key: p.key + 1 }));
        playDaily3(done, flameDay(STREAK));
      }));
      // The level chest: it appears, the player taps, the server pays.
      at(t0 + 11_500, () => { mark('level-chest show'); setStage('level'); });
      at(t0 + 13_500, () => { mark('level-chest tap'); setLevelOpening(true); });
      at(t0 + 14_100, () => { mark('level-chest paid'); setLevelRewards(LEVEL_REWARDS); });
      // The daily chest opens itself 2.5 s after it appears (autoOpen), and the local claim answers in 300 ms.
      at(t0 + 19_500, () => { mark('daily-chest show'); setStage('daily'); });
      at(t0 + 28_000, () => { mark('pass-end'); setStage('done'); });
    });
    at(2 * PASS_MS + 500, () => { setBatterySaver(false); mark('end'); });
    const flush = setInterval(() => {
      void FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}hook-trace.log`, CAPTURE_LINES.join('\n')).catch(() => undefined);
    }, 2000);
    return () => { timers.current.forEach(clearTimeout); clearInterval(flush); setHapticTraceListener(null); };
  }, []);

  const claim = async (id: number): Promise<DailyGiftType> => {
    mark('daily-chest claim');
    await new Promise(r => setTimeout(r, 300));
    return { ...GIFT, id, redeemed_at: new Date().toISOString(), granted: { coins: 30, energy: 0, tickets: 0 } };
  };

  const done = pips.filter(Boolean).length;
  return (
    <View style={styles.page}>
      <Text style={styles.h}>{pass === 1 ? 'Hook sound capture: Battery Saver' : 'Hook sound capture'}</Text>
      <View style={styles.button}>
        <Daily3MapButton pips={pips} streak={STREAK.days} attention={done === 3 ? 'claim' : 'none'} onPress={() => undefined}
          popIndex={pop.index} popKey={pop.key} active reducedMotion={false} />
      </View>
      {stage === 'level' && (
        <View key={`level-${pass}`} style={StyleSheet.absoluteFill}>
          <RewardReveal reducedMotion={false} rewards={levelRewards} opening={levelOpening} dropIn
            subtitle="You reached Level 4! Tap your chest." closedArt={LEVEL_CHEST} openArt={LEVEL_CHEST_OPEN}
            onOpen={() => undefined} onDone={() => undefined} />
        </View>
      )}
      {stage === 'daily' && (
        <AuthContext.Provider key={`daily-${pass}`} value={authValue}>
          <DailyGiftModal dailyGift={GIFT} autoOpen claim={claim} />
        </AuthContext.Provider>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.blue, paddingTop: 80, alignItems: 'center' },
  h: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white },
  button: { marginTop: 160, transform: [{ scale: 2.4 }] },
});
