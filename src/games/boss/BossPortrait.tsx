/**
 * The broken boss for the results card (design 11.8 4): the Kraken in this
 * round's damage state (hat off with a plaster after Break 1, the sling after
 * Break 2, the cracked dome after Break 3, one bandage with no Break), with
 * spiral eyes after a KO and squeezed eyes after a Retreat. Procedural
 * overlays in the navy-outline style until the K2 drawn variants land (Gate 0).
 */
import React, { useMemo } from 'react';
import { Canvas, Group, Image as SkImage, Oval, Path, Skia } from '@shopify/react-native-skia';
import { useArenaImages } from './useArenaImages';

const BODY = require('../../assets/games/boss/kraken_body.png');
const HAT_IMG = require('../../assets/games/boss/kraken_hat.png');
const SPR_AR = 600 / 593;
const HAT = { x: 50 / 600, y: 0, w: 262 / 600, h: 196 / 593 };
const EYE_L = { x: 0.425, y: 0.476 };
const EYE_R = { x: 0.608, y: 0.481 };
const INK = '#0E0C2A';
const CREAM = '#FFF1D6';
const PURPLE = '#6A44B6';

export function BossPortrait({ size, breaks, ko }: { size: number; breaks: number; ko: boolean }) {
  const img = useArenaImages({ body: BODY, hat: HAT_IMG });
  const S = size * 1.05;
  const H = S / SPR_AR;
  const ox = (size - S) / 2;
  const oy = size * 0.08;
  const shapes = useMemo(() => {
    const bx = ox;
    const by = oy;
    const rr = (cx: number, cy: number, w: number, h: number, a: number) => {
      const p = Skia.Path.Make();
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(-w / 2, -h / 2, w, h), h * 0.35, h * 0.35));
      const m = Skia.Matrix();
      m.translate(cx, cy);
      m.rotate(a);
      p.transform(m);
      return p;
    };
    const plaster = [rr(bx + 0.33 * S, by + 0.2 * H, 0.2 * S, 0.065 * S, 0.6), rr(bx + 0.33 * S, by + 0.2 * H, 0.2 * S, 0.065 * S, -0.6)];
    const sling = rr(bx + 0.22 * S, by + 0.7 * H, 0.18 * S, 0.064 * S, -0.5);
    const band = rr(bx + 0.66 * S, by + 0.36 * H, 0.14 * S, 0.05 * S, 0.3);
    const cracks = Skia.Path.Make();
    const x = bx + 0.62 * S;
    const y = by + 0.16 * H;
    cracks.moveTo(x, y);
    cracks.lineTo(x + 0.03 * S, y + 0.05 * S);
    cracks.lineTo(x + 0.01 * S, y + 0.09 * S);
    cracks.lineTo(x + 0.05 * S, y + 0.14 * S);
    cracks.moveTo(x + 0.03 * S, y + 0.05 * S);
    cracks.lineTo(x + 0.08 * S, y + 0.06 * S);
    const er = 0.05 * S;
    const spiral = (cx: number, cy: number) => {
      const q = Skia.Path.Make();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.42;
        const r = (i / 40) * er * 0.85;
        if (i === 0) q.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else q.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      return q;
    };
    const squeeze = (cx: number, cy: number, dir: number) => {
      const q = Skia.Path.Make();
      q.moveTo(cx - dir * er * 0.7, cy - er * 0.55);
      q.lineTo(cx + dir * er * 0.55, cy);
      q.lineTo(cx - dir * er * 0.7, cy + er * 0.55);
      return q;
    };
    const lx = bx + EYE_L.x * S;
    const ly = by + EYE_L.y * H;
    const rx = bx + EYE_R.x * S;
    const ry = by + EYE_R.y * H;
    return { plaster, sling, band, cracks, er, lx, ly, rx, ry, sl: spiral(lx, ly), sr: spiral(rx, ry), hl: squeeze(lx, ly, 1), hr: squeeze(rx, ry, -1) };
  }, [S, H, ox, oy]);
  const sw = S * 0.016;
  const e = shapes;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ rotate: ko ? -0.12 : 0.05 }]} origin={{ x: size / 2, y: size / 2 }}>
        {img.body ? <SkImage image={img.body} x={ox} y={oy} width={S} height={H} /> : null}
        {breaks < 1 && img.hat ? <SkImage image={img.hat} x={ox + HAT.x * S} y={oy + HAT.y * H} width={HAT.w * S} height={HAT.h * H} /> : null}
        {breaks >= 1 ? e.plaster.map((p, i) => (
          <Group key={i}>
            <Path path={p} color={CREAM} />
            <Path path={p} style="stroke" strokeWidth={S * 0.012} color={INK} />
          </Group>
        )) : null}
        {breaks >= 2 ? (
          <Group>
            <Path path={e.sling} color={CREAM} />
            <Path path={e.sling} style="stroke" strokeWidth={S * 0.012} color={INK} />
          </Group>
        ) : null}
        {breaks >= 3 ? <Path path={e.cracks} style="stroke" strokeWidth={S * 0.014} strokeCap="round" color={INK} /> : null}
        {breaks === 0 ? (
          <Group>
            <Path path={e.band} color={CREAM} />
            <Path path={e.band} style="stroke" strokeWidth={S * 0.012} color={INK} />
          </Group>
        ) : null}
        <Oval x={e.lx - e.er * 1.08} y={e.ly - e.er * 0.98} width={e.er * 2.16} height={e.er * 1.96} color={ko ? '#FFFFFF' : PURPLE} />
        <Oval x={e.rx - e.er * 1.08} y={e.ry - e.er * 0.98} width={e.er * 2.16} height={e.er * 1.96} color={ko ? '#FFFFFF' : PURPLE} />
        {ko ? (
          <Group>
            <Path path={e.sl} style="stroke" strokeWidth={sw * 0.8} strokeCap="round" color={INK} />
            <Path path={e.sr} style="stroke" strokeWidth={sw * 0.8} strokeCap="round" color={INK} />
          </Group>
        ) : (
          <Group>
            <Path path={e.hl} style="stroke" strokeWidth={sw} strokeCap="round" strokeJoin="round" color={INK} />
            <Path path={e.hr} style="stroke" strokeWidth={sw} strokeCap="round" strokeJoin="round" color={INK} />
          </Group>
        )}
      </Group>
    </Canvas>
  );
}
