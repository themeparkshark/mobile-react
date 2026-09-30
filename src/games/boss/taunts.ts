/**
 * Boss taunt lines (design 7.4, Hades-style): one short speech bubble at KO
 * or Retreat, picked by the round's result. No voice, no emoji.
 */
import type { BossId } from './sim/constants';

const LINES: Record<BossId, { zero: string[]; low: string[]; mid: string[]; high: string[]; ko: string[]; hat: string }> = {
  kraken: {
    zero: ['Come back when you can hear the bell!', 'Splish splash, try again!'],
    low: ['Is that all, little fin?', 'My tentacles barely noticed.'],
    mid: ['Hmph. Not bad for a shark.', 'You found the rhythm... for now.'],
    high: ['...lucky splash.', 'Okay, okay, that one stung!'],
    ko: ['NOT MY LAGOON!', 'I will be back for my hat!'],
    hat: 'My HAT!',
  },
  robo_shark: {
    zero: ['ERROR: challenger not found.', 'Try reading the circuit next time.'],
    low: ['Minor scratch detected.', 'Recalibrating... you are no threat.'],
    mid: ['Warning: shark competence rising.', 'Hmm. Unexpected input.'],
    high: ['System... overheating...', 'That was NOT in my programming!'],
    ko: ['SHUTTING... DOWN...', 'Rebooting. This is not over!'],
    hat: 'My VISOR!',
  },
  ghost_squid: {
    zero: ['Boo! You picked the wrong one!', 'Now you see me... now you do not.'],
    low: ['Spooky, right?', 'You are chasing shadows.'],
    mid: ['You can see me? Rude.', 'Hmm, sharp eyes.'],
    high: ['How are you so good at this?!', 'Stop finding me!'],
    ko: ['I am fading... fading...', 'Poof! I will haunt you later!'],
    hat: 'My FRILL!',
  },
};

export function tauntFor(boss: BossId, stars: number, ko: boolean, breaks: number): string {
  const l = LINES[boss];
  const pick = (a: string[]) => a[(stars + breaks) % a.length];
  if (ko) return pick(l.ko);
  if (stars === 0) return pick(l.zero);
  if (stars === 1) return pick(l.low);
  if (stars === 2) return breaks > 0 && breaks % 2 === 1 ? l.hat : pick(l.mid);
  return pick(l.high);
}
