/**
 * Text presets (WS0 UI kit). Display = Shark, body = Knockout.
 *
 * Use these instead of `fontWeight: 'bold'` on the system font. Custom fonts on
 * iOS ignore or fake fontWeight, so presets never set it. Pick a tone for the
 * surface: 'onLight' (navy ink on cream or white cards) or 'onBlue' (white with
 * a navy outline shadow on blue panels and photos).
 *
 *   <Text style={textPreset('title', 'onBlue')}>COIN CAUGHT!</Text>
 *   <GameText preset="body">Walk closer to play.</GameText>
 */
import type { TextStyle } from 'react-native';
import { BRAND, FONT } from './tokens';

export type TextPresetName =
  | 'hero'
  | 'display'
  | 'title'
  | 'heading'
  | 'button'
  | 'number'
  | 'label'
  | 'body'
  | 'bodySmall'
  | 'caption';

export type TextTone = 'onLight' | 'onBlue' | 'onGold';

type PresetBase = Omit<TextStyle, 'color'> & { isDisplay: boolean };

const BASE: Record<TextPresetName, PresetBase> = {
  hero: { isDisplay: true, fontFamily: FONT.display, fontSize: 40, lineHeight: 46, letterSpacing: 0.5 },
  display: { isDisplay: true, fontFamily: FONT.display, fontSize: 32, lineHeight: 38, letterSpacing: 0.5 },
  title: { isDisplay: true, fontFamily: FONT.display, fontSize: 26, lineHeight: 31, letterSpacing: 0.4 },
  heading: { isDisplay: true, fontFamily: FONT.display, fontSize: 20, lineHeight: 25, letterSpacing: 0.3 },
  button: { isDisplay: true, fontFamily: FONT.display, fontSize: 24, lineHeight: 28, letterSpacing: 0.5, textTransform: 'uppercase' },
  number: { isDisplay: true, fontFamily: FONT.display, fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] },
  label: { isDisplay: false, fontFamily: FONT.body, fontSize: 14, lineHeight: 17, letterSpacing: 0.8, textTransform: 'uppercase' },
  body: { isDisplay: false, fontFamily: FONT.body, fontSize: 18, lineHeight: 23 },
  bodySmall: { isDisplay: false, fontFamily: FONT.body, fontSize: 15, lineHeight: 19 },
  caption: { isDisplay: false, fontFamily: FONT.body, fontSize: 13, lineHeight: 16, letterSpacing: 0.3 },
};

const INK: Record<TextTone, string> = {
  onLight: BRAND.navy,
  onBlue: BRAND.white,
  onGold: BRAND.white,
};

/** Navy outline shadow for display text on blue or gold, matching the house headers. */
const OUTLINE_SHADOW: Record<TextTone, TextStyle | null> = {
  onLight: null,
  onBlue: { textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  onGold: { textShadowColor: BRAND.goldLip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
};

const cache = new Map<string, TextStyle>();

/** Frozen, cached style for a preset on a surface tone. */
export function textPreset(name: TextPresetName, tone: TextTone = 'onLight'): TextStyle {
  const key = `${name}:${tone}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { isDisplay, ...base } = BASE[name];
  const shadow = isDisplay ? OUTLINE_SHADOW[tone] : null;
  const style: TextStyle = Object.freeze({
    ...base,
    color: INK[tone],
    ...(shadow ?? {}),
  });
  cache.set(key, style);
  return style;
}

/** Secondary ink for supporting copy on light cards. */
export const SOFT_INK = BRAND.navySoft;

export const TEXT_PRESET_NAMES = Object.keys(BASE) as TextPresetName[];
