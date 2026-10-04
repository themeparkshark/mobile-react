/**
 * The map-anchored half of Fin-ister Nights, rendered inside the MapView:
 * the night palette (one GL fill over the tiles, above the time-of-day tint,
 * under every pin), haunt lanterns at the real entrances, scareactors at
 * the Fright Reefs, ambient props and the encounter. Anything more than one
 * screen off view is unmounted (bounds re-read every 1.5 s), and only the
 * nearest spots spend the tier's sprite budget.
 */
import { BackgroundLayer, type MapViewRef } from '@maplibre/maplibre-react-native';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { HeadingContext } from '../../../context/LocationProvider';
import { queueHaptic } from '../../../gamekit/Haptics';
import { SFX_PRIORITY } from '../../../audio/sfxLimiter';
import type { FrightAmbientAsset, FrightSpot } from '../../../api/endpoints/fright/types';
import { Marker } from '../Marker';
import { FoldBadge, Placed, usePlacement, useUnderButton } from '../declutter/Placed';
import { stepPops, POP_START, type PopState } from './critters';
import { activeShowStart, encounterChaos, hauntLayers } from './frightAssets';
import { castUrls, encounterScareactor, reefCast, scareactorAsset, watchSide } from './scareactors';
import { frightEvents, stepAmbient, type AmbientSource } from './events';
import { randAt } from './random';
import { FRIGHT_SOUNDS, playFrightSfx } from './frightAudio';
import {
  allocate, boundsCenter, cameraCenter, canvasProps, chipKeys, hauntChipLabel, hauntChipParts, onScreen, screenX, screenY, SHOW_WINDOW_MS, stableMarkerSpots, type HudRect, boundsFromVisible, critterLod, reefSlots, movingProps, nearView, rankSpots, spotProps,
  windowWant, type Bounds,
} from './frightBudget';
import { bearingDeg, distanceMeters, offsetMeters, pointsPerMeter, validPoint } from './geo';
import { ENCOUNTER_CRITTER_PT, EncounterCritter, EncounterRing, HAUNT_ANCHOR, HAUNT_BOX, PROPS_BOX, LagoonGlow, HauntLantern, ReefCritters, ReefGlyph, SpotProps } from './FrightSprites';
import { RepaintContext, repaintWidth } from './frightRepaint';
import type { FrightMapInput } from './types';
import { prefetchFrightImages } from './useFrightImage';
import { useFrightState } from './useFrightState';

/** Deep night over the tiles (night-tint.json overlay, a touch lighter so paths stay legible). */
export const NIGHT_TINT = '#1E1846';
export const NIGHT_TINT_MAX = 0.44;

function sameBounds(a: Bounds | null, b: Bounds): boolean {
  if (!a) return false;
  // Tight enough that the projected chip and on-screen checks stay within a few points.
  const tol = Math.abs(b.north - b.south) * 0.02;
  return Math.abs(a.north - b.north) < tol && Math.abs(a.south - b.south) < tol &&
    Math.abs(a.east - b.east) < tol * 1.5 && Math.abs(a.west - b.west) < tol * 1.5;
}

/** How often the view bounds are read while the mode is on (the panel's battery ask). */
/**
 * Constant native frames. On iOS every MarkerView size change re-adds the annotation (a
 * one-frame blink), and the reef and ring canvases are sized by the zoom. Each fright marker
 * child is a fixed box at the art's largest size, the canvas centred inside it.
 */
export const REEF_MAX_WANDER = 90;
export const REEF_BOX = { w: REEF_MAX_WANDER * 2 + 90, h: Math.round(REEF_MAX_WANDER * 1.4 + 120) } as const;
/** EncounterRing: max(2 x ring + 40, 140), ring capped at 120. */
export const RING_BOX = { w: 280, h: 280 } as const;
export const CRITTER_BOX = { w: ENCOUNTER_CRITTER_PT, h: ENCOUNTER_CRITTER_PT } as const;
/** LagoonGlow: up to 360 pt wide, half as tall. */
export const LAGOON_BOX = { w: 360, h: 180 } as const;

