/**
 * MemoryRaceRound.tsx: a live Line Party round of Memory Race.
 *
 * LineParty renders this instead of the Bonk board when the server schedules
 * `memory_race`. Humans come from 4 Hz whispers (display only, 250ms behind);
 * crew seats are replayed locally with the same engine the server uses, so
 * every phone shows the same crew progress. The tap log goes through the
 * PartyClient exactly like Bonk Race, and the server replays it (PHP port of
 * engine.ts, golden vectors in engine.vectors.json).
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { PartyClient } from '../../../gamekit/net/PartyClient';
import type { PartyState } from '../../../gamekit/net/roomState';
import MemoryGame from '../MemoryGame';
import type { MemoryPartyBinding } from './partyBinding';
import { registerMemoryRace } from './partyGame';
import { HOUSE_CREW, frameAt, placements, raceLayout, simulateCrew, type CrewProfile, type CrewSeat } from './raceSim';
import type { Racer } from './RivalStrip';

registerMemoryRace();

const SHARK_FOR_BOT: Record<string, Racer['shark']> = {
  'bot:captain': 'blue', 'bot:bubbles': 'pink', 'bot:chomps': 'red', 'bot:coral': 'orange', 'bot:tidal': 'green',
};
const HUMAN_SHARKS: Racer['shark'][] = ['classic', 'green', 'orange', 'pink'];

export default function MemoryRaceRound({ client, state }: { client: PartyClient; state: PartyState }) {
  const round = state.room?.round ?? null;
  const seed = round?.seed ?? 0;
  const layout = useMemo(() => raceLayout(seed), [seed]);
  const crewRuns = useMemo(() => {
    const m = new Map<number, ReturnType<typeof simulateCrew>>();
    round?.seats.forEach((s) => {
      if (s.kind !== 'bot') return;
      const base = HOUSE_CREW.find((c) => c.id === s.avatar_url) ?? HOUSE_CREW[0];
      const seat: CrewSeat = { ...base, name: s.name, profile: (s.profile as CrewProfile) ?? base.profile };
      m.set(s.seat, simulateCrew(seed, s.seat, seat, layout));
    });
    return m;
  }, [round?.id, seed, layout]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const mine = useRef({ score: 0, chain: 0 });

  const racers = useCallback((): Racer[] => {
    const st = stateRef.current;
    const r = st.room?.round;
    if (!r) return [];
    const t = client.boardTime() ?? 0;
    const emoteBy = new Map(st.emotes.map((e) => [e.user_id, { id: e.emote, at: e.receivedAt }]));
    const rows = r.seats.map((seat, i) => {
      const me = seat.kind === 'human' && seat.user_id === st.userId;
      if (seat.kind === 'bot') {
        const run = crewRuns.get(seat.seat);
        const f = run ? frameAt(run, t) : { pairs: 0, chain: 0, score: 0, showtime: false };
        return {
          key: `s${seat.seat}`, name: seat.name, shark: SHARK_FOR_BOT[seat.avatar_url ?? ''] ?? 'blue', pairs: f.pairs, score: f.score,
          chain: f.chain, showtime: f.showtime, me: false, placement: 0, emote: null,
          clearAt: run?.clearAt != null && run.clearAt <= t ? run.clearAt : null,
        };
      }
      const rival = seat.user_id !== undefined ? st.rivals[seat.user_id] : undefined;
      const score = me ? mine.current.score : rival?.score ?? 0;
      return {
        key: `s${seat.seat}`, name: me ? 'YOU' : seat.name, shark: HUMAN_SHARKS[i % HUMAN_SHARKS.length], pairs: -1, score,
        chain: me ? mine.current.chain : rival?.streak ?? 0, showtime: false, me,
        placement: 0, emote: seat.user_id !== undefined ? emoteBy.get(seat.user_id) ?? null : null,
        clearAt: null,
      };
    });
    const place = placements(rows.map((x) => ({ key: x.key, pairs: Math.max(0, x.pairs), score: x.score, clearAt: x.clearAt })));
    return rows.map(({ clearAt: _c, ...x }) => ({ ...x, placement: place[x.key] })).sort((a, b) => a.placement - b.placement);
  }, [client, crewRuns]);

  const binding: MemoryPartyBinding = useMemo(() => ({
    seed,
    boardTime: () => client.boardTime(),
    recordFlip: (slot) => client.recordTap(slot),
    reportProgress: (score, chain) => {
      mine.current = { score, chain };
      client.reportProgress(score, chain);
    },
    racers,
    onBoardDone: () => undefined,
  }), [client, racers, seed]);

  if (!round) return null;
  return (
    <MemoryGame
      key={round.id}
      visible
      party={binding}
      onClose={() => undefined}
      onComplete={() => undefined}
    />
  );
}
