/**
 * Row and Stack (Arrange): the kit's two layout primitives, so a screen lays pieces out with named gaps
 * (GAP, on the 4 pt base) and alignment words, never with inline style objects and hand numbers.
 * `even` gives every child an equal column (the win card's five prizes, their spots and counts
 * line up because both rows use it).
 */
import { Children, memo, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { LayoutStyle } from './style';
import { GAP } from './tokens';

export type GapName = keyof typeof GAP;
type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type Justify = 'start' | 'center' | 'end' | 'between' | 'around';

const ALIGN: Record<Align, ViewStyle['alignItems']> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY: Record<Justify, ViewStyle['justifyContent']> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' };

type Common = {
  readonly gap?: GapName;
  readonly align?: Align;
  readonly justify?: Justify;
  readonly style?: StyleProp<LayoutStyle>;
  readonly children?: ReactNode;
};

const EVEN: ViewStyle = { flex: 1, alignItems: 'center' };

export const Row = memo(function Row({ gap = 'base', align = 'center', justify = 'start', wrap = false, even = false, style, children }: Common & {
  /** Children wrap to a new line when they do not fit. */
  readonly wrap?: boolean;
  /** Every child gets an equal column, centred. */
  readonly even?: boolean;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap: GAP[gap], alignItems: ALIGN[align], justifyContent: JUSTIFY[justify], flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>
      {even ? Children.map(children, c => (c == null || c === false ? null : <View style={EVEN}>{c}</View>)) : children}
    </View>
  );
});

export const Stack = memo(function Stack({ gap = 'base', align = 'stretch', justify = 'start', style, children }: Common) {
  return <View style={[{ gap: GAP[gap], alignItems: ALIGN[align], justifyContent: JUSTIFY[justify] }, style]}>{children}</View>;
});

/** A flexible space that takes what is left (push the next piece to the end of a row or stack). */
export function Fill() {
  return <View style={{ flex: 1 }} />;
}
