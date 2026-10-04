/**
 * Repaint on reveal. MapLibre iOS takes an off-screen MarkerView out of the drawing
 * path; a Skia canvas inside it whose scene never changes (paused, no clock) does not
 * repaint when the marker comes back (after a GPS jump or a resume the encounter ring
 * and reef performers stayed blank while their views were on screen). ShowWhen bumps a
 * token around a relayout; the marker box goes 0.5 pt wider (re-adding the annotation) and
 * FrightCanvas ticks an always-mounted root Group. No node is mounted, swapped or removed.
 */
import { Canvas, Group } from '@shopify/react-native-skia';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

export const RepaintContext = createContext(0);

/** The root Group's opacity for a repaint token: alternates, never visibly different. */
export function repaintOpacity(token: number): number {
  return token % 2 === 1 ? 0.9999 : 1;
}

/**
 * A scene change alone does not bring back a marker MapLibre parked off screen; a change of the
 * marker's native frame re-adds it. ShowWhen's constant box is drawn 0.5 pt wider on odd tokens.
 */
export function repaintWidth(width: number, token: number): number {
  return token % 2 === 1 ? width + 0.5 : width;
}

export function FrightCanvas({ children, ...props }: ComponentProps<typeof Canvas> & { readonly children?: ReactNode }) {
  const token = useContext(RepaintContext);
  return (
    <Canvas {...props}>
      <Group opacity={repaintOpacity(token)}>{children}</Group>
    </Canvas>
  );
}
