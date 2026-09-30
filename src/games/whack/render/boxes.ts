/**
 * boxes.ts: per-frame content boxes (x0, y0, x1, y1, aspect) for the current
 * theme, indexed by frame code. The renderer base-anchors every sprite with
 * these so Finn sits in the hole mouth instead of floating above it.
 */

import { ART_BOX, THEME_BOX, type WhackTheme } from '../assets';
import { F_ANGLER, F_BRUISER, F_BRUISER_DAZED, F_DAZED, F_GOLDEN, F_PEEK, F_POP, F_PUFFED, F_PUFFER } from './renderState';

export function boxesFor(theme: WhackTheme): number[][] {
  const t = THEME_BOX[theme];
  const b: number[][] = [];
  b[F_PEEK] = [...t[0]];
  b[F_POP] = [...t[1]];
  b[F_DAZED] = [...t[2]];
  b[F_GOLDEN] = [...ART_BOX.golden];
  b[F_ANGLER] = [...ART_BOX.angler];
  b[F_BRUISER] = [...ART_BOX.bruiser];
  b[F_BRUISER_DAZED] = [...ART_BOX.bruiserDazed];
  b[F_PUFFER] = [...ART_BOX.puffer];
  b[F_PUFFED] = [...ART_BOX.pufferPuffed];
  return b;
}
