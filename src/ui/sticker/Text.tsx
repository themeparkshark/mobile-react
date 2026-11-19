/**
 * The text roles screens use (DIRECTION.md type table), one component per row:
 *   Title    Shark 30 (or 32, or the 35 hero), 0.09 to 0.10 em
 *   Heading  Shark 24 (or the 21 sub)
 *   Name     Shark 18 (or 17): row titles, names
 *   Count    Shark numbers with equal-width digits (19 in chips, 35 for the hero count)
 *   Body     Knockout 16, 15, 14: every sentence (the plain-text helper)
 *   Caps     Knockout 12 caps at 0.11 em: small labels
 * Stroke, drop, spacing and colour come from the role and the place (paper: plain navy; colour:
 * white, stroked at 17 pt and up). The only choices left to a screen are the words, the size step,
 * gold or soft, alignment and wrapping.
 */
import { memo } from 'react';
import type { AccessibilityRole, StyleProp, TextStyle, ViewStyle } from 'react-native';
import StickerText from './StickerText';
import { ROLE_LINES, TEXT } from './textRoles';

type Common = {
  readonly children: string;
  readonly align?: TextStyle['textAlign'];
  /** Lines before it ends (ROLE_LINES: sentences, headings and caps never cut; titles and names wrap to two). */
  readonly lines?: number;
  /** One line that shrinks to fit its box (never under 60 percent). */
  readonly fit?: boolean;
  /** What VoiceOver says when it differs from the words. */
  readonly label?: string;
  /** 'none' inside a part that already speaks for it. */
  readonly role?: AccessibilityRole | 'none';
  readonly style?: StyleProp<ViewStyle>;
};

export const Title = memo(function Title({ size = 'title', gold = false, align, lines = ROLE_LINES.title, fit, label, role = 'header', style, children }: Common & {
  readonly size?: 'title' | 'large' | 'hero';
  readonly gold?: boolean;
}) {
  const spec = size === 'hero' ? TEXT.hero : size === 'large' ? TEXT.titleLarge : TEXT.title;
  return <StickerText spec={spec} tone={gold ? 'gold' : 'auto'} align={align} lines={lines} fit={fit} label={label} role={role} style={style}>{children}</StickerText>;
});

export const Heading = memo(function Heading({ size = 'heading', align, lines = ROLE_LINES.heading, fit, label, role = 'header', style, children }: Common & {
  readonly size?: 'heading' | 'sub';
}) {
  return <StickerText spec={size === 'sub' ? TEXT.sub : TEXT.heading} align={align} lines={lines} fit={fit} label={label} role={role} style={style}>{children}</StickerText>;
});

export const Name = memo(function Name({ small = false, align = 'left', lines = ROLE_LINES.name, fit, label, role = 'text', style, children }: Common & {
  readonly small?: boolean;
}) {
  return <StickerText spec={small ? TEXT.nameSmall : TEXT.name} align={align} lines={lines} fit={fit} label={label} role={role} style={style}>{children}</StickerText>;
});

export const Count = memo(function Count({ size = 'count', gold = false, align, label, role = 'text', style, children }: Omit<Common, 'lines' | 'fit'> & {
  readonly size?: 'count' | 'heading' | 'hero';
  readonly gold?: boolean;
}) {
  const spec = size === 'hero' ? TEXT.hero : size === 'heading' ? TEXT.heading : TEXT.count;
  return <StickerText spec={spec} tone={gold ? 'gold' : 'auto'} align={align} lines={ROLE_LINES.count} tabular label={label} role={role} style={style}>{children}</StickerText>;
});

/** Every Knockout sentence. Wraps as far as it needs (the page scrolls); it ends early only when `lines` says so. */
export const Body = memo(function Body({ size = 'body', soft = false, align = 'center', lines = ROLE_LINES.body, label, role = 'text', style, children }: Omit<Common, 'fit'> & {
  readonly size?: 'body' | 'mid' | 'small';
  /** The second-line colour (navy soft on paper, pale blue on colour). */
  readonly soft?: boolean;
}) {
  const spec = size === 'small' ? TEXT.bodySmall : size === 'mid' ? TEXT.bodyMid : TEXT.body;
  return <StickerText spec={spec} tone={soft ? 'soft' : 'auto'} align={align} lines={lines} label={label} role={role} style={style}>{children}</StickerText>;
});

export const Caps = memo(function Caps({ align = 'left', gold = false, label, role = 'text', style, children }: Omit<Common, 'lines' | 'fit'> & {
  /** Gold on colour (the guide card's NEXT COIN); on paper caps are always gold ink. */
  readonly gold?: boolean;
}) {
  return <StickerText spec={TEXT.caps} tone={gold ? 'gold' : 'auto'} align={align} lines={ROLE_LINES.caps} label={label ?? children} role={role} style={style}>{children.toUpperCase()}</StickerText>;
});
