/**
 * Every word on a flex card, worked out from the payload. Pure, no React, so
 * the rules (no usernames, no dates, no places, "My ..." phrasing, when the
 * percent-of-players line shows) are unit tested in one place.
 */
import { PLACE_NAMES } from './placeNames';
import type { FlexCopy, FlexKind, FlexPayload, FlexPayloads, FlexRarity, FrameKey, RarityInput } from './types';

export const RARITY_LABELS: Readonly<Record<FlexRarity, string>> = {
  1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary',
};

const RARITY_NAMES: Readonly<Record<string, FlexRarity>> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

/** 1..5 from a number or a rarity name; unknown is Common. */
export function normalizeRarity(input: RarityInput | null | undefined): FlexRarity {
  if (typeof input === 'string') return RARITY_NAMES[input.toLowerCase()] ?? 1;
  const n = Math.round(Number(input));
  return (n >= 1 && n <= 5 ? n : 1) as FlexRarity;
}

/** The percent-of-players line only shows when it is a real brag. */
export const OWNED_PCT_MAX = 0.25;

/** "Only 3% of players have this" / "Under 1% of players have this", or null. */
export function ownedLine(pct: number | null | undefined, verb = 'have this'): string | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > OWNED_PCT_MAX) return null;
  if (pct < 0.01) return `Under 1% of players ${verb}`;
  return `Only ${Math.max(1, Math.round(pct * 100))}% of players ${verb}`;
}

const HANDLE = /@[\w.]+/g;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL = /\S+@\S+\.\S+/g;
const LONG_DIGITS = /\d{5,}/g;

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Any park, resort, land, franchise or ride name, as a whole phrase, any case. */
const PLACE = new RegExp(`(^|[^A-Za-z0-9])(?:${PLACE_NAMES.map(escapeRe).join('|')})(?=$|[^A-Za-z0-9])`, 'gi');

/**
 * Catalog names and server lines only, but scrub anything that could carry
 * personal data or pin a place: a handle, an email, a link, a long number, or
 * a park/ride name (a live Story from the park must not say where the kid is).
 */
