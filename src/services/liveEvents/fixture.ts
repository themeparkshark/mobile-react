import type { EventChest, EventReward, LiveEvent } from '../../api/endpoints/live-events';

/** Golden Reef Week as the server sends it (dev preview and tests only). */
const R = (r: Partial<EventReward>): EventReward => ({ coins: 0, tickets: 0, energy: 0, xp: 0, item: null, ...r });

function chests(prefix: 'p' | 't', goals: number[], value: number, rewards: EventReward[], claimed: number, helped = true): EventChest[] {
  return goals.map((points, i) => ({
    key: `${prefix}${i + 1}`, points, reward: rewards[i], reached: value >= points,
    claimed: i < claimed, claimable: value >= points && i >= claimed && helped,
  }));
}

export function goldenReefFixture(opts: { mine?: number; total?: number; claimed?: number; frenzy?: boolean; phase?: LiveEvent['phase']; here?: boolean; now?: number } = {}): LiveEvent {
  const now = opts.now ?? Date.now();
  const mine = opts.mine ?? 9;
  const total = opts.total ?? 140;
  const phase = opts.phase ?? 'live';
  const claimed = opts.claimed ?? 1;
  const hour = 3600_000;
  return {
    id: 1, slug: 'golden-reef-week-2026', title: 'Golden Reef Week', tagline: 'Fill the reef!', art_key: 'golden_reef',
    theme: { primary: '#0b7fd1', accent: '#ffc629', deep: '#05346e' }, phase,
    starts_at: new Date(phase === 'upcoming' ? now + 30 * hour : now - 26 * hour).toISOString(),
    ends_at: new Date(phase === 'ended' ? now - 2 * hour : now + 4 * 24 * hour).toISOString(),
    claim_until: new Date(now + 9 * 24 * hour).toISOString(), server_now: new Date(now).toISOString(),
    how_to: [{ icon: 'win_find', text: 'Win and find' }, { icon: 'fill', text: 'Fill the reef' }, { icon: 'chest', text: 'Open chests' }],
    points: { home_find: 1, ride_win: 4, spotlight_win: 8, boss_hit: 1 }, daily_caps: { home_find: 8, boss_hit: 8 },
    here: opts.here ?? true, include_home: true,
    frenzy: { active: !!opts.frenzy && phase === 'live', ends_at: opts.frenzy ? new Date(Math.ceil((now + 1) / hour) * hour).toISOString() : null,
      next_starts_at: opts.frenzy ? null : new Date(now + 3 * hour).toISOString(), multiplier: 2,
      hours: [{ from: '12:00', to: '13:00' }, { from: '18:00', to: '19:00' }] },
    star_rides: phase === 'live' ? [
      { task_id: 101, name: 'Matterhorn Bobsleds', latitude: 33.8128, longitude: -117.9179 },
      { task_id: 102, name: 'Big Thunder Mountain Railroad', latitude: 33.8124, longitude: -117.9203 },
      { task_id: 103, name: 'Astro Orbitor', latitude: 33.8115, longitude: -117.9175 },
    ] : [],
    me: { points: mine, team: 'shark', helped: mine >= 1,
      chests: chests('p', [4, 12, 30, 60], mine, [R({ coins: 50, energy: 15 }), R({ coins: 100, tickets: 1 }), R({ coins: 200, tickets: 2, xp: 100 }),
        R({ coins: 300, tickets: 2, item: { id: 9, name: 'Golden Reef Snorkel', image: null } })], phase === 'upcoming' ? 0 : claimed) },
    together: { total, goal: 270, min_personal: 1,
      chests: chests('t', [36, 120, 270], total, [R({ tickets: 1, energy: 20 }), R({ coins: 150, energy: 30 }), R({ coins: 250, tickets: 2 })], phase === 'upcoming' ? 0 : 1, mine >= 1) },
    team_race: { scores: { mouse: 21, globe: 34, shark: 27 }, leaders: ['globe'], winners: phase === 'ended' ? ['globe'] : [], min_personal: 4,
      reward_all: R({ coins: 100 }), reward_winner: R({ coins: 150, tickets: 1 }), you_won: false, claimed: false,
      claimable: phase === 'ended' && mine >= 4 },
  };
}
