/**
 * Season profile frames (money stream round 4): bundled art by frame key ("s1:frost-frame" or "frost-frame").
 * A frame is a ring with a transparent middle, drawn over the player's shark.
 */
export const FRAME_ART: Record<string, number> = {
  'frost-frame': require('../../../assets/images/sharkpass/frost-frame.webp'),
  'aurora-frame': require('../../../assets/images/sharkpass/aurora-frame.webp'),
  'snowbound-frame': require('../../../assets/images/sharkpass/snowbound-frame.webp'),
  'starter-frame': require('../../../assets/images/sharkpass/starter-frame.webp'),
};

/** The bundled picture for a frame key, or null for an unknown frame (draw no ring). */
export function frameArt(key: string | null | undefined): number | null {
  if (!key) return null;
  const slug = key.includes(':') ? key.slice(key.lastIndexOf(':') + 1) : key;
  return FRAME_ART[slug] ?? null;
}

/** Gold editions of season pins, bundled by pin art key ("cocoa-mug" -> the gold picture). */
export const GOLD_ART: Record<string, number> = {
  'frosty-scarf': require('../../../assets/images/sharkpass/frosty-scarf-gold.webp'),
  'snowflake-beanie': require('../../../assets/images/sharkpass/snowflake-beanie-gold.webp'),
  'snow-globe-wand': require('../../../assets/images/sharkpass/snow-globe-wand-gold.webp'),
  'aurora-shades': require('../../../assets/images/sharkpass/aurora-shades-gold.webp'),
  'polar-puffer': require('../../../assets/images/sharkpass/polar-puffer-gold.webp'),
  'northern-lights': require('../../../assets/images/sharkpass/northern-lights-gold.webp'),
  'cocoa-mug': require('../../../assets/images/sharkpass/cocoa-mug-gold.webp'),
  'snow-sled': require('../../../assets/images/sharkpass/snow-sled-gold.webp'),
  'ice-skates': require('../../../assets/images/sharkpass/ice-skates-gold.webp'),
  'snowman-buddy': require('../../../assets/images/sharkpass/snowman-buddy-gold.webp'),
  'frost-crown': require('../../../assets/images/sharkpass/frost-crown-gold.webp'),
  'pom-hat': require('../../../assets/images/sharkpass/pom-hat-gold.webp'),
  'finisher-medal': require('../../../assets/images/sharkpass/finisher-medal-gold.webp'),
  'cozy-mittens': require('../../../assets/images/sharkpass/cozy-mittens-gold.webp'),
  'gingerbread-shark': require('../../../assets/images/sharkpass/gingerbread-shark-gold.webp'),
  'aurora-crown': require('../../../assets/images/sharkpass/aurora-crown-gold.webp'),
};
