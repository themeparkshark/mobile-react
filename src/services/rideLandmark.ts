/**
 * Map landmarks and Easter eggs picked from a ride's public name alone: a
 * pirate ride gets a ship on its pin and a little ship sailing the nearest
 * water, the snowy mountain gets snowfall, the haunted house gets ghosts and
 * bats. All art is generic (no characters, no logos); only the theme is read
 * from the name, never ride facts.
 */
export type LandmarkId = 'shark' | 'snack' | 'plaza' | 'pirates' | 'space' | 'snow' | 'haunted' | 'tiki' | 'volcano' | 'wizard'
  | 'waterfall' | 'race' | 'train' | 'circus' | 'studio' | 'ocean' | 'city' | 'lighthouse';

export type AmbienceId = 'ship' | 'snow' | 'stars' | 'ufo' | 'ghosts' | 'bats' | 'parrots' | 'hippo' | 'dino'
  | 'owls' | 'dragon' | 'splash' | 'steam' | 'racecar' | 'bubbles' | 'fin' | 'spotlights' | 'fireworks' | 'sparkles'
  | 'aroma' | 'fountain' | 'rush';

export interface RideLook {
  readonly landmark: LandmarkId;
  readonly ambience: readonly AmbienceId[];
}

// First match wins, so the specific rules sit above the broad ones.
const RULES: readonly [RegExp, LandmarkId, readonly AmbienceId[]][] = [
  [/matterhorn|everest|yeti|\bsnow|frozen|arendelle|alpine|bobsled|\bice\b/, 'snow', ['snow']],
  [/gringotts|dragon/, 'wizard', ['dragon', 'sparkles']],
  [/potter|hogwarts|hogsmeade|forbidden journey|hagrid|knight bus|knockturn|diagon|wizard|wand|sword in the stone|merlin/, 'wizard', ['owls', 'sparkles']],
  [/pirate|caribbean|treasure|buccaneer|popeye|\bship\b|\bsail/, 'pirates', ['ship']],
  [/men in black|alien|\be\.?t\.? adventure/, 'space', ['ufo', 'stars']],
  [/space|astro|star tours|starway|smuggler|galaxy|rocket|orbit|mission: ?breakout|cosmic|guardians|\bmoon|\btron\b|mars/, 'space', ['stars']],
  [/haunted|ghost|phantom|mansion|horror|bates motel|mummy|terror|twilight|scream|nightmare|spooky|fearfall/, 'haunted', ['ghosts', 'bats']],
  [/jurassic|dino|raptor|velocicoaster|t-?rex|primeval/, 'volcano', ['dino']],
  [/riverboat|steamboat|mark twain/, 'lighthouse', ['steam']],
  [/jungle cruise|safari|river adventure|kilimanjaro/, 'tiki', ['hippo', 'parrots']],
  [/jungle|tiki|\bkong\b|skull island|tom sawyer|temple|adventureland/, 'tiki', ['parrots']],
  [/shark/, 'ocean', ['fin']],
  [/nemo|the seas|aquarium|ocean|submarine|reef|coral|undersea|mermaid|ariel|voyage/, 'ocean', ['bubbles']],
  [/splash|log ride|flume|rapids|waterfall|\bfalls\b|world of water|poseidon|\briver\b|typhoon/, 'waterfall', ['splash']],
  [/speedway|autopia|\bcars\b|\brace\b|racer|radiator|test track|\bkart|mario/, 'race', ['racecar']],
  [/railroad|railway|station|mine train|thunder mountain|trolley|steam|\btrain/, 'train', ['steam']],
  [/studio|backlot|hollywood|movie|\bfilm|cinema|theat(er|re)|animal actors|make-?up/, 'studio', ['spotlights']],
  [/castle|palace/, 'shark', ['fireworks']],
  [/philharmagic|simpson|seuss|cat in the hat|one fish|inside out|soarin|sky school|super silly|tea party|teacup|dumbo|carousel|small world|peter pan|flight|flying|carpet|circus|midway|\bfair\b|games|pal-a-round|zephyr|swing|wheel|toad|pooh|alice/, 'circus', ['sparkles']],
  [/spider|hulk|transformers|new york|minion|secret life of pets|\bcity\b|metro|incredible/, 'city', ['spotlights']],
  [/lighthouse|harbor|\bpier\b|\bbay\b|wharf|\bdock/, 'lighthouse', []],
  [/\bmel'?s\b|pasta|pizza|burger|wiener|hot ?dog|\bcaf[eé]|grille?\b|restaurant|diner|drive-in|brewery|doughnut|donut|soda|butter ?drink|cantina|kitchen|bakery|churro|snack|treats?\b|\beats\b|panda express|bbq|taco|terrace|tavern|\bpub\b|ice cream|ghirardelli|popcorn|dole whip|green eggs/, 'snack', ['aroma']],
  [/statue|plaza|square|main street|courthouse|\barch\b|\bglobe\b|\bhub\b|town|gazebo|lincoln|president|port of entry|shop|shoppe|store|emporium|boutique|mercantile|alley/, 'plaza', ['fountain']],
];

const PLAIN: RideLook = { landmark: 'shark', ambience: [] };

export function rideLook(name?: string | null): RideLook {
  const ride = name?.trim().toLowerCase() ?? '';
  if (!ride) return PLAIN;
  for (const [pattern, landmark, ambience] of RULES) {
    if (pattern.test(ride)) return { landmark, ambience };
  }
  return PLAIN;
}

/** Fireworks only fly after dark (park local time on the phone), sparkles otherwise. */
export function ambienceNow(ambience: readonly AmbienceId[], hour = new Date().getHours()): AmbienceId[] {
  const night = hour >= 20 || hour < 1;
  return ambience.map(a => (a === 'fireworks' && !night ? 'sparkles' : a));
}

/** Easter eggs that live on the water near the ride rather than around its pin. */
export const WATER_AMBIENCE: readonly AmbienceId[] = ['ship', 'hippo', 'fin'];
