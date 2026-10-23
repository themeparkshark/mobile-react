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
    <Text numberOfLines={numberOfLines} adjustsFontSizeToFit minimumFontScale={minimumFontScale}
      accessibilityLabel={spokenLabel(children)} {...rest}>
      {upper(children)}
    </Text>
  );
}

const NO_TRANSFORM = { textTransform: 'none' } as const;

/**
 * What VoiceOver reads: the words as written (mixed case), so it never spells out a short
 * all-capital word letter by letter. Only for plain text; anything richer keeps its own label.
 */
export function spokenLabel(children: ReactNode): string | undefined {
  const parts: string[] = [];
  let plain = true;
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') parts.push(String(child));
    else if (child !== null && child !== undefined && typeof child !== 'boolean') plain = false;
  });
  const text = parts.join('');
  return plain && text.trim() ? text : undefined;
}

/**
 * Drop-in for a Text whose style says textTransform: 'uppercase': same props and line rules,
 * but the words are capitalised in code so iOS measures the real width (no clipped last letters).
 */
export function UpperText({ children, style, ...rest }: TextProps) {
  return <Text accessibilityLabel={spokenLabel(children)} {...rest} style={[style, NO_TRANSFORM]}>{upper(children)}</Text>;
}
