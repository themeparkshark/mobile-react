/**
 * Icon tokens in copy (WS0 UI kit).
 *
 * Copy (including server-sent strings) names icons with `[icon:ticket]` tokens
 * instead of emoji. `parseIconTokens` splits a string into text and icon parts
 * for <GameRichText>. Legacy strings that still carry emoji are converted: a
 * known emoji becomes its GameIcon, any other emoji is dropped, and the spacing
 * left behind is tidied. That way a server string with an emoji never reaches
 * the screen, even before the backend stream swaps it.
 */
import { resolveIconName, type GameIconName } from './iconNames';

export type CopyPart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'icon'; readonly name: GameIconName };

// ui-copy-allow(emoji, glyph): legacy emoji to GameIcon lookup, the emoji are never rendered
const LEGACY_EMOJI: Readonly<Record<string, GameIconName>> = {
  '\u26A1': 'rush',
  '\u{1F3AB}': 'ticket',
  '\u{1F39F}': 'ticket',
  '\u{1FA99}': 'coin',
  '\u{1F4B0}': 'coin',
  '\u{1F451}': 'crown',
  '⚔': 'swords',
  '\u{1F5E1}': 'swords',
  '⭐': 'star',
  '\u{1F31F}': 'star',
  '✨': 'sparkle',
  '\u{1F525}': 'streak',
  '⏱': 'timer',
  '⏰': 'timer',
  '⌛': 'timer',
  '⏳': 'timer',
  '\u{1F3B2}': 'dice',
  '\u{1F514}': 'bell',
  '✅': 'check',
  '✔': 'check',
  '❌': 'close',
  '✖': 'close',
  '⏸': 'pause',
  '▶': 'play',
  '❤': 'heart',
  '\u{1F499}': 'heart',
  '\u{1F5FA}': 'map',
  '\u{1F4CD}': 'pin',
  '\u{1F381}': 'gift',
  '\u{1F947}': 'medal1',
  '\u{1F948}': 'medal2',
  '\u{1F949}': 'medal3',
  '\u{1F3C6}': 'trophy',
  '\u{1F527}': 'wrench',
  '\u{1F6E0}': 'wrench',
  '\u{1F988}': 'shark',
  '\u{1F3A2}': 'ride',
  '\u{1F512}': 'lock',
  'ℹ': 'info',
  '\u{1F504}': 'retry',
  '➡': 'arrow',
  '⚙': 'settings',
  '✏': 'edit',
  '\u{1F4F7}': 'camera',
  '\u{1F4F8}': 'camera',
  '\u{1F50D}': 'search',
  '\u{1F9ED}': 'map',
  '\u{1F3C5}': 'medal1',
  '\u{1F195}': 'new',
  '\u{1F4B5}': 'coins',
};

const TOKEN_RE = /\[icon:([A-Za-z0-9]+)\]/g;
// One emoji "grapheme": a pictograph with optional variation selector, skin tone and ZWJ joins, a flag pair, or a keycap.
const EMOJI_RE = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|[#*0-9]️?⃣|(?![©®™])\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?(?:‍\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?)*)/gu;

export function iconForEmoji(emoji: string): GameIconName | undefined {
  return LEGACY_EMOJI[emoji.replace(/️/g, '')];
}

/** Replace emoji with `[icon:name]` tokens (or nothing) and tidy the spaces left behind. */
export function tokenizeLegacyEmoji(text: string): string {
  const replaced = text.replace(EMOJI_RE, match => {
    const name = iconForEmoji(match);
    return name ? `[icon:${name}]` : '\u0000';
  });
  return replaced
    .replace(/[ \t]*\u0000[ \t]*/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.!?:;])/g, '$1')
    .replace(/^ +| +$/gm, '');
}

/** Split copy into text and icon parts. Unknown icon names are kept as plain text. */
export function parseIconTokens(text: string, options: { legacyEmoji?: boolean } = {}): CopyPart[] {
  const source = options.legacyEmoji === false ? text : tokenizeLegacyEmoji(text);
  const parts: CopyPart[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN_RE)) {
    const name = resolveIconName(match[1]);
    if (!name) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: source.slice(last, start) });
    parts.push({ kind: 'icon', name });
    last = start + match[0].length;
  }
  if (last < source.length) parts.push({ kind: 'text', text: source.slice(last) });
  return parts;
}

/** Plain text for accessibility labels and share sheets: icon tokens and emoji removed. */
export function stripIconTokens(text: string): string {
  return parseIconTokens(text)
    .filter((part): part is Extract<CopyPart, { kind: 'text' }> => part.kind === 'text')
    .map(part => part.text).join('').replace(/ {2,}/g, ' ').trim();
}
