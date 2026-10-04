/**
 * Repaint on reveal. MapLibre iOS takes an off-screen MarkerView out of the drawing
 * path; a Skia canvas inside it whose scene never changes (paused, no clock) does not
 * repaint when the marker comes back (after a GPS jump or a resume the encounter ring
 * and reef performers stayed blank while their views were on screen). ShowWhen bumps a
 * token when its spot is revealed; FrightCanvas turns that into a 0.5 pt size change (a new
 * drawable) and a scene change on an always-mounted root Group. No node is mounted, swapped
 * or removed.
 */
import { Canvas, Group } from '@shopify/react-native-skia';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

export const RepaintContext = createContext(0);

/** The root Group's opacity for a repaint token: alternates, never visibly different. */
export function repaintOpacity(token: number): number {
  return token % 2 === 1 ? 0.9999 : 1;
}

/**
 * A scene change alone does not bring back a canvas that MapLibre took off screen (its Metal
 * drawable is gone); a size change rebuilds it. Odd tokens draw the canvas 0.5 pt wider.
 */
export function repaintWidth(width: number, token: number): number {
  return token % 2 === 1 ? width + 0.5 : width;
}

export function FrightCanvas({ children, style, ...props }: ComponentProps<typeof Canvas> & { readonly children?: ReactNode }) {
  const token = useContext(RepaintContext);
  const flat = StyleSheet.flatten(style) ?? {};
  const width = typeof flat.width === 'number' ? repaintWidth(flat.width, token) : flat.width;
  return (
    <Canvas {...props} style={[style, { width }]}>
      <Group opacity={repaintOpacity(token)}>{children}</Group>
    </Canvas>
  );
}
