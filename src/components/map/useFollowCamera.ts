import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { createHeadingFilter, angleDelta } from './headingFilter';
import { CAM_MODE_SPIN_MS, CAM_RECENTER_MS, CAM_TICK_MS, camChanged, chaseActive, chaseAdvance, chaseFix, chaseHeading, chasePeek, chaseWalk, newChaser,
  targetBearing, segmentGap, segmentMs, walkGlideMs, WalkPace, type Chaser, type CamStop, type FollowMode } from './cameraFollow';
import { GLIDE_MAX_M, GLIDE_MIN_M, glideMeters, type GlidePoint } from './glide';
import { probeCount } from '../../dev/motionProbe';

const LINEAR = Easing.linear;
const SPIN = Easing.bezier(0.33, 0, 0.2, 1);

/**
 * Drives the follow camera (cameraFollow.ts explains the why): one short
 * linear camera move about ten times a second while the shark glides or the
 * compass turns, nothing at all when both are still. No React state: compass
 * readings and the loop never render anything.
 *
 * Also keeps two UI-thread values in step with the camera, for the compass
 * button and the shark's heading beam:
 *  - `bearing`: the map's bearing (unwrapped degrees, so a turn through north
 *    never spins the needle the long way), eased exactly like the camera;
 *  - `facing`: which way the phone points relative to the map (0 is straight
 *    up the screen; it moves only in north-up mode or while panned away).
 */
