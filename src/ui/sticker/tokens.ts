/**
 * STICKER BOOK tokens (design direction approved Nov 18 2026).
 *
 * The one palette and every number of the look, from the "Final tokens" table in
 * tps-prime-time-audit/polish-2026-10-23/design-v2/board/DIRECTION.md and the kit sheet
 * board/pick/css/kit.css. This is the only file under src/ui/sticker/ that may hold a colour
 * (tools/tests/sticker-kit.test.cjs checks it).
 *
 * Every translucent value is an INK colour at an alpha (navy for drops, insets and the scrim,
 * white for shine), built by `inkAt`. Every other hex here is a named gradient stop of an INK
 * colour. Pure data: no React, no React Native.
 */

/** The 12 colours of the table (scrim included). Nothing black, nothing gray. */
export const INK = {
  /** Every line, dark text, every shadow. */
  navy: '#05346e',
  /** Second-line text on paper. */
  navySoft: '#3d5f8c',
  /** Page bottom and the world. */
  blue: '#0768b9',
  /** Page top and the world. */
  blueBright: '#1590e6',
  /** Button lips, grooves (chips, bars, tabs). */
  blueLip: '#05468f',
  /** Spots on paper, the off button. */
  sky: '#cfe9fb',
  /** The white button's lip. */
  skyLip: '#9cc9ec',
  /** The cut edge, white cards, tags. */
  white: '#ffffff',
  cream: '#fff6dc',
  creamDeep: '#f3e3b4',
  creamLip: '#dcc78c',
  /** The primary, value. */
  gold: '#ffcf3b',
  goldLight: '#ffe37d',
  goldLip: '#d99a00',
  /** Caps labels on paper. */
  goldInk: '#8a5a00',
  /** Danger and the count badge. */
  red: '#ef4a3c',
  redLip: '#b92e22',
  /** The done check. */
  green: '#3cb85c',
  /** Behind sheets and dialogs: navy at 52 percent. */
  scrim: 'rgba(5,52,110,0.52)',
} as const;

