/**
 * Line Party art. Everything here is Alex's original hand-drawn art, resized
 * (never redrawn): the sticker emotes, the shark colour variants the house
 * bots wear, and the Whack-a-Shark board pieces. Metro needs literal requires.
 */
import type { EmoteId } from '../net/partyTypes';

export const STICKERS: Record<EmoteId, number> = {
  foam_finger: require('../../assets/games/party/sticker-foam-finger.png'),
  sunglasses: require('../../assets/games/party/sticker-sunglasses.png'),
  gift: require('../../assets/games/party/sticker-gift.png'),
  treasure: require('../../assets/games/party/sticker-treasure.png'),
  fin: require('../../assets/games/party/sticker-fin.png'),
  compass: require('../../assets/games/party/sticker-compass.png'),
  coin: require('../../assets/games/party/sticker-coin.png'),
  bowtie: require('../../assets/games/party/sticker-bowtie.png'),
};

/** Short spoken label per sticker for VoiceOver (no text is ever shown). */
export const STICKER_LABEL: Record<EmoteId, string> = {
  foam_finger: 'Number one foam finger',
  sunglasses: 'Too cool sunglasses',
  gift: 'Gift for you',
  treasure: 'Jackpot chest',
  fin: 'Fin bump',
  compass: 'This way',
  coin: 'Cha-ching coin',
  bowtie: 'Fancy bow tie',
};

export const SHARKS = {
  classic: require('../../assets/games/party/shark-classic.png'),
  green: require('../../assets/games/party/shark-green.png'),
  orange: require('../../assets/games/party/shark-orange.png'),
  pink: require('../../assets/games/party/shark-pink.png'),
  red: require('../../assets/games/party/shark-red.png'),
  blue: require('../../assets/games/party/shark-blue.png'),
} as const;

/** House bots wear Alex's shark colours so they read as crew, not players. */
export const BOT_SHARK: Record<string, number> = {
  'bot:captain': SHARKS.blue,
  'bot:bubbles': SHARKS.pink,
  'bot:chomps': SHARKS.red,
  'bot:coral': SHARKS.orange,
  'bot:tidal': SHARKS.green,
};

export const BOARD = {
  playfield: require('../../../assets/images/screens/lineplay/whack-underwater-playfield-v1.png'),
  hole: require('../../assets/games/whack/hole.png'),
  lure: require('../../assets/games/whack/anglerfish-decoy.png'),
  golden: require('../../assets/games/whack/golden-shark.png'),
  finn: [
    require('../../assets/games/whack/themes/park/peek.png'),
    require('../../assets/games/whack/themes/park/pop.png'),
    require('../../assets/games/whack/themes/park/dazed.png'),
  ],
  ribbon: require('../../../assets/images/ribbon.png'),
} as const;

/**
 * Splash bubble (design 7.1.4, 13.11): gate-passed pipeline art from Alex's
 * references (studio art/line-party, @3x exports): the idle soap bubble that
 * seals a hole, the crack wobble (pop f0/f1) and the burst (f2/f3).
 */
export const BUBBLE = {
  idle: require('../../assets/games/party/soap_bubble.png'),
  crack: [require('../../assets/games/party/lp_bubble_pop_f0.png'), require('../../assets/games/party/lp_bubble_pop_f1.png')],
  burst: [require('../../assets/games/party/lp_bubble_burst_f2.png'), require('../../assets/games/party/lp_bubble_burst_f3.png')],
} as const;

/** Team ring colours (bright world palette, never purple or neon). */
export const TEAM_RING: Record<string, string> = {
  blue: '#1f8fff',
  gold: '#ffcf3b',
  red: '#ef4a3c',
  green: '#3cb85c',
};
