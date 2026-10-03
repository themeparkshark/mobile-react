/**
 * Every word on a flex card, worked out from the payload. Pure, no React, so
 * the rules (no usernames, no dates, no places, "My ..." phrasing, when the
 * percent-of-players line shows) are unit tested in one place.
 */
import { PLACE_NAMES } from './placeNames';
import { US_CITIES } from './usCities';
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
const PLACE = new RegExp(`(^|[^A-Za-z0-9])(?:${PLACE_NAMES.map(escapeRe).join('|')})(?:['’]s)?(?=$|[^A-Za-z0-9])`, 'gi');
/** Any US city (home areas are labelled by city): built once, longest first. */
const CITY = new RegExp(`(^|[^A-Za-z0-9])(?:${US_CITIES.map(escapeRe).join('|')})(?:['’]s)?(?=$|[^A-Za-z0-9])`, 'gi');
/** A home-area label ("Tampa Area", "Phoenix Region", "Your Area", "Orange County"): never on a card. */
const AREA = /(?:\b[A-Za-z][\w.'’-]*\s+){0,3}(?:Area|Region|County|Metro)\b(?:\s+\d+\b)?/gi;
/** A possessive a removed name leaves behind ("'s Coin"). */
const ORPHAN_POSSESSIVE = /(^|\s)['’]s\b/g;

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
  const unplaced = raw.replace(PLACE, '$1').replace(AREA, '').replace(CITY, '$1').replace(ORPHAN_POSSESSIVE, '$1');
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


/** Percent-of-players line: only kinds the server can actually count (GET /me/flex/rarity). */
export const OWNED_KINDS: ReadonlySet<FlexKind> = new Set<FlexKind>(['find', 'stamp', 'set_complete', 'coin_level', 'crowned']);

/** "3%" for the giant number, or null when it isn't a real brag. */
function ownedBig(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > OWNED_PCT_MAX) return null;
  return pct < 0.01 ? '<1%' : `${Math.max(1, Math.round(pct * 100))}%`;
}

/** Event titles carry no year (cards never carry dates). */
function noYear(text: string): string {
  return text.replace(/\s*\b(?:19|20)\d\d\b\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "Legendary Golden Churro" on a Legendary chip reads twice: drop the leading rarity word. */
function noRarityWord(name: string, label: string): string {
  const stripped = name.replace(new RegExp(`^${label}\\s+`, 'i'), '');
  return stripped.length >= 3 ? stripped : name;
}

const RARITY_FRAME: Readonly<Record<FlexRarity, FrameKey>> = {
  1: 'common', 2: 'uncommon', 3: 'rare', 4: 'epic', 5: 'legendary',
};

type CopyCore = Omit<FlexCopy, 'a11y' | 'bigLabel' | 'prop' | 'hideShark'> & Partial<Pick<FlexCopy, 'bigLabel' | 'prop' | 'hideShark'>>;
type CopyFnCore<K extends FlexKind> = (p: FlexPayloads[K], owned: number | null) => CopyCore;

const COPY: { readonly [K in FlexKind]: CopyFnCore<K> } = {
  crowned: (p, owned) => ({
    ribbon: 'SHARK CROWN!',
    kicker: 'My Crowned Ride Coin',
    title: 'Shark Crown',
    big: 'LV 10',
    stat: ownedLine(owned, 'have crowned one') ?? 'Maxed out, the top tier',
    sub: count(p.timesCollected) ? `Ridden and won ${plural(count(p.timesCollected), 'time')}` : null,
    cta: 'Can you crown one?',
    frame: 'royal',
    prop: null,
    rarity: null,
  }),

  find: (p, owned) => {
    const rarity = normalizeRarity(p.rarity);
    const label = RARITY_LABELS[rarity];
    const pct = ownedBig(owned);
    const found = count(p.setFound);
    const total = count(p.setTotal);
    const setName = p.setName ? cleanName(p.setName, 22) : '';
    const progress = total && found ? `${Math.min(found, total)} of ${total}${setName ? ` ${setName}` : ''}` : setName ? `${setName} set` : null;
    return {
      ribbon: p.goldenHour ? 'GOLDEN HOUR!' : rarity >= 3 ? `${label.toUpperCase()} FIND!` : 'NEW FIND!',
      kicker: `My ${label} Find`,
      title: noRarityWord(cleanName(p.itemName), label),
      big: pct ?? (total && found ? `${Math.min(found, total)}/${total}` : null),
      bigLabel: pct ? 'OF PLAYERS HAVE ONE' : total && found ? 'IN THE SET' : null,
      stat: p.goldenHour ? 'Caught in the Golden Hour' : p.dailyRare ? 'The Daily Rare' : `A ${label} find`,
      sub: pct ? progress : (total && found ? (setName ? `${setName} set` : null) : progress),
      cta: 'Can you find one?',
      frame: p.goldenHour ? 'golden' : RARITY_FRAME[rarity],
      prop: 'magnifier',
      rarity,
    };
  },

  ride_photo: p => {
    const rarity = normalizeRarity(p.rarity);
    const grade = p.grade === 'frame_it' ? 'Frame It!' : p.grade === 'great' ? 'Great shot' : 'Nice shot';
    return {
      ribbon: p.grade === 'frame_it' ? 'FRAME IT!' : p.grade === 'great' ? 'GREAT SHOT!' : 'NICE SHOT!',
      kicker: 'My Ride Photo',
      title: noRarityWord(cleanName(p.itemName), RARITY_LABELS[rarity]),
      big: null,
      stat: `${grade} on a${rarity === 2 || rarity === 4 ? 'n' : ''} ${RARITY_LABELS[rarity]}`,
      sub: p.goldenHour ? 'Golden Hour light' : null,
      cta: 'Snap one yourself!',
      frame: p.goldenHour ? 'golden' : 'photo',
      hideShark: true,
      rarity,
    };
  },

  set_complete: (p, owned) => {
    const total = count(p.total);
    const found = Math.min(count(p.found), total || count(p.found));
    return {
      ribbon: 'SET COMPLETE!',
      kicker: p.source === 'shop' ? 'My Complete Look' : 'My Collection',
      title: cleanName(p.setName),
      big: total ? `${found}/${total}` : null,
      bigLabel: total ? 'COLLECTED' : null,
      stat: ownedLine(owned, 'have finished it') ?? 'The whole set, done!',
      sub: p.title ? `Title earned: ${cleanName(p.title, 24)}` : null,
      cta: 'Can you finish it?',
      frame: 'legendary',
      prop: 'treasure',
      rarity: null,
    };
  },

  boss_win: p => ({
    ribbon: 'BOSS TAMED!',
    kicker: 'My Ride Boss Win',
    title: cleanName(p.bossName),
    big: 'KO!',
    stat: p.difficulty === 'shark' ? 'Tamed on Shark mode' : p.difficulty === 'hard' ? 'Tamed on Hard mode' : 'Tamed it!',
    sub: p.mvp ? 'MVP of the fight' : p.title ? `Title earned: ${cleanName(p.title, 24)}` : null,
    cta: 'Think you can tame it?',
    frame: 'boss',
    prop: 'foam-finger',
    rarity: null,
  }),

  stamp: (p, owned) => {
    const rarity = normalizeRarity(p.rarity);
    const pct = ownedBig(owned);
    return {
      ribbon: rarity >= 4 ? `${RARITY_LABELS[rarity].toUpperCase()} STAMP!` : 'NEW STAMP!',
      kicker: 'My Stamp Book',
      title: cleanName(p.name),
      big: pct,
      bigLabel: pct ? 'OF PLAYERS HAVE IT' : null,
      stat: p.how ? cleanName(p.how, 40) : `A ${RARITY_LABELS[rarity]} stamp`,
      sub: p.title ? `Title earned: ${cleanName(p.title, 24)}` : null,
      cta: 'Start your Stamp Book!',
      frame: 'passport',
      prop: 'compass',
      hideShark: !!p.artHasShark,
      rarity,
    };
  },

  coin_level: (p, owned) => {
    const level = Math.max(1, Math.min(10, count(p.level) || 1));
    const tier = cleanName(p.tierName || 'New', 20);
    return {
      ribbon: 'COIN LEVEL UP!',
      kicker: 'My Ride Coin',
      title: `${tier} Coin`,
      big: `LV ${level}`,
      stat: ownedLine(owned, 'have one this high') ?? `${tier} tier unlocked`,
      sub: count(p.timesCollected) ? `Ridden and won ${plural(count(p.timesCollected), 'time')}` : null,
      cta: 'Level up yours!',
      frame: 'coins',
      prop: 'coins',
      rarity: null,
    };
  },

  standings: p => {
    const tier = cleanName(p.tierLabel, 20) || 'Hunter';
    const rank = count(p.rank);
    const pct = p.percentile != null && Number.isFinite(p.percentile) ? Math.max(1, Math.round(p.percentile)) : null;
    const podium = rank >= 1 && rank <= 3;
    return {
      ribbon: podium ? 'PODIUM!' : `${tier.toUpperCase()}!`,
      kicker: 'My Home Hunt Week',
      title: podium ? `${ordinal(rank)} Place!` : pct && pct <= 50 ? `Top ${pct}%` : tier,
      big: podium ? `#${rank}` : pct && pct <= 50 ? `TOP ${pct}%` : null,
      bigLabel: podium ? 'THIS WEEK' : pct && pct <= 50 ? 'OF ALL PLAYERS' : null,
      stat: count(p.points) ? `${count(p.points).toLocaleString('en-US')} points` : 'Out-hunted almost everyone',
      sub: null,
      cta: 'Beat my score!',
      frame: 'standings',
      // The "#1" finger only for a first place; the trophy is already the hero.
      prop: rank === 1 ? 'foam-finger' : null,
      rarity: null,
    };
  },

  fright_night: p => {
    const haunts = count(p.haunts);
    const line = (p.statLines ?? []).map(item => cleanName(item, 40)).filter(Boolean)[0];
    return {
      ribbon: 'NIGHT SURVIVED!',
      kicker: count(p.nightNumber) ? `My Night ${count(p.nightNumber)}` : 'My Night',
      title: noYear(cleanName(p.cardTitle)) || 'Fright Night',
      big: String(haunts),
      bigLabel: haunts === 1 ? 'HAUNT SURVIVED' : 'HAUNTS SURVIVED',
      stat: line ?? (haunts >= 2 ? 'All in one night' : 'Brave enough!'),
      sub: null,
      cta: 'Dare to swim in?',
      frame: 'fright',
      prop: 'lantern',
      rarity: null,
    };
  },

  fright_badge: p => {
    const runs = count(p.runs);
    return {
      ribbon: 'HAUNT SURVIVED!',
      kicker: `My ${noYear(cleanName(p.cardTitle, 26)) || 'Fright Night'}`,
      title: cleanName(p.hauntName),
      big: runs > 1 ? `x${runs}` : null,
      bigLabel: runs > 1 ? 'TIMES THROUGH' : null,
      stat: runs >= 3 ? 'Brave enough to swim back in' : 'Survived it!',
      sub: null,
      cta: 'Dare to swim in?',
      frame: 'fright',
      prop: 'lantern',
      rarity: null,
    };
  },

  fright_lifetime: p => {
    const n = count(p.hauntsSurvived);
    const bits = [
      count(p.reSwims) ? plural(count(p.reSwims), 're-swim') : null,
      count(p.nights) ? plural(count(p.nights), 'night') : null,
    ].filter(Boolean);
    return {
      ribbon: 'FIN-VESTIGATOR!',
      kicker: 'My Lifetime Count',
      title: 'All My Fright Nights',
      big: String(n),
      bigLabel: n === 1 ? 'HAUNT SURVIVED' : 'HAUNTS SURVIVED',
      stat: bits.length ? bits.join(' · ') : 'And counting',
      sub: count(p.events) > 1 ? `${plural(count(p.events), 'season')} strong` : null,
      cta: 'Dare to swim in?',
      frame: 'fright',
      prop: 'lantern',
      rarity: null,
    };
  },

  ride_coin: p => {
    const m = p.milestone;
    const pct = m && Number.isFinite(m.percent) ? Math.round(m.percent) : null;
    const show = pct != null && pct >= 50;
    return {
      ribbon: p.limited ? 'LIMITED COIN!' : 'NEW RIDE COIN!',
      kicker: 'My Ride Coin',
      title: p.edition?.name ? cleanName(p.edition.name) || 'Ride Coin Edition' : p.limited ? 'Limited Ride Coin' : 'New Ride Coin',
      big: show ? `${pct}%` : null,
      bigLabel: show ? "OF THIS PARK'S COINS" : null,
      stat: p.limited ? 'Here for a limited time only' : 'Ridden and won',
      sub: show && pct === 100 ? 'Every coin, collected' : null,
      cta: 'Ride and win your own!',
      frame: 'coins',
      prop: 'coins',
      rarity: null,
    };
  },

  streak: p => {
    const days = count(p.days);
    return {
      ribbon: 'ON FIRE!',
      kicker: 'My Streak',
      title: 'Every Single Day',
      big: String(days),
      bigLabel: 'DAYS IN A ROW',
      stat: count(p.best) > days ? `Best ever: ${plural(count(p.best), 'day')}` : 'My best streak yet',
      sub: null,
      cta: 'Can you beat my streak?',
      frame: 'streak',
      prop: 'flame',
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
      stat: p.unlockName ? `Unlocked: ${cleanName(p.unlockName, 24)}` : 'Leveled up!',
      sub: null,
      cta: 'Catch up to me!',
      frame: 'progress',
      prop: 'xp',
      rarity: null,
    };
  },

  title: p => ({
    ribbon: 'NEW TITLE!',
    kicker: 'My Title',
    title: cleanName(p.title, 26),
    big: null,
    stat: p.how ? cleanName(p.how, 40) : 'Earned, not bought',
    sub: null,
    cta: 'Earn yours!',
    frame: 'royal',
    prop: null,
    rarity: null,
  }),

  park_day: p => {
    const n = count(p.coinsCaught);
    const fresh = count(p.newCoins);
    return {
      ribbon: 'PARK DAY!',
      kicker: 'My Ride Coins',
      title: 'In One Park Day',
      big: String(n),
      bigLabel: n === 1 ? 'RIDE COIN' : 'RIDE COINS',
      stat: fresh ? `${fresh} new for my shelf` : 'Ridden and won',
      sub: null,
      cta: 'Catch the coins I missed!',
      frame: 'coins',
      prop: 'coins',
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
  const fn = COPY[kind] as CopyFnCore<K> | undefined;
  if (!fn) throw new Error(`Unknown flex kind: ${String(kind)}`);
  const owned = OWNED_KINDS.has(kind) ? payload.ownedPct ?? null : null;
  const raw = fn(payload as FlexPayloads[K], owned);
  const base: Omit<FlexCopy, 'a11y'> = {
    bigLabel: null, prop: null, hideShark: false, ...raw,
    // A name scrubbed down to nothing still needs a title.
    title: raw.title || FALLBACK_TITLE[kind],
  };
  const a11y = [base.ribbon, base.kicker, base.title, base.big, base.bigLabel, base.stat, base.sub].filter(Boolean).join('. ');
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
