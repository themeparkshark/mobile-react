/**
 * Verified opening-year facts used by the generated formats (Closest Number,
 * Which Opened First, pair "which is older", True or Tall Tale).
 *
 * Every row restates a fact that is already in the app's fact-checked bundled
 * trivia (src/services/lineplay/content.ts and chapters.ts) with the same
 * official source. Nothing here is new research. When WS5 ships verified
 * `rides.metadata` fields the server generator replaces this table.
 */

export interface OpeningFact {
  id: string;
  /** Short label used in question text. */
  name: string;
  year: number;
  parkId?: number;
  source: string;
  sourceUrl: string;
  /** Category shown on the Final card. */
  category: 'Park History' | 'Ride History';
  /** Phrases that mean an authored question already covers this fact. */
  keys: readonly string[];
}

export const OPENING_FACTS: readonly OpeningFact[] = [
  { id: 'dl-park', keys: ['Disneyland first open', 'Disneyland open', '1955'], name: 'Disneyland', year: 1955, parkId: 8, category: 'Park History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/dlr/today-in-disney-history-disneyland-opens-1955/' },
  { id: 'dl-matterhorn', keys: ['Matterhorn'], name: 'Matterhorn Bobsleds', year: 1959, parkId: 8, category: 'Ride History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/dlr/things-you-might-not-know-about-the-matterhorn-at-disneyland-resort/' },
  { id: 'ush-tour', keys: ['Studio Tour'], name: 'the Universal Studio Tour', year: 1964, parkId: 1, category: 'Park History', source: 'Universal Studios Hollywood',
    sourceUrl: 'https://www.universalstudioshollywood.com/auditions' },
  { id: 'dl-pirates', keys: ['Pirates of the Caribbean'], name: 'Pirates of the Caribbean', year: 1967, parkId: 8, category: 'Ride History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/disney-experiences/yo-ho-yo-ho-the-pirates-conquest-from-disneyland-to-the-big-screen/' },
  { id: 'dl-mansion', keys: ['Haunted Mansion'], name: 'Disneyland’s Haunted Mansion', year: 1969, parkId: 8, category: 'Ride History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/dlr/today-in-disney-history-haunted-mansion-opening-date-at-disneyland-in-1969/' },
  { id: 'mk-space', keys: ['Space Mountain'], name: 'Magic Kingdom’s Space Mountain', year: 1975, category: 'Ride History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/wdw/peak-perfection-space-mountain-at-walt-disney-world-celebrates-50-years/' },
  { id: 'dl-space', keys: ['Space Mountain'], name: 'Disneyland’s Space Mountain', year: 1977, parkId: 8, category: 'Ride History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/wdw/peak-perfection-space-mountain-at-walt-disney-world-celebrates-50-years/' },
  { id: 'ak-park', keys: ['Animal Kingdom'], name: 'Disney’s Animal Kingdom', year: 1998, parkId: 6, category: 'Park History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/wdw/disney-world-facts-to-quiz-your-friends-on/' },
  { id: 'dca-park', keys: ['California Adventure'], name: 'Disney California Adventure', year: 2001, parkId: 13, category: 'Park History', source: 'Disney Parks Blog',
    sourceUrl: 'https://disneyparksblog.com/dlr/california-adventure-25th-anniversary-offerings/' },
];
