/**
 * The only style a screen may hand a kit part: where it sits and how much room it takes (margins,
 * flex, alignment, width, a least height, absolute offsets). Never a colour, a border, a radius,
 * padding or a fixed height: the look comes from the part, so a screen cannot paint a box onto it.
 */
import type { ViewStyle } from 'react-native';

export type LayoutStyle = Pick<ViewStyle,
  | 'margin' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'marginHorizontal' | 'marginVertical'
  | 'flex' | 'flexGrow' | 'flexShrink' | 'flexBasis' | 'alignSelf'
  | 'width' | 'minWidth' | 'maxWidth' | 'minHeight'
  | 'position' | 'left' | 'right' | 'top' | 'bottom' | 'zIndex'>;