export function useFollowCamera({ cameraRef, followRef, reducedMotion }: {
  readonly cameraRef: RefObject<CameraRef>;
  /** True while the camera follows the shark (a finger on the map turns it off). */
  readonly followRef: MutableRefObject<boolean>;
  readonly reducedMotion: boolean;
}) {
  const filter = useRef(createHeadingFilter()).current;
  const pace = useRef(new WalkPace()).current;
  const chaser = useRef<Chaser | null>(null);
  const prevFix = useRef<{ p: GlidePoint; t: number } | null>(null);
  const last = useRef<CamStop | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quiet = useRef(0);
  // How late ticks really run (a busy JS thread): each segment lasts long enough to reach the next tick.
  const lastTick = useRef(0);
  const gapEst = useRef(CAM_TICK_MS);
  const holdUntil = useRef(0);
  const mode = useRef<FollowMode>('heading');
  const running = useRef(true);
  /** Unwrapped bearing last sent, and the map's real bearing while panned away. */
  const bearingU = useRef(0);
  const facingU = useRef(0);
  const turnSent = useRef(0);
  const freeBearing = useRef(0);
  const bearing = useSharedValue(0);
  const facing = useSharedValue(0);
  const headingKnown = useSharedValue(0);
  /** How fast the phone is turning (degrees a second, signed, eased): the shark leans into a turn. */
  const turn = useSharedValue(0);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const unwrapTo = (ref: MutableRefObject<number>, deg: number) => {
    ref.current += angleDelta(((ref.current % 360) + 360) % 360, deg);
    return ref.current;
  };
  const animateBearing = (deg: number, ms: number, easing: typeof LINEAR | typeof SPIN = LINEAR) => {
    const u = unwrapTo(bearingU, deg);
    bearing.value = ms > 0 && !reducedRef.current ? withTiming(u, { duration: ms, easing }) : u;
  };
  const animateFacing = (deg: number, ms: number) => {
    const u = unwrapTo(facingU, deg);
    facing.value = ms > 0 && !reducedRef.current ? withTiming(u, { duration: ms, easing: LINEAR }) : u;
  };
  const position = (tMs: number) => (chaser.current ? chasePeek(chaser.current, tMs) : null);

  const tick = () => {
    timer.current = null;
    if (!running.current) return;
    const now = Date.now();
    // An eased move (a mode spin, a recenter) owns the camera; the pause is not a slow tick.
    if (now < holdUntil.current) { lastTick.current = 0; schedule(holdUntil.current - now); return; }
    if (lastTick.current && now - lastTick.current < 1000) gapEst.current = segmentGap(gapEst.current, now - lastTick.current);
    lastTick.current = now;
    const seg = segmentMs(gapEst.current);
    const h = filter.tick(now);
    const following = followRef.current;
    const target = targetBearing(mode.current, h, filter.speed(), seg);
    if (following) {
      const pos = position(now + seg);
      if (pos) {
        const stop: CamStop = { bearing: target, latitude: pos.latitude, longitude: pos.longitude };
        if (camChanged(last.current, stop)) {
          if (__DEV__) probeCount('camCmd');
          cameraRef.current?.setCamera({
            centerCoordinate: [pos.longitude, pos.latitude],
            ...(target !== null ? { heading: target } : {}),
            animationDuration: seg,
            animationMode: 'linearTo',
          });
          last.current = stop;
          quiet.current = 0;
          if (target !== null) animateBearing(target, seg);
        } else quiet.current += 1;
      }
    } else quiet.current += 1;
    const spin = Math.max(-150, Math.min(150, filter.speed()));
    if (Math.abs(spin - turnSent.current) > 4) { turnSent.current = spin; turn.value = reducedRef.current ? 0 : withTiming(spin, { duration: 260 }); }
    // The beam: the phone's heading on the map. Straight up while the map turns with you.
    if (h !== null) {
      const mapBearing = following ? (target ?? 0) : freeBearing.current;
      animateFacing(mode.current === 'heading' && following ? 0 : angleDelta(mapBearing, h), seg);
    }
    if (chaser.current) { chaseHeading(chaser.current, h); chaseAdvance(chaser.current, now); }
    if (quiet.current < 3 || chaseActive(chaser.current, now) || !filter.settled()) schedule(CAM_TICK_MS);
  };
  const schedule = (ms: number) => {
    if (timer.current || !running.current) return;
    timer.current = setTimeout(tick, ms);
  };
  const kick = () => { quiet.current = 0; if (!timer.current) lastTick.current = 0; schedule(0); };

  /** One compass reading. */
  const onHeading = useCallback((deg: number, atMs: number) => {
    if (filter.value() === null) headingKnown.value = withTiming(1, { duration: 300 });
    filter.push(deg, atMs);
    kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** A new filtered fix: the shark's next path. Returns its length in ms (0 for a jump), for the wake and stride. */
  const onFix = useCallback((loc: GlidePoint): number => {
    const now = Date.now();
    const prev = prevFix.current;
    const meters = prev ? glideMeters(prev.p, loc) : 0;
    const walk = pace.push(loc, now);
    const jump = !prev || reducedRef.current || meters < GLIDE_MIN_M || meters > GLIDE_MAX_M;
    if (meters > GLIDE_MAX_M) pace.reset();
    const ms = jump ? 0 : walkGlideMs(meters, walk);
    if (!chaser.current) chaser.current = newChaser(loc, now);
    else chaseFix(chaser.current, loc, now, pace.velocity(), pace.gap(), jump);
    prevFix.current = { p: loc, t: now };
    if (!prev) {
      // First fix: put the camera there at once.
      if (followRef.current) cameraRef.current?.setCamera({ centerCoordinate: [loc.longitude, loc.latitude], animationDuration: 0, animationMode: 'moveTo' });
      last.current = null;
    } else if (ms === 0 && followRef.current && meters > GLIDE_MAX_M) {
      // A re-seat (out of the car, back from the background): jump, never fly across the map.
      cameraRef.current?.setCamera({ centerCoordinate: [loc.longitude, loc.latitude], animationDuration: 0, animationMode: 'moveTo' });
    }
    kick();
    return ms;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Back to following: one eased move to the shark (keeping or setting the zoom), then the loop takes over. */
  const recenter = useCallback((zoomLevel?: number) => {
    const now = Date.now();
    const ms = reducedRef.current ? 0 : CAM_RECENTER_MS;
    const pos = position(now + ms);
    if (!pos) return;
    const target = targetBearing(mode.current, filter.value(), 0);
    cameraRef.current?.setCamera({ centerCoordinate: [pos.longitude, pos.latitude],
      ...(target !== null ? { heading: target } : {}), ...(zoomLevel !== undefined ? { zoomLevel } : {}),
      animationDuration: ms, animationMode: ms > 0 ? 'easeTo' : 'moveTo' });
    if (target !== null) animateBearing(target, ms, SPIN);
    last.current = null;
    holdUntil.current = now + ms;
    kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Heading-up or north-up: the map spins to its new up in one eased turn. */
  const setMode = useCallback((next: FollowMode) => {
    mode.current = next;
    const now = Date.now();
    const ms = reducedRef.current ? 0 : CAM_MODE_SPIN_MS;
    const target = targetBearing(next, filter.value(), 0);
    if (followRef.current && target !== null) {
      const pos = position(now + ms);
      cameraRef.current?.setCamera({ ...(pos ? { centerCoordinate: [pos.longitude, pos.latitude] } : {}), heading: target,
        animationDuration: ms, animationMode: ms > 0 ? 'easeTo' : 'moveTo' });
      animateBearing(target, ms, SPIN);
      last.current = null;
      holdUntil.current = now + ms;
    }
    kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The step sensor (useWalkSense): setting off starts the shark swimming at once; stopping settles it. */
  const onWalk = useCallback((walking: boolean) => {
    if (!chaser.current) return;
    chaseWalk(chaser.current, walking, Date.now(), filter.value());
    kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Panned away: the map's real bearing (from the map's own camera events). */
  const noteFreeBearing = useCallback((deg: number) => {
    if (!Number.isFinite(deg) || followRef.current) return;
    freeBearing.current = deg;
    animateBearing(deg, 0);
    kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Off screen or backgrounded: the loop stops (it restarts on the next reading or fix). */
  const setRunning = useCallback((on: boolean) => {
    running.current = on;
    if (!on && timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (on) kick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { running.current = false; if (timer.current) clearTimeout(timer.current); }, []);

  /** The map finished drawing (a camera move sent before that may have been dropped): send the next one fresh. */
  // Never shortens an eased move in progress (MapLibre reports "finished rendering" after every tile load).
  const resync = useCallback(() => { last.current = null; kick(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const where = useCallback(() => position(Date.now()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const modeNow = useCallback(() => mode.current, []);

  return { onHeading, onFix, onWalk, recenter, setMode, noteFreeBearing, setRunning, resync, where, modeNow, bearing, facing, headingKnown, turn };
}