export function cleanName(value: string | null | undefined, max = 34): string {
  const raw = String(value ?? '')
    .replace(EMAIL, '')
    .replace(URL_LIKE, '')
    .replace(HANDLE, '')
    .replace(LONG_DIGITS, '');
  const unplaced = raw.replace(PLACE, '$1');
  // "survived at Universal!" -> "survived!": drop the preposition a removed place leaves behind.
  const text = (unplaced === raw ? raw : unplaced.replace(/\s+(?:at|in|on|from|to|of)(?=\s*(?:[!.?,]|$))/gi, ''))
    .replace(/\s+([,.!?:])/g, '$1')
    .replace(/^[\s,.:;\-–·]+|[\s,:;\-–·]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${tail}`;
}

function count(n: number | null | undefined): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

type CopyFn<K extends FlexKind> = (p: FlexPayloads[K]) => Omit<FlexCopy, 'a11y'>;

const COPY: { readonly [K in FlexKind]: CopyFn<K> } = {
  crowned: p => ({
    ribbon: 'SHARK CROWN!',
    kicker: 'My Crowned Ride Coin',
    title: cleanName(p.tierName || 'Shark Crown'),
    big: 'LV 10',
    stat: ownedLine(p.ownedPct, 'have crowned one') ?? 'Maxed out to Level 10',
    sub: count(p.timesCollected) ? `Ridden and won ${plural(count(p.timesCollected), 'time')}` : null,
    cta: 'Can you crown one?',
    frame: 'royal',
    rarity: null,
  }),

  find: p => {
    const rarity = normalizeRarity(p.rarity);
    const label = RARITY_LABELS[rarity];
    const brag = ownedLine(p.ownedPct, 'have found one')
      ?? (p.goldenHour ? 'Caught in the Golden Hour' : null)
      ?? (p.dailyRare ? 'The Daily Rare' : null)
      ?? `A ${label} find`;
    return {
      ribbon: p.goldenHour ? 'GOLDEN HOUR!' : rarity >= 3 ? `${label.toUpperCase()} FIND!` : 'NEW FIND!',
      kicker: `My ${label} Find`,
      title: cleanName(p.itemName),
      big: null,
      stat: brag,
      sub: p.setName ? `${cleanName(p.setName, 24)} set` : null,
      cta: 'Can you find one?',
      frame: 'collection',
      rarity,
    };
  },

  ride_photo: p => {
    const rarity = normalizeRarity(p.rarity);
    const grade = p.grade === 'frame_it' ? 'Frame It!' : p.grade === 'great' ? 'Great shot' : 'Nice shot';
    return {
      ribbon: p.grade === 'frame_it' ? 'FRAME IT!' : p.grade === 'great' ? 'GREAT SHOT!' : 'NICE SHOT!',
      kicker: 'My Ride Photo',
      title: cleanName(p.itemName),
      big: null,
      stat: `${grade} on a${rarity === 2 || rarity === 4 ? 'n' : ''} ${RARITY_LABELS[rarity]}`,
      sub: p.goldenHour ? 'Golden Hour light' : ownedLine(p.ownedPct, 'have found one'),
      cta: 'Snap one yourself!',
      frame: 'photo',
      rarity,
    };
  },

  set_complete: p => {
    const total = count(p.total);
    const found = Math.min(count(p.found), total || count(p.found));
    return {
      ribbon: 'SET COMPLETE!',
      kicker: p.source === 'shop' ? 'My Complete Look' : 'My Collection',
      title: cleanName(p.setName),
      big: total ? `${found}/${total}` : null,
      stat: ownedLine(p.ownedPct, 'have finished it') ?? 'The whole set, collected',
      sub: p.title ? `Title earned: ${cleanName(p.title, 24)}` : null,
      cta: 'Can you finish it?',
      frame: 'collection',
      rarity: null,
    };
  },

  boss_win: p => ({
    ribbon: 'BOSS TAMED!',
    kicker: 'My Ride Boss Win',
    title: cleanName(p.bossName),
    big: null,
    stat: p.difficulty === 'shark' ? 'Tamed on Shark mode' : p.difficulty === 'hard' ? 'Tamed on Hard mode' : 'Tamed it!',
    sub: ownedLine(p.ownedPct, 'have done it')
      ?? (p.mvp ? 'MVP of the fight' : null)
      ?? (p.title ? `Title earned: ${cleanName(p.title, 24)}` : null),
    cta: 'Think you can tame it?',
    frame: 'boss',
    rarity: null,
  }),

  stamp: p => {
    const rarity = normalizeRarity(p.rarity);
    return {
      ribbon: rarity >= 4 ? `${RARITY_LABELS[rarity].toUpperCase()} STAMP!` : 'NEW STAMP!',
      kicker: 'My Stamp Book',
      title: cleanName(p.name),
      big: null,
      stat: ownedLine(p.ownedPct) ?? (p.how ? cleanName(p.how, 40) : `A ${RARITY_LABELS[rarity]} stamp`),
      sub: p.title ? `Title earned: ${cleanName(p.title, 24)}` : null,
      cta: 'Start your Stamp Book!',
      frame: 'passport',
      rarity,
    };
  },

  coin_level: p => {
    const level = Math.max(1, Math.min(10, count(p.level) || 1));
    return {
      ribbon: 'COIN LEVEL UP!',
      kicker: 'My Ride Coin',
      title: `${cleanName(p.tierName || 'Ride', 20)} Coin`,
      big: `LV ${level}`,
      stat: ownedLine(p.ownedPct, 'have one this high') ?? `${cleanName(p.tierName || 'New', 20)} tier unlocked`,
      sub: count(p.timesCollected) ? `Ridden and won ${plural(count(p.timesCollected), 'time')}` : null,
      cta: 'Level up yours!',
      frame: 'coins',
      rarity: null,
    };
  },

  standings: p => {
    const tier = cleanName(p.tierLabel, 20);
    const rank = count(p.rank);
    const pct = p.percentile != null && Number.isFinite(p.percentile) ? Math.max(1, Math.round(p.percentile)) : null;
    return {
      ribbon: `${tier.toUpperCase()}!`,
      kicker: 'My Week',
      title: cleanName(p.boardLabel),
      big: rank && rank <= 3 ? `#${rank}` : pct && pct <= 50 ? `TOP ${pct}%` : null,
      stat: rank && rank <= 3 ? `${ordinal(rank)} place this week` : pct && pct <= 50 ? `Top ${pct}% of all players` : `Finished ${tier}`,
      sub: count(p.points) ? `${count(p.points).toLocaleString('en-US')} points` : null,
      cta: 'Beat my score!',
      frame: 'standings',
      rarity: null,
    };
  },

  fright_night: p => {
    const haunts = count(p.haunts);
    return {
      ribbon: 'NIGHT SURVIVED!',
      kicker: count(p.nightNumber) ? `My Night ${count(p.nightNumber)}` : 'My Night',
      title: cleanName(p.cardTitle),
      big: String(haunts),
      stat: cleanName(p.headline, 40) || `${plural(haunts, 'haunt')} survived!`,
      sub: (p.statLines ?? []).map(line => cleanName(line, 40)).filter(Boolean).slice(0, 1)[0]
        ?? (haunts >= 2 ? `${plural(haunts, 'haunt')} in one night` : null),
      cta: 'Dare to swim in?',
      frame: 'fright',
      rarity: null,
    };
  },

  fright_badge: p => ({
    ribbon: 'HAUNT SURVIVED!',
    kicker: `My ${cleanName(p.cardTitle, 26)}`,
    title: cleanName(p.hauntName),
    big: null,
    stat: count(p.runs) > 1 ? `Survived it ${count(p.runs)} times` : 'Survived it!',
    sub: ownedLine(p.ownedPct, 'have survived it'),
    cta: 'Dare to swim in?',
    frame: 'fright',
    rarity: null,
  }),

  fright_lifetime: p => {
    const n = count(p.hauntsSurvived);
    const bits = [
      count(p.reSwims) ? plural(count(p.reSwims), 're-swim') : null,
      count(p.nights) ? plural(count(p.nights), 'night') : null,
    ].filter(Boolean);
    return {
      ribbon: 'FIN-VESTIGATOR!',
      kicker: 'My Lifetime Count',
      title: p.cardTitle ? cleanName(p.cardTitle) : 'Haunts Survived',
      big: null,
      stat: `${plural(n, 'haunt')} survived`,
      sub: bits.length ? bits.join(' · ') : null,
      cta: 'Dare to swim in?',
      frame: 'fright',
      rarity: null,
    };
  },

  ride_coin: p => {
    const m = p.milestone;
    const pct = m && Number.isFinite(m.percent) ? Math.round(m.percent) : null;
    return {
      ribbon: p.limited ? 'LIMITED COIN!' : 'NEW RIDE COIN!',
      kicker: 'My Ride Coin',
      title: p.edition?.name ? cleanName(p.edition.name) : p.limited ? 'Limited Ride Coin' : 'Ride Coin',
      big: null,
      stat: pct === 100 ? "Every coin at this park" : pct && pct > 0 ? `${pct}% of this park's coins` : 'Ridden and won',
      sub: ownedLine(p.ownedPct, 'have it'),
      cta: 'Ride and win your own!',
      frame: 'coins',
      rarity: null,
    };
  },

  streak: p => {
    const days = count(p.days);
    return {
      ribbon: 'ON FIRE!',
      kicker: 'My Streak',
      title: `${days}-Day Streak`,
      big: null,
      stat: `${plural(days, 'day')} in a row`,
      sub: count(p.best) > days ? `Best ever: ${plural(count(p.best), 'day')}` : null,
      cta: 'Can you beat my streak?',
      frame: 'streak',
      rarity: null,
    };
  },

  level_up: p => {
    const level = count(p.level) || 1;
    return {
      ribbon: 'LEVEL UP!',
      kicker: 'My Shark',
      title: `Level ${level}`,
      big: null,
      stat: `Reached Level ${level}`,
      sub: p.unlockName ? `Unlocked: ${cleanName(p.unlockName, 24)}` : null,
      cta: 'Catch up to me!',
      frame: 'progress',
      rarity: null,
    };
  },

  title: p => ({
    ribbon: 'NEW TITLE!',
    kicker: 'My Title',
    title: cleanName(p.title, 26),
    big: null,
    stat: ownedLine(p.ownedPct) ?? (p.how ? cleanName(p.how, 40) : 'Earned, not bought'),
    sub: null,
    cta: 'Earn yours!',
    frame: 'royal',
    rarity: null,
  }),

  park_day: p => {
    const n = count(p.coinsCaught);
    return {
      ribbon: 'PARK DAY!',
      kicker: 'My Park Day',
      title: `${plural(n, 'Ride Coin')}`,
      big: String(n),
      stat: n === 1 ? 'Ride coin in one day' : 'Ride coins in one day',
      sub: count(p.newCoins) ? `${plural(count(p.newCoins), 'new one')} for my shelf` : null,
      cta: 'Catch the coins I missed!',
      frame: 'coins',
      rarity: null,
    };
  },
};

