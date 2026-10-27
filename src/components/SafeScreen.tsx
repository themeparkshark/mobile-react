import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SafeEdge = 'top' | 'bottom' | 'left' | 'right';
const ALL: readonly SafeEdge[] = ['top', 'bottom', 'left', 'right'];

type Pad = { padding?: unknown; paddingVertical?: unknown; paddingHorizontal?: unknown;
  paddingTop?: unknown; paddingBottom?: unknown; paddingLeft?: unknown; paddingRight?: unknown };
const num = (...v: unknown[]) => { for (const x of v) if (typeof x === 'number') return x; return 0; };

/**
 * The one way a full-screen route keeps clear of the Dynamic Island, the notch and the home bar.
 *
 * A drop-in for SafeAreaView that pads with the insets from useSafeAreaInsets (the JS hook), the
 * way Shark Pass does. The native SafeAreaView measures itself on screen, and on some pushed or
 * slid-in routes it kept a 0 top inset on Dynamic Island phones, so a title sat under the island.
 * The hook always has the phone's real insets. The inset is added to the style's own padding,
 * like the native view. Use it only for a view that touches the screen edges it pads.
 */
export default function SafeScreen({ edges = ALL, style, ...rest }: ViewProps & { readonly edges?: readonly SafeEdge[] }) {
  const insets = useSafeAreaInsets();
  const flat = (StyleSheet.flatten(style) ?? {}) as Pad;
  const has = (e: SafeEdge) => edges.includes(e);
  const pad = {
    paddingTop: num(flat.paddingTop, flat.paddingVertical, flat.padding) + (has('top') ? insets.top : 0),
    paddingBottom: num(flat.paddingBottom, flat.paddingVertical, flat.padding) + (has('bottom') ? insets.bottom : 0),
    paddingLeft: num(flat.paddingLeft, flat.paddingHorizontal, flat.padding) + (has('left') ? insets.left : 0),
    paddingRight: num(flat.paddingRight, flat.paddingHorizontal, flat.padding) + (has('right') ? insets.right : 0),
  };
  return <View {...rest} style={[style, pad]} />;
}