export const BOUNDS_POLL_MS = 1500;
/** A spot keeps its decoded art this long after it leaves the screen. */
export const WARM_ART_MS = 60_000;

function useViewBounds(mapRef: RefObject<MapViewRef | null>, on: boolean, zoom: number, relayout: number): Bounds | null {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const read = () => {
      void mapRef.current?.getVisibleBounds().then(visible => {
        const next = boundsFromVisible(visible);
        if (live && next) setBounds(prev => (sameBounds(prev, next) ? prev : next));
      }).catch(() => undefined);
    };
    read();
    // Every 1.5 s (battery); a GPS jump or resume (relayout) reads at once and as the camera settles.
    const timer = setInterval(read, BOUNDS_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [on, zoom, mapRef, relayout]);
  return bounds;
}

/** A jump this far in one fix (a GPS jump, a teleport, the first fix after a resume; never a walk) re-lays out the markers. */
export const RELAYOUT_JUMP_M = 80;
/**
 * MapLibre iOS parks an off-screen MarkerView in a corner and, after a big camera jump, can
 * leave it there even once its point is on screen again (the encounter ring and reef critters
 * went missing after a GPS jump). A tiny coordinate change makes the native view re-lay out.
 * Prop update only: the Marker set, order and Skia trees never change (crash guard).
 */
function useRelayoutNudge(player: { latitude: number; longitude: number } | null): number {
  const [nudge, setNudge] = useState(0);
  const last = useRef(player);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const kick = useRef(() => {
    for (const t of timers.current) clearTimeout(t);
    // Once right away, then again after the camera settles.
    timers.current = [0, 900, 2200].map(ms => setTimeout(() => setNudge(n => n + 1), ms));
  });
  useEffect(() => {
    const prev = last.current;
    last.current = player;
    if (prev && player && distanceMeters(prev, player) > RELAYOUT_JUMP_M) kick.current();
  }, [player?.latitude, player?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') kick.current(); });
    return () => { sub.remove(); for (const t of timers.current) clearTimeout(t); };
  }, []);
  return nudge;
}

/** The point, moved 1e-7 deg (about 1 cm) on odd nudges: invisible, but a new native coordinate. */
export function nudged<P extends { latitude: number; longitude: number }>(p: P, nudge: number): P {
  return nudge % 2 === 1 ? { ...p, latitude: p.latitude + 1e-7 } : p;
}

const hauntDim = (s: FrightSpot) => s.status === 'CLOSED' || s.status === 'DOWN' || s.status === 'REFURBISHMENT';

