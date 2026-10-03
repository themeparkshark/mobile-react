/**
 * Placeholder scare-critters drawn in Skia (until the art kit's sheets land):
 * chunky, round, happy-eyed sea critters in the game's cel style, with a dark
 * night-ink outline (never pure black). Feet at (0, 0), about 28 points wide.
 * Kid-safe: big eyes and smiles, no teeth, no claws that read as weapons.
 */
import { Circle, Group, Oval, Path, Skia } from '@shopify/react-native-skia';
import { memo } from 'react';
import { NIGHT, type CritterLook } from './frightArt';

const INK = NIGHT.ink;
const STROKE = 1.6;

const P = (svg: string) => Skia.Path.MakeFromSVGString(svg)!;
const FISH_TAIL = P('M-11 -12 L-20 -19 L-18 -12 L-20 -5 Z');
const JELLY = P('M-11 -6 C-12 -22 -6 -27 0 -27 C6 -27 12 -22 11 -6 C8 -3 6 -8 4 -4 C2 -1 -1 -7 -3 -4 C-5 -1 -8 -8 -11 -6 Z');
const OCTO_LEGS = P('M-8 -8 C-11 -3 -8 -1 -10 1 M-3 -7 C-4 -2 -1 -1 -3 1 M3 -7 C4 -2 1 -1 3 1 M8 -8 C11 -3 8 -1 10 1');
const EEL = P('M-12 -3 C-8 -10 -2 2 3 -8 C6 -14 8 -16 8 -20');
const COLLAR = P('M-2 -21 L1 -16 L3 -21 L6 -16 L8 -21');
const CRAB_LEGS = P('M-9 -7 L-14 -2 M-6 -6 L-10 0 M9 -7 L14 -2 M6 -6 L10 0');
const PUMPKIN_RIBS = P('M0 -24 C-4 -18 -4 -8 0 -2 M-6 -23 C-11 -17 -11 -8 -6 -3 M6 -23 C11 -17 11 -8 6 -3');
const SMILE = P('M-4 -10 Q0 -6 4 -10');
const SMALL_SMILE = P('M-2 -9 Q0 -7.5 2 -9');

function Eye({ x, y, r = 2.6 }: { x: number; y: number; r?: number }) {
  return (
    <Group>
      <Circle cx={x} cy={y} r={r} color="#ffffff" />
      <Circle cx={x + r * 0.2} cy={y + r * 0.1} r={r * 0.55} color={INK} />
      <Circle cx={x + r * 0.45} cy={y - r * 0.3} r={r * 0.22} color="#ffffff" />
    </Group>
  );
}

