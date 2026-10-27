/**
 * Round 5: the catch's gold, drawn once with Skia (static art; only its wrapper moves).
 *
 * A soft radial gold bloom lights the map behind the find (the "lit moment" the r4 frame lacked), and a
 * hand-inked sunburst sits on it: 16 tapered rays, long and short alternating, each a little different in
 * length, width and bend, filled warm gold with a white highlight stroke and Alex's navy ink on the edge,
 * so it reads as cartoon art and not a radial clip-art fan. Blue, white and gold only. No per-frame
 * redraw: the catch clock scales, turns and fades the wrapper on the UI thread.
 */
import { memo, useMemo } from 'react';
import { Canvas, Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { GOLD_FX } from '../../ui/motion';
import { CATCH_RAY_COUNT, catchRayShape } from '../../components/map/alive/mapWow';

const INK = 'rgba(11,58,115,0.75)';

/** The rays' paths for one size (built once per size, shared by every catch). */
function useRayPaths(size: number) {
  const c = size / 2;
  return useMemo(() => {
    const body = Skia.Path.Make();
    const hi = Skia.Path.Make();
    for (let i = 0; i < CATCH_RAY_COUNT; i++) {
      const { angle, r0, len, half, bend } = catchRayShape(i, size);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      // Local (along, across) to screen.
      const P = (a: number, b: number) => [c + a * cos - b * sin, c + a * sin + b * cos] as const;
      const [bx1, by1] = P(r0, -half);
      const [cx1, cy1] = P(len * 0.55, -half * 0.55 + bend);
      const [tx, ty] = P(len, bend * 0.6);
      const [cx2, cy2] = P(len * 0.55, half * 0.55 + bend);
      const [bx2, by2] = P(r0, half);
      body.moveTo(bx1, by1);
      body.quadTo(cx1, cy1, tx, ty);
      body.quadTo(cx2, cy2, bx2, by2);
      body.close();
      // The white shine along the lit side of each long ray (a hand-drawn highlight).
      if (i % 2 === 0) {
        const [hx1, hy1] = P(r0 + 8, -half * 0.42);
        const [hx2, hy2] = P(len * 0.58, -half * 0.22 + bend * 0.8);
        hi.moveTo(hx1, hy1);
        hi.lineTo(hx2, hy2);
      }
    }
    return { rays: body, shine: hi };
  }, [size, c]);
}

/**
 * Wave 4: the bloom and the inked rays as Skia nodes (drawn in a size x size box from 0,0), so the catch burst
 * lives in one canvas whose transforms come straight from the UI-thread clock (no view style a React commit
 * could reset). `raysOnly` drops the bloom (the grand catch's second, counter-turning ring).
 */
export const CatchRaysArt = memo(function CatchRaysArt({ size, raysOnly = false }: { readonly size: number; readonly raysOnly?: boolean }) {
  const c = size / 2;
  const { rays, shine } = useRayPaths(size);
  return (
    <Group>
      {/* The light: warm and soft, white-hot at the centre, gone at the rim (never a hard disc). */}
      {!raysOnly && <Circle cx={c} cy={c} r={c}>
        <RadialGradient c={vec(c, c)} r={c}
          colors={['rgba(255,251,234,1)', 'rgba(255,213,74,0.75)', 'rgba(255,201,60,0.3)', 'rgba(255,201,60,0)']}
          positions={[0, 0.2, 0.55, 1]} />
      </Circle>}
      <Path path={rays}>
        <RadialGradient c={vec(c, c)} r={c * 0.92} colors={[GOLD_FX.core, GOLD_FX.rays, '#F2A91E']} positions={[0.08, 0.38, 1]} />
      </Path>
      <Path path={rays} style="stroke" strokeWidth={2.2 * (size / 320)} strokeJoin="round" color={INK} />
      <Path path={shine} style="stroke" strokeWidth={1.8 * (size / 320)} strokeCap="round" color="rgba(255,255,255,0.8)" />
    </Group>
  );
});

/** The same art in its own canvas (static; a wrapper view moves it). */
function CatchRays({ size }: { readonly size: number }) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <CatchRaysArt size={size} />
    </Canvas>
  );
}

export default memo(CatchRays);