const FALLBACK_TITLE: Readonly<Record<FlexKind, string>> = {
  crowned: 'Shark Crown', find: 'A New Find', ride_photo: 'Ride Photo', set_complete: 'Full Set', boss_win: 'Ride Boss',
  stamp: 'New Stamp', coin_level: 'Ride Coin', standings: 'This Week', fright_night: 'Night Survived', fright_badge: 'A Haunt',
  fright_lifetime: 'Haunts Survived', ride_coin: 'Ride Coin', streak: 'Streak', level_up: 'Level Up', title: 'New Title', park_day: 'Park Day',
};

export function flexCopy<K extends FlexKind>(kind: K, payload: FlexPayload<K>): FlexCopy {
  const fn = COPY[kind] as CopyFn<K> | undefined;
  if (!fn) throw new Error(`Unknown flex kind: ${String(kind)}`);
  const raw = fn(payload);
  // A name scrubbed down to nothing still needs a title.
  const base = raw.title ? raw : { ...raw, title: FALLBACK_TITLE[kind] };
  const a11y = [base.ribbon, base.kicker, base.title, base.big, base.stat, base.sub].filter(Boolean).join('. ');
  return { ...base, a11y };
}

/**
 * Should this earn get the full-screen Flex moment? Only real brags: the
 * share button still lives on everything, but the reveal is saved for these.
 */
