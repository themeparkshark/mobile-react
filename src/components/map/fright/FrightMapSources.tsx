/**
 * The map-anchored half of Fin-ister Nights, rendered inside the MapView:
 * the night palette (one GL fill over the tiles, above the time-of-day tint,
 * under every pin), haunt lanterns at the real entrances, scare-critters at
 * the Fright Reefs, ambient props and the encounter. Anything more than one
 * screen off view is unmounted (bounds re-read every 2 s), and only the
 * nearest spots spend the tier's sprite budget.
 */
import { FillLayer, ShapeSource, type MapViewRef } from '@maplibre/maplibre-react-native';
import { memo, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { HeadingContext } from '../../../context/LocationProvider';
import { queueHaptic } from '../../../gamekit/Haptics';
import { SFX_PRIORITY } from '../../../audio/sfxLimiter';
import type { FrightSpot } from '../../../api/endpoints/fright/types';
import { Marker } from '../Marker';
import { faceToward, reefReaction, stepPops, POP_START, type PopState } from './critters';
import { critterSlugs } from './frightArt';
import { critterAsset, hauntLayers, iconAsset, isChaosHour } from './frightAssets';
import { frightEvents, stepAmbient, type AmbientSource } from './events';
import { randAt } from './random';
import { FRIGHT_SOUNDS, playFrightSfx } from './frightAudio';
import {
  allocate, boundsCenter, boundsFromVisible, critterLod, critterWant, movingProps, nearView, rankSpots, spotProps,
  windowWant, type Bounds,
} from './frightBudget';
import { bearingDeg, distanceMeters, offsetMeters, pointsPerMeter, validPoint } from './geo';
import { EncounterSprite, HauntLantern, ReefCritters, ReefGlyph, SpotProps } from './FrightSprites';
import type { FrightMapInput } from './types';
import { useFrightState } from './useFrightState';

const WORLD: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }] };
/** Deep night over the tiles (night-tint.json overlay, a touch lighter so paths stay legible). */
export const NIGHT_TINT = '#1E1846';
export const NIGHT_TINT_MAX = 0.44;

function sameBounds(a: Bounds | null, b: Bounds): boolean {
  if (!a) return false;
  const tol = Math.abs(b.north - b.south) * 0.1;
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
    const timer = setInterval(read, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [on, zoom, mapRef]);
  return bounds;
}

const hauntDim = (s: FrightSpot) => s.status === 'CLOSED' || s.status === 'DOWN' || s.status === 'REFURBISHMENT';