/** An INK colour at an alpha: the only way the kit makes a translucent colour. */
export function inkAt(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const navy = (a: number) => inkAt(INK.navy, a);
const white = (a: number) => inkAt(INK.white, a);

/**
 * Named gradient stops and translucent steps the kit sheet draws with (css/kit.css), so no
 * part types a colour. Hex values are stops of an INK colour; rgba values are INK at an alpha.
 */
export const SHADE = {
  creamTop: '#fffdf3',
  skyPale: '#e6f5ff',
  /** Bottom stop of the wave foot. */
  blueDeep: '#04509f',
  /** Top stop of the wave foot. */
  waveTop: '#0a66c0',
  /** Gold face: light, gold at 55 percent, this at the bottom. */
  goldFaceLow: '#fac42c',
  /** Pressed gold face. */
  goldPressedTop: '#ffd24a',
  goldPressedLow: '#f7bd24',
  /** Lit bar fill bottom stop. */
  goldFillLow: '#f3b61d',
  /** Blue face (and the blue title label). */
  blueFaceTop: '#3fb0f8',
  blueFaceLow: '#0d80d4',
  /** White face bottom stop. */
  whiteFaceLow: '#f1f8ff',
  /** White title label bottom stop. */
  labelLow: '#eef7ff',
  /** Red face. */
  redFaceTop: '#ff7a6b',
  redFaceLow: '#e23e31',
  /** Spots on paper. */
  spotPaper: '#dcedf9',
  spotPaperLine: '#7fa3c9',
  spotPaperNext: '#fff3c4',
  spotPaperNextLine: '#e0a400',
  /** The groove of a bar on paper. */
  barPaper: '#cfe3f4',
  /** The second part of a two-part fill. */
  twoTop: '#ffb056',
  two: '#f59324',
  twoLow: '#e8811a',
  /** Second-line text on blue. */
  onBlueSoft: '#d7ebfc',
  /** Header and footer band: the top stop of the water's shade (kit.css .hdr). */
  bandTop: '#0a84d8',
  /** The stage: Alex's underwater water behind his light and rays (kit.css .stage). */
  stageWater: '#35a9f5',

  /** Spots on blue: a dark navy disc (empty, ghost, next). */
  spotBlue: navy(0.5),
  spotBlueLine: white(0.62),
  /** Inset line at the top of every groove (chip, bar, tab track). */
  grooveInset: navy(0.5),
  /** The pale line under a groove. */
  grooveRim: white(0.28),
  barPaperInset: navy(0.16),
  /** Highlight lines on faces. */
  shine80: white(0.8),
  shine55: white(0.55),
  shine50: white(0.5),
  shine45: white(0.45),
  shine35: white(0.35),
  shine30: white(0.3),
  /** The page's printed dots. */
  dot: white(0.07),
  /** The wave foot's white rim. */
  waveRim: white(0.92),
  /** Small white type on blue: its one hard drop. */
  smallDrop: navy(0.55),
  /** A ghost button held down. */
  ghostPressed: navy(0.14),
  /** The Secret Shop's midnight wash over Alex's bar. */
  nightWash: navy(0.8),
  /** The switch's groove when on: gold ink at 35 percent. */
  switchOnInset: inkAt(INK.goldInk, 0.35),
} as const;

/** Hard drops: straight down, navy, no blur. */
export const DROP = {
  /** Page, card on the world, button edge, tag: navy at 34 percent. */
  color: navy(0.34),
  /** A card or button inside a page: navy at 40 percent. */
  inPage: navy(0.4),
  /** On the map: navy at 50 percent. */
  map: navy(0.5),
  /** The walking dot and the picked tab. */
  knob: navy(0.45),
  page: 5,
  cardOnWorld: 4,
  cardInPage: 3,
  button: 4,
  buttonOnMap: 5,
  label: 3,
  tag: 2.5,
  tagOnMap: 3,
  art: 3,
  artOnMap: 4,
} as const;

/** The one soft shadow: under a floating sheet or dialog only (0 18 28, navy 36 percent). */
export const FLOAT_SHADOW = {
  color: navy(0.36),
  y: 18,
  blur: 28,
} as const;

/** Navy lines. */
export const LINE = {
  page: 3,
  card: 2.5,
  button: 2.5,
  chip: 2,
  tag: 2,
  map: 3,
} as const;

/** The white cut edge. Level 1 only. */
export const EDGE = {
  page: 4,
  card: 3,
  button: 3,
  label: 3,
} as const;

export const RADIUS = {
  page: 24,
  pageSmall: 20,
  card: 16,
  buttonLarge: 22,
  button: 18,
  buttonSmall: 14,
  key: 15,
  label: 11,
  pill: 999,
} as const;

/** 4 pt base. */
export const SPACE = {
  base: 4,
  margin: 16,
  pagePad: 16,
  pageSnug: 12,
  pageFlush: 6,
  cardGap: 10,
  cardGapLoose: 12,
  /** Hanging art keeps at least this far from the next frame line and the screen edge. */
  artClear: 8,
} as const;

export const FONT = {
  shark: 'Shark',
  knockout: 'Knockout',
} as const;

/** Type sizes (pt) and title letter spacing (em). Nothing under 12. */
export const TYPE = {
  hero: 35,
  title: 30,
  titleLarge: 32,
  heading: 24,
  sub: 21,
  name: 18,
  nameSmall: 17,
  tag: 14,
  tagSmall: 13,
  chip: 19,
  body: 16,
  bodyMid: 15,
  bodySmall: 14,
  caps: 12,
  /** The smallest size anywhere. */
  min: 12,
  /** Title spacing, 0.09 to 0.10 em. */
  titleSpacing: 0.09,
  titleSpacingWide: 0.1,
} as const;

/** Outlined Shark type: stroke outside the letters, in pt. */
export const STROKE = {
  /** Titles: 2.6 to 2.8. */
  title: 2.7,
  titleMin: 2.6,
  titleMax: 2.8,
  /** Buttons and chip numbers. */
  button: 2.2,
  /** The large button (kit.css .btn.lg --sw 5.5). */
  buttonLarge: 2.75,
  /** Never more than this. */
  max: 3,
  /** No stroke under this size: plain white with a small drop on blue, plain navy on paper. */
  minSize: 17,
  /** The hard drop under outlined type. */
  drop: 2,
  dropTitle: 2.5,
  /** The 1.5 pt drop under small white type. */
  smallDrop: 1.5,
} as const;

/** Button geometry (kit.css .btn). Face heights, lips, fonts per size. */
export const BUTTON = {
  heightLarge: 58,
  height: 44,
  heightSmall: 36,
  heightKey: 42,
  /** A list row's action: the 36 face at the row font. */
  heightRow: 36,
  lip: 5,
  lipSmall: 4,
  /** The face's 2 pt white top line. */
  shine: 2,
  fontLarge: 30,
  font: 19,
  fontSmall: 17,
  fontRow: 18,
  fontKey: 24,
  /** Every pressable is at least this tall and wide. */
  minTouch: 44,
} as const;

/** The one off look: a cool sky paper that keeps its lip and shape (never slate gray). Art that cannot be recoloured fades. */
export const OFF = { artOpacity: 0.55 } as const;

export const CHIP = { height: 30, padLeft: 34, padRight: 12, minWidth: 84, font: 19, digit: 11.5 } as const;
export const TAG = { height: 24, heightLarge: 32, padX: 10, font: 14, fontKo: 13, tilt: 2, maxScale: 1.15 } as const;
export const LABEL = { height: 30, heightLarge: 36, padX: 14, font: 17, fontLarge: 20, maxScale: 1.15 } as const;
export const BADGE = { size: 22, ring: 2, font: 13, max: 99 } as const;
export const BAR = { height: 18, dot: 22, dotLine: 2.5, inset: 3 } as const;
/** Spots: ghosts are a tinted silhouette of the art; next up is a 3 pt gold ring with a gold-light ring inside. */
export const SPOT = { size: 46, line: 2, nextLine: 3, nextInner: 2, ghostOpacity: 0.38, ghostPaperOpacity: 0.9, weekMin: 24 } as const;
/**
 * Header band: the water's straight bottom edge sits `crest` under the safe area top, then the
 * navy line, the white edge and a 3 pt drop at the map's 50 percent navy; content starts `gap`
 * under it.
 */
export const HEADER = { crest: 46, edge: 4, line: 2.5, drop: 3, gap: 12, shadeOpacity: 0.38, title: 30, round: 47, slot: 64, nightLine: 2 } as const;
/** The gate's answer spots and keys. */
export const GATE = { spot: 44, keyGap: 12, rowGap: 4 } as const;
/** Alex's ribbon (872 x 222): words centred at this share of its height, its lower 47 percent overlaps the page. */
export const RIBBON = { ratio: 872 / 222, textAt: 0.45, overlap: 0.47, edge: 3, copies: 12, padPage: 8, section: 0.71 } as const;
/** One wave for the sheet foot and the footer: one period, drawn at the real width. */
export const WAVE = { height: 60, crest: 9, amplitude: 5.2, period: 42, textureOpacity: 0.4, contentTop: 19, rim: 5, line: 2.5 } as const;
/**
 * Footer (kit.css .ftr): the same water band, the five toolbar icons, Map raised on a hump.
 * The band (rim to bottom) is never taller than today's footer art (window width / 5.3); `rise`
 * is the room above the band's wave for the hump and the raised Map icon, inside the footer's
 * own box.
 */
export const FOOTER = { todayRatio: 5.3, rim: 6.5, line: 2.5, hump: 25, rise: 42, icon: 44, iconMap: 90, label: 13, iconBottom: 26, mapBottom: 18, labelBottom: 6, shadeOpacity: 0.45, mockWidth: 390 } as const;
/** The stage window (kit.css .stage): rays are a square 1.12 times the window width, centred. */
export const STAGE = { radius: 16, line: 2.5, rays: 1.12, raysOpacity: 0.42, tintOpacity: 0.85, sway: 4, swayMs: 4200 } as const;
export const SWITCH = { width: 58, height: 32, knob: 26, line: 2 } as const;
export const TOAST = { height: 48, ms: 2400, art: 28 } as const;
/** Floating sheets and dialogs: the board's 24 pt side margin, capped on wide screens. */
export const LAYER = { margin: 24, maxWidth: 420, bottom: 12, exitMs: 180 } as const;
export const ROW = { min: 62, artRoom: 58, actionWidth: 86, gap: 8, padRight: 10 } as const;

/** Motion of the look: stuck on (1.08 to 1.0, the drop closing), 150 ms fades under Reduce Motion. */
export const STICK = {
  fromScale: 1.08,
  /** How much further the drop sits while the sticker is still held above the page. */
  liftDrop: 4,
  ms: 260,
  reducedFadeMs: 150,
  fadeInMs: 90,
  /** Peeled off: lifts a little, turns at its corner, fades. */
  peelMs: 200,
  peelTurn: 5,
  peelLift: 10,
} as const;

/** Dev gallery only: the tan street ground the map pieces are checked on (the board's map plate). Not exported from the kit. */
export const GALLERY = { mapGround: '#efe6c8', mapStreet: '#dccfa6', mapGrass: '#9fce6a', mapWater: '#6cc3ef' } as const;
