/**
 * STICKER BOOK tokens (design direction approved Nov 18 2026).
 *
 * The one palette and every number of the look, from the "Final tokens" table in
 * tps-prime-time-audit/polish-2026-10-23/design-v2/board/DIRECTION.md and the kit sheet
 * board/pick/css/kit.css. This is the only file under src/ui/sticker/ that may hold a hex
 * colour or an rgba (tools/tests/sticker-kit.test.cjs checks it).
 *
 * Pure data: no React, no React Native.
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
  /** Spots on paper. */
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

/**
 * Shades the kit sheet draws with (css/kit.css), named here so no part types a colour.
 * Each one is a step of an INK colour: a gradient stop, an inset line or a tinted spot.
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
  /** Off button: it keeps its lip and its shape, in a cool blue paper. */
  offLip: '#7e93b0',
  offFaceTop: '#c6d3e3',
  offFaceLow: '#b2c2d6',
  offInk: '#eef3f9',
  offStroke: '#6d83a2',
  /** Spots on paper. */
  spotPaper: '#dcedf9',
  spotPaperLine: '#7fa3c9',
  spotPaperNext: '#fff3c4',
  spotPaperNextLine: '#e0a400',
  /** Spots on blue. */
  spotBlue: 'rgba(5,44,96,0.34)',
  spotBlueLine: 'rgba(255,255,255,0.62)',
  spotNextFill: 'rgba(255,207,59,0.20)',
  /** The groove of a bar on paper. */
  barPaper: '#cfe3f4',
  barPaperInset: 'rgba(5,52,110,0.16)',
  /** The second part of a two-part fill. */
  twoTop: '#ffb056',
  two: '#f59324',
  twoLow: '#e8811a',
  /** Inset line at the top of every groove (chip, bar, tab track). */
  grooveInset: 'rgba(5,36,82,0.50)',
  /** The pale line under a groove. */
  grooveRim: 'rgba(255,255,255,0.28)',
  /** Highlight lines on faces. */
  shine80: 'rgba(255,255,255,0.80)',
  shine55: 'rgba(255,255,255,0.55)',
  shine50: 'rgba(255,255,255,0.50)',
  shine45: 'rgba(255,255,255,0.45)',
  shine30: 'rgba(255,255,255,0.30)',
  /** The page's printed dots. */
  dot: 'rgba(255,255,255,0.07)',
  /** The wave foot's white rim. */
  waveRim: 'rgba(255,255,255,0.92)',
  /** Small white type on blue: its one hard drop. */
  smallDrop: 'rgba(5,44,96,0.55)',
  /** Second-line text on blue. */
  onBlueSoft: '#d7ebfc',
  /** Header and footer band: the top stop of the water's shade (kit.css .hdr). */
  bandTop: '#0a84d8',
} as const;

/** Hard drops: straight down, navy, no blur. */
export const DROP = {
  /** Page, card on the world, button edge, tag: navy at 34 percent. */
  color: 'rgba(5,44,96,0.34)',
  /** A card or button inside a page: navy at 40 percent. */
  inPage: 'rgba(5,36,82,0.40)',
  /** On the map: navy at 50 percent. */
  map: 'rgba(5,40,90,0.50)',
  /** The walking dot and the picked tab. */
  knob: 'rgba(5,36,82,0.45)',
  page: 5,
  cardOnWorld: 4,
  cardInPage: 3,
  button: 4,
  label: 3,
  tag: 2.5,
  tagOnMap: 3,
  art: 3,
  artOnMap: 4,
} as const;

/** The one soft shadow: under a floating sheet or dialog only (0 18 28, navy 36 percent). */
export const FLOAT_SHADOW = {
  color: 'rgba(5,40,90,0.36)',
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
  cardGap: 10,
  cardGapLoose: 12,
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
  sub: 20,
  subLarge: 22,
  button: 17,
  buttonLarge: 19,
  row: 18,
  tag: 14,
  tagSmall: 13,
  chip: 16,
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

/** Button geometry (kit.css .btn). */
export const BUTTON = {
  heightLarge: 58,
  height: 44,
  heightSmall: 36,
  heightKey: 42,
  lip: 5,
  lipSmall: 4,
  /** The face's 2 pt white top line. */
  shine: 2,
  /** How far the face travels when pressed: lip minus the 1 pt that stays. */
  pressTravel: 4,
  fontLarge: 30,
  font: 19,
  fontSmall: 17,
  fontKey: 24,
  /** Every pressable is at least this tall and wide. */
  minTouch: 44,
} as const;

export const CHIP = { height: 30, artHeight: 40, padLeft: 34, padRight: 12, minWidth: 84, font: 19 } as const;
export const TAG = { height: 24, padX: 10, font: 14, fontKo: 13, tilt: 2 } as const;
export const LABEL = { height: 30, heightLarge: 36, padX: 14, font: 17, fontLarge: 20 } as const;
export const BADGE = { size: 22, ring: 2, font: 13 } as const;
export const BAR = { height: 18, dot: 22, dotLine: 2.5, inset: 3 } as const;
export const SPOT = { size: 46, ghostOpacity: 0.42, line: 2 } as const;
/** Header band (kit.css .hdr): the wave crest sits this far under the safe area top. */
export const HEADER = { crest: 46, edge: 4, line: 2.5, drop: 4, shadeOpacity: 0.38, title: 30, round: 47, period: 48.75 } as const;
/** The gate's answer spots and keys. */
export const GATE = { spot: 44, keyGap: 12, rowGap: 10 } as const;
/** Alex's ribbon (872 x 222): words centred at this share of its height. */
export const RIBBON = { ratio: 872 / 222, textAt: 0.45, edge: 3, copies: 12 } as const;
export const WAVE = { height: 60, crest: 9, amplitude: 5.2, period: 42, textureOpacity: 0.4, contentTop: 19 } as const;

/** Motion of the look: stuck on (1.08 to 1.0, the drop closing), 150 ms fades under Reduce Motion. */
export const STICK = {
  fromScale: 1.08,
  /** How much further the drop sits while the sticker is still held above the page. */
  liftDrop: 4,
  ms: 260,
  reducedFadeMs: 150,
  fadeInMs: 90,
} as const;

/** Dev gallery only: the tan street ground the map pieces are checked on (the board's map plate). */
export const GALLERY = { mapGround: '#efe6c8', mapStreet: '#dccfa6', mapGrass: '#9fce6a' } as const;
