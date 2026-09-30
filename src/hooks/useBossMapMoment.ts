import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { playSfx } from '../gamekit/SFX';
import { haptic } from '../gamekit/Haptics';
import useReducedGameMotion from './useReducedGameMotion';
import type { BossRaid } from '../api/endpoints/parks/raid';
import type { RideControlPark } from '../api/endpoints/parks/rideControl';
import { createBossMapImpact, verifiedBossFlag, type BossMapImpact } from '../services/boss/mapImpact';

export interface BossMapMoment {
  readonly impact: BossMapImpact;
  readonly phase: 'queued' | 'exit' | 'flag' | 'settled';
}

/** Starts after the actual boss presentations hide, then keeps a readable receipt until dismissed. */
export default function useBossMapMoment({ playerId, parkId, available: screenAvailable, control, refreshControl }: {
  playerId: number | null;
  parkId: number | null;
  available: boolean;
  control: RideControlPark | null;
  refreshControl: () => Promise<RideControlPark | null>;
}) {
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const available = screenAvailable && foreground;
  const reduced = useReducedGameMotion();
  const finished = useRef(new Set<string>());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const scope = `${playerId}:${parkId}`;
  const current = useRef(scope), mounted = useRef(false), generation = useRef(0), requested = useRef(new Set<string>());
  const [moment, setMoment] = useState<BossMapMoment | null>(null);
  const latest = useRef({ scope, available, control, refreshControl, moment });
  current.current = scope;
  latest.current = { scope, available, control, refreshControl, moment };
  const ownMoment = moment?.impact.playerId === playerId && moment.impact.parkId === parkId ? moment : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => { generation.current += 1; setMoment(null); }, [scope]);
  const markSeen = (impact: BossMapImpact) => { void AsyncStorage.setItem(impact.key, '1').catch(() => undefined); };

  const enqueue = async (raid: BossRaid) => {
    if (!playerId || !parkId || !mounted.current || current.current !== scope) return;
    const impact = createBossMapImpact(playerId, parkId, raid);
    if (!impact || requested.current.has(impact.key)) return;
    requested.current.add(impact.key);
    const request = ++generation.current;
    try {
      const seen = await AsyncStorage.getItem(impact.key);
      if (seen || !mounted.current || current.current !== scope || request !== generation.current) return;
      await latest.current.refreshControl();
      if (!mounted.current || current.current !== scope || request !== generation.current) return;
      setMoment({ impact, phase: 'queued' });
    } catch {
      // A failed seen-state read should not repeatedly restart a signature moment.
      requested.current.delete(impact.key);
    }
  };

  useEffect(() => {
    if (!ownMoment) return;
    if (!available) {
      if (ownMoment.phase === 'exit' || ownMoment.phase === 'flag') {
        markSeen(ownMoment.impact);
        setMoment({ ...ownMoment, phase: 'settled' }); // Leaving skips decorative replay; the receipt survives.
      }
      return;
    }
    if (ownMoment.phase === 'queued') {
      // The map's 450ms focus move settles before the character performs its exit.
      const timer = setTimeout(() => {
        if (!mounted.current || current.current !== scope || !latest.current.available || latest.current.moment?.impact.key !== ownMoment.impact.key) return;
        setMoment({ ...ownMoment, phase: 'exit' });
      }, 500);
      return () => clearTimeout(timer);
    }
    if (ownMoment.phase !== 'flag') return;
    const key = ownMoment.impact.key;
    const timer = setTimeout(() => {
      if (!mounted.current || current.current !== scope || latest.current.moment?.impact.key !== key) return;
      markSeen(ownMoment.impact);
      setMoment({ ...ownMoment, phase: 'settled' });
    }, 700);
    return () => clearTimeout(timer);
  }, [ownMoment?.impact.key, ownMoment?.phase, available, scope]);

  return {
    moment: available ? ownMoment : null,
    flag: ownMoment ? verifiedBossFlag(ownMoment.impact, control) : null,
    enqueue,
    finishExit: (key: string) => {
      const active = latest.current.moment;
      if (!mounted.current || current.current !== scope || !latest.current.available ||
        active?.impact.key !== key || active.phase !== 'exit' || finished.current.has(key)) return;
      finished.current.add(key);
      playSfx('star', 0.55);
      if (!reduced) haptic('success');
      setMoment({ ...active, phase: 'flag' });
    },
    dismiss: () => {
      if (!ownMoment || current.current !== scope) return;
      generation.current += 1;
      markSeen(ownMoment.impact);
      setMoment(null);
    },
  };
}