export const CritterBody = memo(function CritterBody({ look }: { readonly look: CritterLook }) {
  const { shape, body, belly, accent } = look;
  switch (shape) {
    case 'fish':
      return (
        <Group>
          <Path path={FISH_TAIL} color={body} />
          <Path path={FISH_TAIL} color={INK} style="stroke" strokeWidth={STROKE} strokeJoin="round" />
          <Oval x={-13} y={-21} width={26} height={18} color={body} />
          <Oval x={-8} y={-11} width={16} height={7} color={belly} />
          <Oval x={-13} y={-21} width={26} height={18} color={INK} style="stroke" strokeWidth={STROKE} />
          <Path path={COLLAR} color={accent} style="stroke" strokeWidth={2.2} strokeJoin="round" />
          <Eye x={6} y={-15} />
          <Path path={SMALL_SMILE} color={INK} style="stroke" strokeWidth={1.2} strokeCap="round" transform={[{ translateX: 7 }]} />
        </Group>
      );
    case 'round':
      return (
        <Group>
          <Circle cx={0} cy={-13} r={12} color={body} />
          <Oval x={-8} y={-10} width={16} height={8} color={belly} />
          <Circle cx={0} cy={-13} r={12} color={INK} style="stroke" strokeWidth={STROKE} />
          <Oval x={9} y={-16} width={6} height={4} color={accent} />
          <Eye x={-4} y={-16} r={2.4} />
          <Eye x={4} y={-16} r={2.4} />
          <Path path={SMALL_SMILE} color={INK} style="stroke" strokeWidth={1.2} strokeCap="round" />
        </Group>
      );
    case 'jelly':
      return (
        <Group>
          <Path path={JELLY} color={body} opacity={0.92} />
          <Oval x={-7} y={-24} width={8} height={5} color={belly} opacity={0.8} />
          <Path path={JELLY} color={INK} style="stroke" strokeWidth={STROKE} strokeJoin="round" />
          <Eye x={-4} y={-15} r={2.3} />
          <Eye x={4} y={-15} r={2.3} />
          <Path path={SMALL_SMILE} color={INK} style="stroke" strokeWidth={1.2} strokeCap="round" transform={[{ translateY: -1 }]} />
        </Group>
      );
    case 'crab':
      return (
        <Group>
          <Path path={CRAB_LEGS} color={INK} style="stroke" strokeWidth={1.8} strokeCap="round" />
          <Circle cx={-13} cy={-17} r={4.2} color={body} />
          <Circle cx={13} cy={-17} r={4.2} color={body} />
          <Circle cx={-13} cy={-17} r={4.2} color={INK} style="stroke" strokeWidth={STROKE} />
          <Circle cx={13} cy={-17} r={4.2} color={INK} style="stroke" strokeWidth={STROKE} />
          <Oval x={-11} y={-16} width={22} height={13} color={body} />
          <Oval x={-7} y={-9} width={14} height={5} color={belly} />
          <Oval x={-11} y={-16} width={22} height={13} color={INK} style="stroke" strokeWidth={STROKE} />
          <Oval x={-9} y={-15} width={18} height={3} color={accent} opacity={0.9} />
          <Eye x={-4} y={-21} r={2.4} />
          <Eye x={4} y={-21} r={2.4} />
        </Group>
      );
    case 'octo':
      return (
        <Group>
          <Path path={OCTO_LEGS} color={body} style="stroke" strokeWidth={3.4} strokeCap="round" />
          <Circle cx={0} cy={-16} r={10.5} color={body} />
          <Oval x={-6} y={-13} width={12} height={6} color={belly} />
          <Circle cx={0} cy={-16} r={10.5} color={INK} style="stroke" strokeWidth={STROKE} />
          <Circle cx={-9} cy={-31} r={2} color={accent} />
          <Circle cx={0} cy={-34} r={2} color={accent} />
          <Circle cx={9} cy={-31} r={2} color={accent} />
          <Eye x={-4} y={-18} r={2.4} />
          <Eye x={4} y={-18} r={2.4} />
          <Path path={SMALL_SMILE} color={INK} style="stroke" strokeWidth={1.2} strokeCap="round" transform={[{ translateY: -3 }]} />
        </Group>
      );
    case 'eel':
      return (
        <Group>
          <Path path={EEL} color={INK} style="stroke" strokeWidth={8.5} strokeCap="round" />
          <Path path={EEL} color={body} style="stroke" strokeWidth={5.5} strokeCap="round" />
          <Circle cx={8} cy={-21} r={6} color={body} />
          <Circle cx={8} cy={-21} r={6} color={INK} style="stroke" strokeWidth={STROKE} />
          <Circle cx={4} cy={-25} r={1.8} color={accent} />
          <Eye x={10} y={-22} r={2.2} />
        </Group>
      );
    default:
      // Pumpkin placeholder (stands in for shark critters until Alex-based art lands).
      return (
        <Group>
          <Oval x={-12} y={-24} width={24} height={22} color={body} />
          <Path path={PUMPKIN_RIBS} color={NIGHT.pumpkinDark} style="stroke" strokeWidth={1.3} />
          <Oval x={-12} y={-24} width={24} height={22} color={INK} style="stroke" strokeWidth={STROKE} />
          <Oval x={-1.5} y={-28} width={3} height={5} color={accent} />
          <Circle cx={-4.5} cy={-15} r={2} color={belly} />
          <Circle cx={4.5} cy={-15} r={2} color={belly} />
          <Path path={SMILE} color={belly} style="stroke" strokeWidth={1.6} strokeCap="round" />
        </Group>
      );
  }
});
