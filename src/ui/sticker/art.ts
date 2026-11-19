/**
 * Alex's files the kit draws with. His files are never changed; parts only place them.
 * Width:height ratios are the files' own pixel sizes.
 */
export const ART = {
  arrow: require('../../../assets/icons/game/arrow.png'),
  faq: require('../../../assets/images/faq.png'),
  close: require('../../../assets/icons/game/close.png'),
  base: require('../../../assets/images/screens/explore/base.png'),
  newSticker: require('../../../assets/icons/game/new.png'),
  topBar: require('../../../assets/images/original-top-bar.png'),
  coins: require('../../../assets/icons/game/coins.png'),
  coin: require('../../../assets/icons/game/coin.png'),
  ticket: require('../../../assets/images/ticket-icon.png'),
  energy: require('../../../assets/images/energy.png'),
  shark: require('../../../assets/icons/game/shark.png'),
  bronze: require('../../../assets/images/screens/park/bronze.png'),
  chestClosed: require('../../../assets/images/daily/chest-closed.png'),
  chestOpen: require('../../../assets/images/daily/chest-open.png'),
  levelChest: require('../../../assets/images/retention/level-chest-closed.png'),
  brownChest: require('../../../assets/images/modals/brown_closed.png'),
} as const;

/** width / height of each file. */
export const ART_RATIO = {
  arrow: 377 / 384,
  faq: 363 / 386,
  close: 1,
  base: 363 / 386,
  newSticker: 384 / 252,
  coins: 384 / 382,
  coin: 384 / 361,
  ticket: 799 / 549,
  energy: 196 / 284,
  bronze: 275 / 294,
  chest: 1,
} as const;

export type ArtName = keyof typeof ART;
