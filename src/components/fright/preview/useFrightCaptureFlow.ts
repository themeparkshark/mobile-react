/**
 * Dev-only capture driver (EXPO_PUBLIC_FRIGHT_CAPTURE_NAV=flow). Simulator
 * touch input isn't available to the capture agent, so this walks one real
 * Fin-ister night through the real engine and the real (local) server, the
 * same calls the buttons make: intro, haunt sheet, enter (in line), survive,
 * rank card (RankCard picks and sends on its own in this mode), rewards, the
 * reef Case File, the encounter catch, the Marquee recap, then the Halloween
 * shelf, pins and the Deep Lantern card. Each step logs `[fright-capture]` so
 * host screenshots can be matched to steps. Inert in release builds.
 */
import { useEffect, useRef } from 'react';
import * as RootNavigation from '../../../RootNavigation';
import type { FrightEngine } from '../useFrightEngine';
import type { FrightNight } from '../../../hooks/useFrightNight';

type Point = { readonly latitude: number; readonly longitude: number };

export const CAPTURE_FLOW = __DEV__ && process.env.EXPO_PUBLIC_FRIGHT_CAPTURE_NAV === 'flow';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useFrightCaptureFlow({ night, engine, location, moveDevLocation, storeId }: {
  readonly night: FrightNight;
  readonly engine: FrightEngine;
  readonly location: Point | null | undefined;
  readonly moveDevLocation: (dx: number, dy: number, speed: number) => void;
  readonly storeId: number | string;
}) {
  const live = useRef({ night, engine, location });
  live.current = { night, engine, location };
  const started = useRef(false);
  const ready = !!night.tonight?.night && night.modeOn;

  useEffect(() => {
    if (!CAPTURE_FLOW || !ready || started.current) return;
    started.current = true;
    const log = (step: string, extra = '') => console.log(`[fright-capture] ${step} ${new Date().toISOString()} ${extra}`);
    const teleport = async (to: Point) => {
      const from = live.current.location;
      if (from) moveDevLocation(to.longitude - from.longitude, to.latitude - from.latitude, 1);
      await sleep(3000);
    };
    const waitFor = async (what: string, ok: () => boolean, maxMs: number) => {
      const until = Date.now() + maxMs;
      while (Date.now() < until) {
        if (ok()) return true;
        await sleep(1000);
      }
      log('timeout', what);
      return false;
    };
    const closeModals = async (rounds = 4) => {
      for (let i = 0; i < rounds && live.current.engine.modal; i++) {
        log('modal', live.current.engine.modal?.kind ?? '');
        await sleep(6000);
        const m = live.current.engine.modal;
        if (m?.kind === 'side') await live.current.engine.pickSide('chaos');
        else if (m?.kind === 'rank') await sleep(4000); // RankCard sends and closes itself
        else live.current.engine.closeModal();
        await sleep(1500);
      }
    };

    void (async () => {
      log('intro', live.current.engine.tutorial ?? 'none');
      await sleep(14000);
      if (live.current.engine.tutorial) live.current.engine.finishTutorial();
      await sleep(3000);

      const tonight = live.current.night.tonight;
      const done = new Set(live.current.engine.doneKeys);
      const haunt = tonight?.spots.find(s => s.kind === 'haunt' && s.accepting && !done.has(s.key));
      if (haunt) {
        live.current.engine.openSheetAt(haunt.key);
        log('haunt-tap', haunt.key);
        await sleep(8000);
        await teleport(haunt);
        await live.current.engine.enter(haunt);
        log('in-line', haunt.key);
        await sleep(8000);
        live.current.engine.setSheetOpen(false);
        log('in-line-map');
        await waitFor('canSurvive', () => live.current.engine.canSurvive, 15 * 60_000);
        await live.current.engine.survived();
        log('finish', haunt.key);
        await waitFor('rank', () => !!live.current.engine.rank, 15_000);
        log('rank');
        await sleep(9000); // RankCard: pick at 2.5 s, send at 5 s, stamp shows
        log('rank-payoff');
        await closeModals();
      } else log('no-haunt');

      const encounter = live.current.night.tonight?.encounter;
      // The encounter swims at a reef: hold the nearest reef for its Case File, then catch.
      const reefs = live.current.night.tonight?.spots.filter(s => s.kind === 'reef') ?? [];
      const near = (s: Point) => (encounter ? Math.hypot(s.latitude - encounter.latitude, s.longitude - encounter.longitude) : 0);
      const reef = [...reefs].sort((a, b) => near(a) - near(b))[0];
      if (reef) {
        await teleport(reef);
        log('reef-hold', reef.key);
        await waitFor('case-file', () => !!live.current.engine.caseFile, 120_000);
        log('case-file');
        await sleep(7000);
        live.current.engine.closeCaseFile();
        await sleep(2000);
        await closeModals();
      }
      if (live.current.engine.encounter && !live.current.engine.encounter.caught) {
        if (encounter) await teleport(encounter);
        log('encounter', live.current.engine.encounter.name);
        await sleep(5000);
        await live.current.engine.catchEncounter();
        log('catch');
        await closeModals();
      } else log('no-encounter');

      const slug = live.current.night.tonight?.event?.slug;
      const nightOn = live.current.night.tonight?.night?.night_on;
      if (slug && nightOn) {
        live.current.engine.openMarquee(slug, nightOn);
        log('recap');
        await sleep(10000);
        live.current.engine.closeMarquee();
        await sleep(2000);
      }
      RootNavigation.navigate('Store', { store: storeId });
      log('shelf');
      await sleep(12000);
      RootNavigation.navigate('PinCollections');
      log('pins');
      await sleep(12000);
      RootNavigation.navigate('Profile');
      log('wardrobe');
      await sleep(12000);
      if (slug) RootNavigation.navigate('FrightCard', { eventSlug: slug });
      log('card');
      await sleep(12000);
      log('end');
    })().catch(error => log('error', String(error)));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