export const FrightMapSources = memo(function FrightMapSources({ input, zoom, mapRef }: {
  readonly input: FrightMapInput;
  /** Camera zoom (Map's cameraZoom). */
  readonly zoom: number;
  readonly mapRef: RefObject<MapViewRef | null>;
}) {
  const st = useFrightState(input);
  const { heading } = useContext(HeadingContext);
  const { alive, caps, visible, moving } = st;
  const on = visible > 0 && alive.active;
  const bounds = useViewBounds(mapRef, on, zoom);
  const player = validPoint(input.player) ? input.player : null;

  const spots = useMemo(() => input.tonight.spots.filter(s => validPoint(s)), [input.tonight.spots]);
  const near = useMemo(() => spots.filter(s => nearView(s, bounds, 1)), [spots, bounds]);
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
  const intro = input.cinematic === 'intro';

  if (visible <= 0) return null;
  return (
    <>
      <ShapeSource id="fright-night-tint" shape={WORLD}>
        <FillLayer id="fright-night-tint" aboveLayerID="tps-sky-tint" style={{
          fillColor: NIGHT_TINT, fillOpacity: NIGHT_TINT_MAX * visible,
          fillOpacityTransition: { duration: intro ? 900 : 4000, delay: 0 } }} />
      </ShapeSource>
      {reefs.map(reef => {
        const slugs = critterSlugs(reef.fx?.critter);
        const d = player ? distanceMeters(player, reef) : Infinity;
        const reaction = reefReaction(d, reef.radius);
        const watch = reaction === 'ignore' || !player ? 0 : faceToward(bearingDeg(reef, player), heading);
        const ppm = pointsPerMeter(zoom, reef.latitude);
        const wander = Math.max(18, Math.min(110, reef.radius * ppm * 0.8));
        const n = critterAlloc[reef.key] ?? 0;
        const glyph = lod === 'glyph' || st.tier === 'calm' || n === 0;
        const sheets = slugs.map(slug => critterAsset(assets, slug));
        return (
          <Marker key={`fr-${reef.key}`} coordinate={reef}>
            {glyph
              ? <ReefGlyph slug={slugs[0] ?? null} staticUrl={sheets[0]?.static ?? null} intensity={visible} />
              : <ReefCritters reefKey={reef.key} slugs={slugs} assets={sheets} count={n} wanderPts={wander} clock={alive.clock}
                  animated={animate} lite={lite} watch={watch} jumpToken={tokens[`jump:${reef.key}`] ?? 0}
                  jumpIndex={jumpWho[reef.key] ?? 0} intensity={visible} mistUrl={assets?.fog_night?.ground_mist ?? null} />}
          </Marker>
        );
      })}
      {propSpots.map(spot => {
        const props = spotProps(spot.fx);
        const bats = batAlloc[spot.key] ?? 0;
        const moving = propAlloc[spot.key] ?? 0;
        if (st.tier === 'calm' && !props.includes('fog-thick')) return null;
        return (
          <Marker key={`fp-${spot.key}`} coordinate={spot}>
            <SpotProps spotKey={spot.key} props={props} bats={bats} movingAllowed={moving} clock={alive.clock}
              animated={animate} lite={lite} intensity={visible} ambient={assets?.ambient ?? null}
              mistUrl={assets?.fog_night?.ground_mist ?? null} />
          </Marker>
        );
      })}
      {haunts.map((haunt, i) => {
        const offset = haunt.fx?.offset;
        const at = offset && offset.length === 2 ? offsetMeters(haunt, Number(offset[0]) || 0, Number(offset[1]) || 0) : haunt;
        return (
          <Marker key={`fh-${haunt.key}`} coordinate={at} anchor={{ x: 0.5, y: 0.82 }}>
            <HauntLantern spotKey={haunt.key} flicker={haunt.fx?.flicker} windows={Math.min(6, windowWant(haunt.fx))}
              animatedWindows={windowAlloc[haunt.key] ?? 0} clock={alive.clock} animated={animate}
              rate={(windowAlloc[haunt.key] ?? 0) > 0 ? (lite ? 0.5 : 1) : 0} ghosts={!lite} doors
              ghostToken={tokens[`ghost:${haunt.key}`] ?? 0} doorToken={tokens[`door:${haunt.key}`] ?? 0}
              layers={layersOf(haunt)}
              done={beads[haunt.key] !== undefined} beads={beads[haunt.key] ?? 0} dim={hauntDim(haunt)} index={i}
              iconUrl={haunt.art?.icon ?? null} intensity={visible} reducedMotion={alive.reducedMotion} />
          </Marker>
        );
      })}
      {encounterLive && encounter && nearView(encounter, bounds, 1) && (
        <Marker key={`fe-${encounter.key}`} coordinate={encounter}>
          <EncounterSprite critter={encounter.critter} asset={iconAsset(assets, encounter.critter)}
            chaos={isChaosHour(encounter.starts_at, encounter.ends_at)} lite={lite}
            ringPts={Math.max(30, Math.min(120, encounter.radius * pointsPerMeter(zoom, encounter.latitude)))}
            trail={caps.frightCritters > 0 ? Math.min(6, Math.round(caps.frightCritters * 0.75)) : 0}
            clock={alive.clock} animated={animate} />
        </Marker>
      )}
    </>
  );
});