export function shouldFlexReveal<K extends FlexKind>(kind: K, payload: FlexPayload<K>): boolean {
  const p = payload as FlexPayload & Record<string, unknown>;
  const owned = typeof p.ownedPct === 'number' && p.ownedPct <= OWNED_PCT_MAX;
  switch (kind) {
    case 'crowned': case 'set_complete': case 'boss_win': case 'title': return true;
    case 'find': return owned || !!p.goldenHour || !!p.dailyRare || normalizeRarity(p.rarity as RarityInput) >= 3;
    case 'ride_photo': return p.grade === 'frame_it' || (p.grade === 'great' && normalizeRarity(p.rarity as RarityInput) >= 4);
    case 'stamp': return owned || normalizeRarity(p.rarity as RarityInput) >= 3;
    case 'coin_level': return Number(p.level) >= 5;
    case 'standings': {
      const rank = Number(p.rank);
      const pct = Number(p.percentile);
      return (rank >= 1 && rank <= 3) || (pct > 0 && pct <= 25);
    }
    case 'fright_night': return Number(p.haunts) >= 3;
    case 'fright_badge': return Number(p.runs) >= 3 || owned;
    case 'fright_lifetime': return Number(p.hauntsSurvived) >= 10 && Number(p.hauntsSurvived) % 10 === 0;
    case 'ride_coin': return !!p.limited || Number((p.milestone as { percent?: number } | null)?.percent) === 100;
    case 'streak': return [3, 7, 14, 30, 50, 100].includes(Number(p.days)) || (Number(p.days) > 100 && Number(p.days) % 50 === 0);
    case 'level_up': return Number(p.level) % 5 === 0;
    case 'park_day': return Number(p.coinsCaught) >= 5;
  }
  return false;
}
