import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';

/**
 * Capital letters written in code, not with textTransform: 'uppercase'.
 *
 * iOS measures a line with textTransform before it is uppercased, so a fixed-width label sized
 * for "Universal Studios Hollywood" got cut to "UNIVERSAL STUDIOS HOLLYWOO" (wider capitals,
 * no ellipsis). Uppercasing the words themselves gives the layout the real width.
 */
export function upper(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return child.toUpperCase();
    if (isValidElement(child) && (child.props as { children?: ReactNode }).children !== undefined) {
      const el = child as ReactElement<{ children?: ReactNode }>;
      return cloneElement(el, undefined, upper(el.props.children));
    }
    return child;
  });
}

/**
 * A capital-letter label that never clips: uppercased in code, up to two lines by default,
 * and it may shrink to 85% before it wraps. Use it for fixed-width Knockout labels.
 */
export default function UpperLabel({ children, numberOfLines = 2, minimumFontScale = 0.85, ...rest }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} adjustsFontSizeToFit minimumFontScale={minimumFontScale} {...rest}>
      {upper(children)}
    </Text>
  );
}

const NO_TRANSFORM = { textTransform: 'none' } as const;

/**
 * Drop-in for a Text whose style says textTransform: 'uppercase': same props and line rules,
 * but the words are capitalised in code so iOS measures the real width (no clipped last letters).
 */
export function UpperText({ children, style, ...rest }: TextProps) {
  return <Text {...rest} style={[style, NO_TRANSFORM]}>{upper(children)}</Text>;
}
