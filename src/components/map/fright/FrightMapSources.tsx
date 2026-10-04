/**
 * The map-anchored half of Fin-ister Nights, rendered inside the MapView:
 * the night palette (one GL fill over the tiles, above the time-of-day tint,
 * under every pin), haunt lanterns at the real entrances, scare-critters at
 * the Fright Reefs, ambient props and the encounter. Anything more than one
 * screen off view is unmounted (bounds re-read every 2 s), and only the
 * nearest spots spend the tier's sprite budget.
 */
import { BackgroundLayer, type MapViewRef } from '@maplibre/maplibre-react-native';
import { useWindowDimensions, View } from 'react-native';
import { memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { HeadingContext } from '../../../context/LocationProvider';
import { queueHaptic } from '../../../gamekit/Haptics';
import { SFX_PRIORITY } from '../../../audio/sfxLimiter';
import type { FrightSpot } from '../../../api/endpoints/fright/types';
import { Marker } from '../Marker';
import { FoldBadge, Placed, usePlacement } from '../declutter/Placed';
import { faceToward, reefReaction, stepPops, POP_START, type PopState } from './critters';
import { critterSlugs } from './frightArt';
import { critterAsset, hauntLayers, iconAsset, isChaosHour } from './frightAssets';
import { frightEvents, stepAmbient, type AmbientSource } from './events';
import { randAt } from './random';
import { FRIGHT_SOUNDS, playFrightSfx } from './frightAudio';
import {
  allocate, boundsCenter, cameraCenter, hauntChipParts, onScreen, screenX, screenY, stableMarkerSpots, type HudRect, chipKeys, hauntChipLabel, boundsFromVisible, critterLod, critterWant, movingProps, nearView, rankSpots, spotProps,
  windowWant, type Bounds,
} from './frightBudget';
import { bearingDeg, distanceMeters, offsetMeters, pointsPerMeter, validPoint } from './geo';
import { EncounterSprite, HAUNT_ANCHOR, HauntLantern, ReefCritters, ReefGlyph, SpotProps } from './FrightSprites';
import type { FrightMapInput } from './types';
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

function useViewBounds(mapRef: RefObject<MapViewRef | null>, on: boolean, zoom: number): Bounds | null {
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
    // Often enough that a spot leaving the view hides before MapLibre parks it in the corner.
    const timer = setInterval(read, 600);
    return () => { live = false; clearInterval(timer); };
  }, [on, zoom, mapRef]);
  return bounds;
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
  const bounds = useViewBounds(mapRef, on, zoom);
  const player = validPoint(input.player) ? input.player : null;

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
  const critterAlloc = allocate(reefs.map(r => [r.key, critterWant(r.fx)] as const), animate ? caps.frightCritters : 0);
  const propSpots = ranked.map(k => byKey.get(k)!).filter(s => spotProps(s.fx).length > 0);
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

  const lod = critterLod(zoom);
  const onHauntPress = input.onHauntPress;
  const onHauntPressRef = useRef(onHauntPress);
  onHauntPressRef.current = onHauntPress;
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

  const encounter = input.tonight.encounter;
  const encounterLive = !!encounter && validPoint(encounter) && (() => {
    const start = Date.parse(encounter.starts_at);
    const end = Date.parse(encounter.ends_at);
    return Number.isFinite(start) && Number.isFinite(end) && st.serverNow >= start && st.serverNow < end;
  })();

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
  const encounterShown = encounterLive && !!encounter && visible > 0 && nearView(encounter, bounds, 1);
  const encounterOnScreen = encounterShown && !!encounter && onScreen(encounter, cameraCenter(player, bounds), zoom, heading, screenW, screenH, ON_SCREEN_SLACK);
  // One encounter Marker, always mounted; it parks on the first spot when no encounter is live.
  const encounterAt = encounter && validPoint(encounter) ? encounter : stable.all[0] ?? PARKED;
  return (
    <>
      {stable.reefs.map(reef => {
        // Opacity-only: the reef's whole sprite tree stays mounted for the payload. Off screen,
        // hidden or faded = opacity 0 with motion paused; LOD cross-fades glyph and critters.
        const on = shown(reef.key);
        const slugs = critterSlugs(reef.fx?.critter);
        const d = player ? distanceMeters(player, reef) : Infinity;
        const reaction = reefReaction(d, reef.radius);
        const watch = !on || reaction === 'ignore' || !player ? 0 : faceToward(bearingDeg(reef, player), heading);
        const ppm = pointsPerMeter(zoom, reef.latitude);
        // Capped at 90 pt: a reef canvas is (2 x wander + 90) points square at 3x, and four of them add up.
        const wander = Math.max(18, Math.min(90, reef.radius * ppm * 0.8));
        const n = critterAlloc[reef.key] ?? 0;
        const glyph = lod === 'glyph' || st.tier === 'calm';
        const slots = critterWant(reef.fx);
        const sheets = slugs.map(slug => critterAsset(assets, slug));
        return (
          <Marker key={`fr-${reef.key}`} coordinate={reef}>
            <PlacedSpot id={`reef:${reef.key}`}>
              <ShowWhen on={on}>
                <ReefLod glyph={glyph}
                  critters={<ReefCritters reefKey={reef.key} slugs={slugs} assets={sheets} count={n > 0 ? n : Math.min(1, slots)} slots={slots}
                    wanderPts={wander} clock={alive.clock} animated={on && !glyph && animate && n > 0} lite={lite} watch={watch}
                    jumpToken={tokens[`jump:${reef.key}`] ?? 0} jumpIndex={jumpWho[reef.key] ?? 0} intensity={visible}
                    mistUrl={assets?.fog_night?.ground_mist ?? null} />}
                  glyphArt={<ReefGlyph slug={slugs[0] ?? null} staticUrl={sheets[0]?.static ?? null} intensity={visible} />} />
              </ShowWhen>
            </PlacedSpot>
          </Marker>
        );
      })}
      {stable.props.map(spot => {
        const props = spotProps(spot.fx);
        const bats = batAlloc[spot.key] ?? 0;
        const movingNow = propAlloc[spot.key] ?? 0;
        const on = shown(spot.key) && !(st.tier === 'calm' && !props.includes('fog-thick'));
        return (
          <Marker key={`fp-${spot.key}`} coordinate={spot}>
            <ShowWhen on={on}>
              <SpotProps spotKey={spot.key} props={props} bats={on ? bats : 0} movingAllowed={on ? movingNow : 0} clock={alive.clock}
                animated={on && animate} lite={lite} intensity={visible} ambient={assets?.ambient ?? null}
                mistUrl={assets?.fog_night?.ground_mist ?? null} />
            </ShowWhen>
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
          <Marker key={`fh-${haunt.key}`} coordinate={at} anchor={HAUNT_ANCHOR}
            onPress={() => { if (shownRef.current(haunt.key)) onHauntPressRef.current?.(haunt.key); }}
            touchEnabled={on && !!onHauntPress}
            accessibilityLabel={`${haunt.name}, haunt`}>
            <PlacedSpot id={`haunt:${haunt.key}`} anchor={HAUNT_GROUND} fold>
              <ShowWhen on={on}>
                <HauntLantern spotKey={haunt.key} flicker={haunt.fx?.flicker} windows={Math.min(6, windowWant(haunt.fx))}
                  animatedWindows={on ? windowAlloc[haunt.key] ?? 0 : 0} clock={alive.clock} animated={on && animate}
                  rate={on && (windowAlloc[haunt.key] ?? 0) > 0 ? (lite ? 0.5 : 1) : 0} ghosts={!lite} doors
                  ghostToken={tokens[`ghost:${haunt.key}`] ?? 0} doorToken={tokens[`door:${haunt.key}`] ?? 0}
                  layers={layersOf(haunt)}
                  label={chip ? parts.name : null}
                  chipDetail={parts.detail}
                  chipX={chipCenter && chip ? screenX(at, chipCenter, zoom, heading, screenW) : null}
                  chipY={chipCenter && chip ? screenY(at, chipCenter, zoom, heading, screenH) + CHIP_BELOW_ANCHOR : null}
                  screenW={screenW} huds={huds}
                  survivedPin={assets?.event_pins?.['ev-survived']?.['256'] ?? null}
                  done={beads[haunt.key] !== undefined} beads={beads[haunt.key] ?? 0} dim={hauntDim(haunt)}
                  index={rankIndex.get(haunt.key) ?? 0}
                  iconUrl={haunt.art?.icon ?? null} intensity={visible} reducedMotion={alive.reducedMotion} />
              </ShowWhen>
            </PlacedSpot>
          </Marker>
        );
      })}
      <Marker key="fe" coordinate={encounterShown && encounter ? encounter : encounterAt}>
        {/* One encounter sprite, always mounted: no encounter = opacity 0, paused. */}
        <ShowWhen on={encounterOnScreen && !!encounter}>
          <EncounterSprite critter={encounter?.critter ?? 'chuckles'} asset={encounter ? iconAsset(assets, encounter.critter) : null}
            chaos={encounter ? isChaosHour(encounter.starts_at, encounter.ends_at) : false} lite={lite}
            ringPts={encounter ? Math.max(30, Math.min(120, encounter.radius * pointsPerMeter(zoom, encounter.latitude))) : 30}
            trail={caps.frightCritters > 0 ? Math.min(6, Math.round(caps.frightCritters * 0.75)) : 0}
            clock={alive.clock} animated={encounterOnScreen && !!encounter && animate} />
        </ShowWhen>
      </Marker>
    </>
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
function ShowWhen({ on, children }: { readonly on: boolean; readonly children: ReactNode }) {
  return <View pointerEvents={on ? 'box-none' : 'none'} style={on ? SHOWN_STYLE : HIDDEN_STYLE}>{children}</View>;
}
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


/**
 * The night tint over the tiles. Map.tsx keeps it mounted at all times (opacity
 * 0 without an input), so turning the mode on never inserts a source mid-list.
 */
/** The hook's input while the mode is off: one stable shape, so the tint never swaps components. */
const FRIGHT_OFF: FrightMapInput = {
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
  const st = useFrightState(input ?? FRIGHT_OFF);
  const opacity = input ? NIGHT_TINT_MAX * Math.max(0, st.visible) : 0;
  const intro = input?.cinematic === 'intro';
  return (
    <BackgroundLayer id="fright-night-tint" aboveLayerID="tps-sky-tint" style={{
      backgroundColor: NIGHT_TINT, backgroundOpacity: opacity,
      backgroundOpacityTransition: { duration: intro ? 900 : 4000, delay: 0 } }} />
  );
});