export const FrightMapSources = memo(function FrightMapSources({ input, zoom, mapRef, hud = null }: {
  readonly input: FrightMapInput;
  /** Camera zoom (Map's cameraZoom). */
  readonly zoom: number;
  readonly mapRef: RefObject<MapViewRef | null>;
  /** The map's own right-rail controls (screen rect), measured by Map.tsx. */
  readonly hud?: HudRect | null;
}) {
  const st = useFrightState(input);
  const { heading } = useContext(HeadingContext);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { alive, caps, visible, moving } = st;
  const on = visible > 0 && alive.active;
  const player = validPoint(input.player) ? input.player : null;
  const relayout = useRelayoutNudge(player);
  const bounds = useViewBounds(mapRef, on, zoom, relayout);
  const pin = <P extends { latitude: number; longitude: number }>(p: P) => nudged(p, relayout);

  const spots = useMemo(() => input.tonight.spots.filter(s => validPoint(s)), [input.tonight.spots]);
  // Budget ranking looks a little past the view; drawing is stricter (below).
  const near = useMemo(() => spots.filter(s => nearView(s, bounds, DRAW_MARGIN_SCREENS)), [spots, bounds]);
  const from = player ?? (bounds ? boundsCenter(bounds) : null);
  // Rank by ~20 m steps so walking does not reshuffle budgets every fix.
  const fromKey = from ? `${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}` : '';
  const ranked = useMemo(() => rankSpots(near, from), [near, fromKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = useMemo(() => new Map(near.map(s => [s.key, s])), [near]);
  const spotsRef = useRef(byKey);
  spotsRef.current = byKey;
  const order = (kind: FrightSpot['kind']) => ranked.map(k => byKey.get(k)!).filter(s => s.kind === kind);
  const haunts = order('haunt');
  const reefs = order('reef');
  // MapLibre crash guard (NSRangeException in -[MLRNMapView insertReactSubview:atIndex:]): the
  // Marker set never changes while the payload is the same. Every spot keeps its Marker in a
  // fixed order; culling, fading, calm and ranking only change what is drawn inside it.
  const stable = useMemo(() => stableMarkerSpots(spots), [spots]);
  const nearKeys = useMemo(() => new Set(near.map(s => s.key)), [near]);
  const rankIndex = useMemo(() => new Map(ranked.map((k, i) => [k, i])), [ranked]);
  const animate = moving;
  const assets = input.tonight.assets ?? null;
  const lite = st.tier === 'lite';
  const layersOf = (h: FrightSpot) => hauntLayers(assets, h);
  const windowsOf = (h: FrightSpot) => {
    const layers = layersOf(h);
    const n = Number(layers?.window_count);
    return layers && Number.isFinite(n) && n > 0 ? Math.min(8, Math.round(n)) : windowWant(h.fx);
  };
  const windowAlloc = allocate(haunts.map(h => [h.key, windowsOf(h)] as const), animate ? caps.frightWindows : 0);
  const critterAlloc = allocate(reefs.map(r => [r.key, reefSlots(r.fx)] as const), animate ? caps.frightCritters : 0);
  const propSpots = ranked.map(k => byKey.get(k)!).filter(s => canvasProps(spotProps(s.fx)).length > 0);
  const batAlloc = allocate(propSpots.filter(s => spotProps(s.fx).includes('bats')).map(s => [s.key, 2] as const), animate ? caps.frightBats : 0);
  const propAlloc = allocate(propSpots.map(s => [s.key, movingProps(spotProps(s.fx)).length] as const), animate ? caps.frightProps : 0);

  // Beads: tonight's finished runs per haunt, at least one when listed done.
  const beads = useMemo(() => {
    const out: Record<string, number> = {};
    for (const key of input.doneKeys) out[key] = (out[key] ?? 0) + 1;
    for (const run of input.tonight.me?.runs ?? []) {
      if (run.done_at && out[run.key] !== undefined) out[run.key] = Math.max(out[run.key], 1);
    }
    return out;
  }, [input.doneKeys, input.tonight.me?.runs]);

  // Events (MAP_FX_SPEC: at most 2 on screen, a third waits 2 to 5 s): reef
  // entry pops, ambient critter jumps, door creaks and ghost passes. One JS
  // tick a second decides; sprites play from a token bump.
  const pops = useRef<PopState>(POP_START);
  const pendingPops = useRef<string[]>([]);
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [jumpWho, setJumpWho] = useState<Record<string, number>>({});
  const ambientNext = useRef<Record<string, number>>({});
  const ambientN = useRef(0);
  const reefCircles = useMemo(() => spots.filter(s => s.kind === 'reef').map(s => ({ key: s.key, latitude: s.latitude,
    longitude: s.longitude, radius: s.radius })), [spots]);
  useEffect(() => {
    if (visible <= 0) return;
    const result = stepPops(pops.current, reefCircles, player, Date.now(), !st.effectsOn);
    pops.current = result.state;
    for (const key of result.pops) if (!pendingPops.current.includes(key)) pendingPops.current.push(key);
  }, [player?.latitude, player?.longitude, reefCircles, st.effectsOn, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The park's cast (the server sends only this park's sheets) goes to the disk cache once the
  // mode is on, so a reef or the encounter never waits on the network when it comes into view.
  const castKey = castUrls(assets).join('|');
  useEffect(() => {
    if (!on || !castKey) return;
    prefetchFrightImages(castKey.split('|'));
  }, [on, castKey]);

  const encounter = input.tonight.encounter;
  const encounterLive = !!encounter && validPoint(encounter) && (() => {
    const start = Date.parse(encounter.starts_at);
    const end = Date.parse(encounter.ends_at);
    return Number.isFinite(start) && Number.isFinite(end) && st.serverNow >= start && st.serverNow < end;
  })();
  const lod = critterLod(zoom);
  const onHauntPress = input.onHauntPress;
  const onHauntPressRef = useRef(onHauntPress);
  onHauntPressRef.current = onHauntPress;
  const onEncounterPress = input.onEncounterPress;
  const onEncounterPressRef = useRef(onEncounterPress);
  onEncounterPressRef.current = onEncounterPress;
  // Lagoon Glow-Down: show spots that ask for it (fx.props), only while a performance runs.
  const glowAsset = assets?.ambient?.['lagoon-glow'] ?? null;
  const glowSpots = glowAsset?.file ? order('show')
    .filter(spot => spotProps(spot.fx).includes('lagoon-glow') && activeShowStart(spot.times, st.serverNow, SHOW_WINDOW_MS) !== null)
    .map(spot => ({ spot, widthPts: Math.max(80, Math.min(360, spot.radius * 2 * pointsPerMeter(zoom, spot.latitude))) })) : [];
  const chips = chipKeys(haunts, zoom);
  const reefCount = (key: string) => (lod === 'sprites' ? critterAlloc[key] ?? 0 : 0);
  const sources: AmbientSource[] = [];
  if (animate) {
    for (const reef of reefs) {
      if (reefCount(reef.key) > 0) sources.push({ id: `jump:${reef.key}`, minGapMs: 45_000, maxGapMs: 120_000, durationMs: 1000 });
    }
    for (const haunt of haunts) {
      if (!layersOf(haunt) || hauntDim(haunt)) continue;
      sources.push({ id: `door:${haunt.key}`, minGapMs: 40_000, maxGapMs: 90_000, durationMs: 3000 });
      if (!lite) sources.push({ id: `ghost:${haunt.key}`, minGapMs: 25_000, maxGapMs: 60_000, durationMs: 1000 });
    }
    // Skid-fin spark passes while the encounter is live (full tier only), every 20 to 45 s.
    if (encounterLive && encounter && st.tier === 'full') {
      sources.push({ id: `sparks:${encounter.key}`, minGapMs: 20_000, maxGapMs: 45_000, durationMs: 1500 });
    }
  }
  const sourcesKey = sources.map(x => x.id).join('|');
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const playerRef = useRef(player);
  playerRef.current = player;
  const effectsRef = useRef(st.effectsOn);
  effectsRef.current = st.effectsOn;
  useEffect(() => {
    if (!animate) { pendingPops.current = []; return; }
    const seed = (Date.now() / 1000) | 0;
    const tick = () => {
      const now = Date.now();
      const bumps: string[] = [];
      const who: Record<string, number> = {};
      // Entry pops first: they wait for a free slot like any event.
      pendingPops.current = pendingPops.current.filter(key => {
        if (!frightEvents.tryStart(`jump:${key}`, now, 1000)) return true;
        bumps.push(`jump:${key}`);
        who[key] = 0;
        if (effectsRef.current) {
          queueHaptic('tapLight');
          playFrightSfx('fright-pop', FRIGHT_SOUNDS.pop, 0.3, 1300, SFX_PRIORITY.tap);
        }
        return false;
      });
      const result = stepAmbient(ambientNext.current, sourcesRef.current, now, frightEvents, seed, ambientN.current);
      ambientNext.current = result.next;
      ambientN.current = result.n;
      for (const id of result.started) {
        bumps.push(id);
        if (id.startsWith('jump:')) who[id.slice(5)] = Math.floor(randAt(seed, ambientN.current++) * 3);
        if (id.startsWith('door:') && effectsRef.current && playerRef.current) {
          const haunt = spotsRef.current.get(id.slice(5));
          if (haunt && distanceMeters(playerRef.current, haunt) <= 150) playFrightSfx('fright-door', FRIGHT_SOUNDS.door, 0.2, 2800);
        }
      }
      if (!bumps.length) return;
      setTokens(prev => {
        const next = { ...prev };
        for (const id of bumps) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
      if (Object.keys(who).length) setJumpWho(prev => ({ ...prev, ...who }));
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [animate, sourcesKey]); // eslint-disable-line react-hooks/exhaustive-deps


  // Chips stay 12 pt inside the screen edges: project each facade and slide its chip in.
  const chipCenter = cameraCenter(player, bounds);
  // Chips also keep clear of the HUD: the map's right rail plus any rects ExploreScreen passes.
  const huds = useMemo(() => [...(hud ? [hud] : []), ...(input.hudRects ?? [])], [hud, input.hudRects]);
  // MapLibre iOS draws a MarkerView whose point is off screen at the top-left corner (the
  // "facade in the corner" and edge-clipped chips). Every Marker stays mounted (the crash
  // guard); a spot whose point is off screen draws the hidden stand-in instead.
  const spotAt = useMemo(() => new Map(spots.map(s => [s.key, s.kind === 'haunt' && s.fx?.offset?.length === 2
    ? offsetMeters(s, Number(s.fx.offset[0]) || 0, Number(s.fx.offset[1]) || 0) : s])), [spots]);
  const shown = (key: string) => {
    if (visible <= 0 || !nearKeys.has(key)) return false;
    const at = spotAt.get(key);
    return !at || onScreen(at, chipCenter, zoom, heading, screenW, screenH, ON_SCREEN_SLACK);
  };
  const shownRef = useRef(shown);
  shownRef.current = shown;
  // Image memory: a spot holds its art only while shown or shown in the last minute. A cold
  // spot passes null URLs (a prop change; its Skia tree stays mounted), so the decoded-image
  // sweeper can free it. The always-mounted tree used to retain every spot's images.
  const lastShown = useRef<Map<string, number>>(new Map());
  const renderAt = Date.now();
  const warm = (key: string) => {
    if (shown(key)) { lastShown.current.set(key, renderAt); return true; }
    const at = lastShown.current.get(key);
    return at !== undefined && renderAt - at < WARM_ART_MS;
  };
  const encounterShown = encounterLive && !!encounter && visible > 0 && nearView(encounter, bounds, 1);
  // Fixed art fades where it would sit under a button (declutter reason "inset").
  const encounterUnderButton = useUnderButton('encounter');
  const encounterOnScreen = encounterShown && !!encounter && !encounterUnderButton
    && onScreen(encounter, cameraCenter(player, bounds), zoom, heading, screenW, screenH, ON_SCREEN_SLACK);
  const encounterTapRef = useRef<string | null>(null);
  encounterTapRef.current = encounterOnScreen && encounter ? encounter.key : null;
  // One encounter Marker, always mounted; it parks on the first spot when no encounter is live.
  const encounterAt = encounter && validPoint(encounter) ? encounter : stable.all[0] ?? PARKED;
  return (
    <RelayoutContext.Provider value={relayout}>
      {stable.reefs.map(reef => {
        // Opacity-only: the reef's whole sprite tree stays mounted for the payload. Off screen,
        // hidden or faded = opacity 0 with motion paused; LOD cross-fades glyph and critters.
        const on = shown(reef.key);
        const cast = reefCast(reef.fx);
        const watch = !on || !player ? 0 : watchSide(distanceMeters(player, reef), reef.radius, bearingDeg(reef, player), heading);
        const ppm = pointsPerMeter(zoom, reef.latitude);
        // Capped at 90 pt: a reef canvas is (2 x wander + 90) points square at 3x, and four of them add up.
        const wander = Math.max(18, Math.min(REEF_MAX_WANDER, reef.radius * ppm * 0.8));
        const n = critterAlloc[reef.key] ?? 0;
        const glyph = lod === 'glyph' || st.tier === 'calm';
        const slots = reefSlots(reef.fx);
        const hot = warm(reef.key);
        const sheets = cast.map(slug => (hot ? scareactorAsset(assets, slug) : null));
        return (
          <Marker key={`fr-${reef.key}`} coordinate={pin(reef)}>
            <PlacedSpot id={`reef:${reef.key}`}>
              <ShowWhen box={REEF_BOX} on={on}>
                <ReefLod glyph={glyph}
                  critters={<ReefCritters reefKey={reef.key} assets={sheets} count={n > 0 ? n : Math.min(1, slots)} slots={slots}
                    wanderPts={wander} clock={alive.clock} animated={on && !glyph && animate && n > 0} full={st.tier === 'full'} watch={watch}
                    jumpToken={tokens[`jump:${reef.key}`] ?? 0} jumpIndex={jumpWho[reef.key] ?? 0} intensity={visible}
                    mistUrl={hot ? assets?.fog_night?.ground_mist ?? null : null} />}
                  glyphArt={<ReefGlyph staticUrl={sheets[0]?.static ?? null} intensity={visible} />} />
              </ShowWhen>
            </PlacedSpot>
          </Marker>
        );
      })}
      {stable.props.filter(spot => canvasProps(spotProps(spot.fx)).length > 0).map(spot => {
        const props = canvasProps(spotProps(spot.fx));
        const bats = batAlloc[spot.key] ?? 0;
        const movingNow = propAlloc[spot.key] ?? 0;
        const on = shown(spot.key) && !(st.tier === 'calm' && !props.includes('fog-thick'));
        return (
          <Marker key={`fp-${spot.key}`} coordinate={pin(spot)}>
            {/* A reef's props (fog, eyes, bats) share the reef's declutter placement: they fade with it
                under a button or off screen instead of drawing on their own. Other spots: always placed. */}
            <PlacedSpot id={spot.kind === 'reef' ? `reef:${spot.key}` : `prop:${spot.key}`}>
              <ShowWhen box={PROPS_BOX} on={on}>
                <SpotProps spotKey={spot.key} props={props} bats={on ? bats : 0} movingAllowed={on ? movingNow : 0} clock={alive.clock}
                  animated={on && animate} lite={lite} intensity={visible} ambient={warm(spot.key) ? assets?.ambient ?? null : null}
                  mistUrl={warm(spot.key) ? assets?.fog_night?.ground_mist ?? null : null} />
              </ShowWhen>
            </PlacedSpot>
          </Marker>
        );
      })}
      {stable.haunts.map(haunt => {
        const offset = haunt.fx?.offset;
        const at = offset && offset.length === 2 ? offsetMeters(haunt, Number(offset[0]) || 0, Number(offset[1]) || 0) : haunt;
        const on = shown(haunt.key);
        const chip = on && chips.has(haunt.key);
        const parts = hauntChipParts(haunt, beads[haunt.key] !== undefined);
        return (
          // Always a Pressable (never swapped): hidden haunts just take no touches.
          <Marker key={`fh-${haunt.key}`} coordinate={pin(at)} anchor={HAUNT_ANCHOR}
            onPress={() => { if (shownRef.current(haunt.key)) onHauntPressRef.current?.(haunt.key); }}
            touchEnabled={on && !!onHauntPress}
            accessibilityLabel={`${haunt.name}, haunt`}>
            <PlacedSpot id={`haunt:${haunt.key}`} anchor={HAUNT_GROUND} fold>
              <ShowWhen box={HAUNT_BOX} on={on}>
                <HauntLantern spotKey={haunt.key} flicker={haunt.fx?.flicker} windows={Math.min(6, windowWant(haunt.fx))}
                  animatedWindows={on ? windowAlloc[haunt.key] ?? 0 : 0} clock={alive.clock} animated={on && animate}
                  rate={on && (windowAlloc[haunt.key] ?? 0) > 0 ? (lite ? 0.5 : 1) : 0} ghosts={!lite} doors
                  ghostToken={tokens[`ghost:${haunt.key}`] ?? 0} doorToken={tokens[`door:${haunt.key}`] ?? 0}
                  layers={warm(haunt.key) ? layersOf(haunt) : null}
                  label={chip ? parts.name : null}
                  chipDetail={parts.detail}
                  chipX={chipCenter && chip ? screenX(at, chipCenter, zoom, heading, screenW) : null}
                  chipY={chipCenter && chip ? screenY(at, chipCenter, zoom, heading, screenH) + CHIP_BELOW_ANCHOR : null}
                  screenW={screenW} huds={huds}
                  survivedPin={assets?.event_pins?.['ev-survived']?.['256'] ?? null}
                  done={beads[haunt.key] !== undefined} beads={beads[haunt.key] ?? 0} dim={hauntDim(haunt)}
                  index={rankIndex.get(haunt.key) ?? 0}
                  iconUrl={warm(haunt.key) ? haunt.art?.icon ?? null : null} intensity={visible} reducedMotion={alive.reducedMotion} />
              </ShowWhen>
            </PlacedSpot>
          </Marker>
        );
      })}
      {stable.props.filter(spot => spot.kind === 'show' && spotProps(spot.fx).includes('lagoon-glow')).map(spot => {
        const glow = glowSpots.find(g => g.spot.key === spot.key);
        const on = !!glow && !!glowAsset && visible > 0;
        return (
          <Marker key={`fg-${spot.key}`} coordinate={pin(spot)}>
            {/* Always mounted: no performance running = opacity 0, frame held. */}
            <ShowWhen box={LAGOON_BOX} on={on}>
              <LagoonGlow asset={glowAsset ?? LAGOON_PARKED} widthPts={glow?.widthPts ?? 80} clock={alive.clock} intensity={visible}
                fps={on && alive.running && st.tier !== 'calm' ? (lite ? 6 : 10) : 0} />
            </ShowWhen>
          </Marker>
        );
      })}
      <Marker key="fe" coordinate={pin(encounterShown && encounter ? encounter : encounterAt)}>
        {/* The ring is always mounted: no encounter = opacity 0, paused. */}
        <ShowWhen box={RING_BOX} on={encounterOnScreen && !!encounter}>
          <EncounterRing ringPts={encounter ? Math.max(30, Math.min(120, encounter.radius * pointsPerMeter(zoom, encounter.latitude))) : 30}
            clock={alive.clock} animated={encounterOnScreen && !!encounter && animate}
            sparkToken={encounter ? tokens[`sparks:${encounter.key}`] ?? 0 : 0}
            sparks={assets?.ambient?.['skid-fin-sparks'] ?? null} />
        </ShowWhen>
      </Marker>
      {/* Always a Pressable (never swapped): no encounter on screen = no touches. */}
      <Marker key="fc" coordinate={pin(encounterShown && encounter ? encounter : encounterAt)}
        onPress={() => { if (encounterTapRef.current) onEncounterPressRef.current?.(encounterTapRef.current); }}
        touchEnabled={encounterOnScreen && !!encounter && !!onEncounterPress}
        accessibilityLabel={encounter ? `${encounter.name}, encounter` : 'Encounter'}>
        <ShowWhen box={CRITTER_BOX} on={encounterOnScreen && !!encounter}>
          <EncounterCritter asset={encounter ? scareactorAsset(assets, encounterScareactor(assets, encounter)) : null}
            chaos={encounter ? encounterChaos(encounter) : false} clock={alive.clock}
            animated={encounterOnScreen && !!encounter && animate} full={st.tier === 'full'}
            spawnKey={encounterOnScreen && encounter ? encounter.key : null} />
        </ShowWhen>
      </Marker>
    </RelayoutContext.Provider>
  );
});

/** How far past the view (in screens) a spot still counts for budget ranking. */
export const DRAW_MARGIN_SCREENS = 1;
/** A spot draws while its point is on screen, give or take this many points. */
export const ON_SCREEN_SLACK = 40;
/** The chip's top sits this far below the facade's anchor point (glow pool to chip). */
export const CHIP_BELOW_ANCHOR = 20;

/** The haunt lantern's ground point inside its 168 x 136 box (FrightSprites HAUNT_ANCHOR), in points. */
const HAUNT_GROUND = { x: 84, y: 82 } as const;

/**
 * A spot's art under the map declutter: fades or shrinks with its placement
 * (opacity and transform only, never a prop of the Skia art) and shows "+N"
 * for haunts folded into it. Only this spot re-renders when its placement moves.
 */
function PlacedSpot({ id, anchor, fold = false, children }: {
  readonly id: string;
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly fold?: boolean;
  readonly children: ReactNode;
}) {
  const placement = usePlacement(id);
  return (
    <Placed placement={placement} anchor={anchor}
      overlay={fold ? <FoldBadge count={placement.folded} style={{ left: 40, top: 6 }} /> : undefined}>
      {children}
    </Placed>
  );
}

/**
 * Opacity-only visibility: the child tree stays mounted whatever `on` is (never
 * a swap of element types inside a Marker: the MapLibre and RN Skia crashes);
 * hidden is opacity 0 and takes no touches.
 */
function ShowWhen({ on, box, children }: { readonly on: boolean; readonly box: { readonly w: number; readonly h: number }; readonly children: ReactNode }) {
  // After a GPS jump or resume, a spot whose native view MapLibre parked off screen comes back
  // blank. A 0.5 pt box change re-adds that annotation (and repaints its Skia): only around a
  // relayout, and for a spot revealed within 5 s of one. Ordinary pans and zooms never change it.
  const relayout = useContext(RelayoutContext);
  const [token, setToken] = useState(0);
  const lastRelayout = useRef(0);
  useEffect(() => {
    if (relayout === 0) return;
    lastRelayout.current = Date.now();
    setToken(t => t + 1);
  }, [relayout]);
  useEffect(() => {
    if (on && Date.now() - lastRelayout.current < RELAYOUT_REVEAL_MS) setToken(t => t + 1);
  }, [on]);
  return (
    <View pointerEvents={on ? 'box-none' : 'none'}
      style={[styles.box, { width: repaintWidth(box.w, token), height: box.h }, on ? SHOWN_STYLE : HIDDEN_STYLE]}>
      <RepaintContext.Provider value={token}>{children}</RepaintContext.Provider>
    </View>
  );
}
/** A spot revealed this soon after a relayout still gets its re-add. */
export const RELAYOUT_REVEAL_MS = 5000;
const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
const RelayoutContext = createContext(0);
const SHOWN_STYLE = { opacity: 1 } as const;
const HIDDEN_STYLE = { opacity: 0 } as const;

/**
 * Reef LOD as a cross-fade: the critters and the still glyph are both mounted;
 * the glyph sits centered over the critter canvas and one of them is at opacity 0.
 */
function ReefLod({ glyph, critters, glyphArt }: { readonly glyph: boolean; readonly critters: ReactNode; readonly glyphArt: ReactNode }) {
  return (
    <View pointerEvents="none">
      <View style={glyph ? HIDDEN_STYLE : SHOWN_STYLE}>{critters}</View>
      <View style={[LOD_GLYPH, glyph ? SHOWN_STYLE : HIDDEN_STYLE]}>{glyphArt}</View>
    </View>
  );
}
const LOD_GLYPH = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const;

/** Where the hidden encounter Marker waits when a payload has no spots at all. */
const PARKED = { latitude: 0, longitude: 0 } as const;
/** The glow's stand-in before the asset exists (keeps the tree fixed; nothing draws). */
const LAGOON_PARKED: FrightAmbientAsset = { file: null };

/** The hook's input while the mode is off: one stable shape, so the tint never swaps components. */
const TINT_OFF_INPUT: FrightMapInput = {
  tonight: { enabled: false, server_now: '', phase: 'off', event: null, night: null, spots: [], encounter: null, me: null, config: null },
  active: false, nowOffsetMs: 0, player: null, spooky: false, doneKeys: [],
};

/**
 * The night tint: ONE component and ONE background layer for the map's whole life.
 * Null fright only changes the layer's opacity (never which component renders), so
 * MapLibre never sees the layer leave or re-insert. A background layer covers the
 * whole viewport, so tiles that have not drawn yet after a camera jump are tinted
 * too: no untinted day strip at night.
 */
export const FrightNightTint = memo(function FrightNightTint({ input }: { readonly input: FrightMapInput | null }) {
  const st = useFrightState(input ?? TINT_OFF_INPUT);
  const opacity = input ? NIGHT_TINT_MAX * Math.max(0, st.visible) : 0;
  const intro = input?.cinematic === 'intro';
  return (
    <BackgroundLayer id="fright-night-tint" aboveLayerID="tps-sky-tint" style={{
      backgroundColor: NIGHT_TINT, backgroundOpacity: opacity,
      backgroundOpacityTransition: { duration: intro ? 900 : 4000, delay: 0 } }} />
  );
});
