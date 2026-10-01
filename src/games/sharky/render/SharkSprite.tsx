/**
 * The shark (design v7.1 7.1, 5.1): Alex's swim pose with the tail mesh as the
 * only swim motion (rear 40%, continuous phase from render/pres.ts), drawn
 * frames only for extreme poses (chomp, dizzy, bonked, cheer), a permanent
 * white sticker rim outside an ink contact rim (render-time filters, never a
 * repaint), the proximity warm-up to gold in the Close band, Overdrive
 * afterimages, and the on-shark readouts: the chain badge with its drain ring
 * (behind and above), the dorsal-fin Boost glow and the Overdrive charge ring.
 *
 * Everything is in view units (720 x 1000u) inside the camera group.
 */

import React, { useMemo } from 'react';
import {
  BlendMode, Circle, Group, Image as SkImage, ImageShader, Path, Skia, Text as SkText, Vertices, vec,
  type SkFont, type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  BOOST_MAX, CHAIN_WINDOW, FRENZY_STEPS, OD_STEPS, PH_DONE, PH_POCKET, PH_WIPE, chainTier, multiplier,
  type SimState,
} from '../sim/core';
import { presSharkY, type Pres } from './pres';
import { BOOST, INK, NEUTRAL, REWARD, REWARD_PALE, TIER_COLORS } from './palette';

export const SHARK_W = 180;
const TEX_W = 576;
const TEX_H = 331;
export const SHARK_H = (SHARK_W * TEX_H) / TEX_W;
const COLS = 12;
const ROWS = 4;
/** Dorsal fin tip on the swim pose (fraction of width/height from the top-left). */
const FIN_TIP = { u: 0.42, v: 0.07 };

const INDICES = (() => {
  const idx: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c;
      idx.push(a, a + 1, a + COLS + 1, a + 1, a + COLS + 2, a + COLS + 1);
    }
  }
  return idx;
})();

function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

/** Render-time pose shared by every layer of the shark. */
export interface SharkLook {
  x: number;
  y: number;
  tilt: number;
  sx: number;
  sy: number;
  alpha: number;
  /** 0 swim (mesh), 1 chomp / Overdrive start, 2 dizzy, 3 bonked, 4 cheer. */
  pose: number;
  lift: number;
  spin: number;
}

export function sharkLook(s: SimState, p: Pres, alpha: number): SharkLook {
  'worklet';
  const yy = lerp(s.py, s.y, alpha) / 256;
  const y = presSharkY(p, yy);
  const now = p.fx;
  let x = p.anc;
  // Hit: slide back 16pt (30u) over 120ms, ease home over 300ms (presentation only).
  const th = now - p.hitT;
  if (th >= 0 && th < 420) x -= th < 120 ? 30 * (th / 120) : 30 * (1 - (th - 120) / 300);
  const vy = s.vy / 256;
  let tilt = vy / 1400;
  if (tilt < -0.45) tilt = -0.45;
  if (tilt > 0.55) tilt = 0.55;
  if (s.float > 0 || s.phase === PH_POCKET) tilt *= 0.3;
  // Release: a small overshoot past rest (the fin flick reads through the body).
  const tr = now - p.releaseT;
  if (tr >= 0 && tr < 250) tilt += 0.07 * Math.sin((tr / 250) * Math.PI) * (1 - tr / 250);
  let sx = 1;
  let sy = 1;
  // Press: 60ms anticipation squash 1.06 x 0.94 (origin at the tail), spring back.
  const tp = now - p.pressT;
  if (tp >= 0 && tp < 60) {
    const k = tp / 60;
    sx = 1 + 0.06 * k;
    sy = 1 - 0.06 * k;
  } else if (tp >= 60 && tp < 260) {
    const k = (tp - 60) / 200;
    const sp = Math.exp(-5 * k) * Math.cos(k * 9);
    sx = 1 + 0.06 * sp;
    sy = 1 - 0.06 * sp;
  }
  // Chomp: 50ms mouth-open anticipation then the smear frame.
  let a = 1;
  if (s.iframes > 0 && s.reviveShield === 0 && s.od === 0 && now - p.hitT < 1000 && Math.floor(now / 50) % 2 === 1) a = 0.5;
  let pose = 0;
  let lift = 0;
  let spin = 0;
  if (s.phase === PH_WIPE || (s.phase === PH_DONE && s.hearts <= 0)) {
    pose = 3;
    const k = Math.min(1, s.phaseSteps / 54);
    const e = 1 - (1 - k) * (1 - k);
    spin = e * Math.PI * 3;
    lift = -120 * e;
  } else if (s.phase === PH_DONE) {
    pose = 4;
    const k = Math.min(1, (now - p.endT) / 500);
    lift = -40 * Math.sin(k * Math.PI);
  } else if (now - p.chompT < 200 || now - p.odStartT < 220) {
    pose = 1;
  } else if (now - p.hitT < 450 && s.reviveShield === 0) {
    pose = 2;
  }
  return { x, y, tilt, sx, sy, alpha: a, pose, lift, spin };
}

function rimPaint(color: string, r: number) {
  const p = Skia.Paint();
  p.setImageFilter(
    Skia.ImageFilter.MakeColorFilter(
      Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
      Skia.ImageFilter.MakeDilate(r, r, null),
    ),
  );
  return p;
}

interface BodyProps {
  look: SharedValue<SharkLook>;
  verts: SharedValue<ReturnType<typeof vec>[]>;
  tex: ReturnType<typeof vec>[];
  swim: SkImageType | null;
  dash: SkImageType | null;
  dizzy: SkImageType | null;
  bonked: SkImageType | null;
  cheer: SkImageType | null;
}

/** One drawing of the shark (swim mesh or the pose frame); rendered once per rim layer. */
const Body = React.memo(function Body({ look, verts, tex, swim, dash, dizzy, bonked, cheer }: BodyProps) {
  const transform = useDerivedValue(() => {
    const l = look.value;
    return [
      { translateX: l.x },
      { translateY: l.y + l.lift },
      { rotate: l.tilt + l.spin },
      { translateX: -SHARK_W * 0.42 },
      { scaleX: l.sx },
      { scaleY: l.sy },
      { translateX: SHARK_W * 0.42 },
    ];
  });
  const op = (k: number) => useDerivedValue(() => (look.value.pose === k ? 1 : 0));
  const o0 = op(0);
  const o1 = op(1);
  const o2 = op(2);
  const o3 = op(3);
  const o4 = op(4);
  const DH = (SHARK_W * 1.1 * 458) / 768;
  const rect = useMemo(() => ({ x: 0, y: 0, width: SHARK_W, height: SHARK_H }), []);
  return (
    <Group transform={transform}>
      {swim ? (
        <Group opacity={o0}>
          <Vertices vertices={verts} textures={tex} indices={INDICES} mode="triangles">
            <ImageShader image={swim} rect={rect} fit="fill" />
          </Vertices>
        </Group>
      ) : null}
      {dash ? <SkImage image={dash} x={-SHARK_W * 0.55} y={-DH / 2} width={SHARK_W * 1.1} height={DH} opacity={o1} /> : null}
      {dizzy ? <SkImage image={dizzy} x={-72} y={-100} width={144} height={200} opacity={o2} /> : null}
      {bonked ? <SkImage image={bonked} x={-74} y={-100} width={148} height={198} opacity={o3} /> : null}
      {cheer ? <SkImage image={cheer} x={-77} y={-96} width={154} height={192} opacity={o4} /> : null}
    </Group>
  );
});

export interface SharkSpriteProps {
  sim: SharedValue<SimState>;
  pres: SharedValue<Pres>;
  tick: SharedValue<number>;
  alpha: SharedValue<number>;
  swim: SkImageType | null;
  dash: SkImageType | null;
  dizzy: SkImageType | null;
  bonked: SkImageType | null;
  cheer: SkImageType | null;
  bubble: SkImageType | null;
  font: SkFont | null;
  reducedMotion: boolean;
}

export const SharkSprite = React.memo(function SharkSprite({
  sim, pres, tick, alpha, swim, dash, dizzy, bonked, cheer, bubble, font, reducedMotion,
}: SharkSpriteProps) {
  const look = useDerivedValue(() => {
    tick.value;
    return sharkLook(sim.value, pres.value, alpha.value);
  });
  // Mesh in local shark space: (0,0) is the centre; rest grid spans the frame.
  const tex = useMemo(() => {
    const pts = [];
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) pts.push(vec((SHARK_W * c) / COLS, (SHARK_H * r) / ROWS));
    return pts;
  }, []);
  const verts = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const pts = [];
    const amp = reducedMotion ? 0 : p.tailAmp;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const u = c / COLS;
        const x = -SHARK_W / 2 + SHARK_W * u;
        let y = -SHARK_H / 2 + (SHARK_H * r) / ROWS;
        // Rear 40% only (u < 0.4: the image faces right, the tail is on the left).
        if (u < 0.4) {
          const k = (0.4 - u) / 0.4;
          const env = k * Math.sqrt(k);
          y += Math.sin(p.tailPh - 0.7 * k * 2 * Math.PI) * amp * env;
        }
        pts.push(vec(x, y));
      }
    }
    return pts;
  });
  const sticker = useMemo(() => rimPaint(NEUTRAL, 7), []);
  const gold = useMemo(() => rimPaint(REWARD, 7), []);
  const ink = useMemo(() => {
    const pt = rimPaint(INK, 2);
    pt.setAlphaf(0.6);
    return pt;
  }, []);
  // Gold rim: warms with the Close band, stays gold in Frenzy and Overdrive, shimmers when armed.
  const goldOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    if (s.frenzy > 0) {
      // Last 1500ms of Frenzy the rim blinks at 4Hz.
      if (s.frenzy < 90 && Math.floor(p.fx / 125) % 2 === 1) return 0.2;
      return 1;
    }
    if (s.od > 0) return 1;
    if (s.odArmed) return 0.45 + 0.25 * Math.sin(p.fx / 180);
    return p.warm;
  });
  const bodyOp = useDerivedValue(() => look.value.alpha);

  // --- Overdrive afterimages: 4 copies every 30ms, alpha 0.45 -> 0 ------------
  const ghostOp = useDerivedValue(() => (tick.value, sim.value.od > 0 && !reducedMotion ? 1 : 0));
  const ghostT = [1, 2, 3, 4].map((k) => useDerivedValue(() => {
    const l = look.value;
    const p = pres.value;
    const s = sim.value;
    const back = (k * 30 * (s.speedEff / 256)) / 1000;
    const yk = p.yh[(p.yhHead - k + 8 * 4) % 8];
    return [{ translateX: l.x - back }, { translateY: yk }, { rotate: l.tilt }];
  }));

  // --- Chain badge on the shark (5.1): behind and above, lag spring, drain ring ---
  const badge = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const t = chainTier(s);
    const show = s.frenzy > 0 || t > 0;
    const sincePop = p.fx - p.tierT;
    const pop = sincePop >= 0 && sincePop < 250 ? 1 + 0.25 * Math.sin((sincePop / 250) * Math.PI) : 1;
    const fpop = p.fx - p.frenzyT < 300 ? 1 + 0.5 * Math.sin(((p.fx - p.frenzyT) / 300) * Math.PI) : 1;
    const text = s.frenzy > 0 ? 'FRENZY' : `x${multiplier(s)}`;
    const k = s.frenzy > 0 ? s.frenzy / FRENZY_STEPS : s.chainTimer / CHAIN_WINDOW;
    const color = s.frenzy > 0 ? REWARD : TIER_COLORS[t];
    return { show: show ? 1 : 0, scale: pop * fpop, text, k, color, white: !s.frenzy && s.chainTimer < 30 ? 1 : 0 };
  });
  const badgeT = useDerivedValue(() => {
    const p = pres.value;
    const b = badge.value;
    return [{ translateX: p.bx }, { translateY: p.by }, { scale: b.scale }];
  });
  const badgeOp = useDerivedValue(() => badge.value.show);
  const badgeText = useDerivedValue(() => badge.value.text);
  const badgeTextX = useDerivedValue(() => (font ? -font.measureText(badge.value.text).width / 2 : 0));
  const badgeColor = useDerivedValue(() => badge.value.color);
  const drain = useDerivedValue(() => {
    const b = badge.value;
    const path = Skia.Path.Make();
    const r = 46;
    path.addArc(Skia.XYWHRect(-r, -r - 10, r * 2, r * 2), -90, 360 * Math.max(0, Math.min(1, b.k)));
    return path;
  });
  const drainColor = useDerivedValue(() => (badge.value.white ? NEUTRAL : badge.value.color));
  // Shatter on a break: 4 shards fall over 400ms, the number spins off.
  const shards = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const path = Skia.Path.Make();
    const t = p.fx - p.breakT;
    if (t < 0 || t > 400) return path;
    const k = t / 400;
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * 34 * k;
      const dy = 120 * k * k + (i % 2) * 10;
      const x = p.bx + dx;
      const y = p.by + dy - 10;
      path.moveTo(x - 12, y - 8);
      path.lineTo(x + 10, y - 12);
      path.lineTo(x + 4, y + 12);
      path.close();
    }
    return path;
  });
  const shardOp = useDerivedValue(() => {
    const t = pres.value.fx - pres.value.breakT;
    return t >= 0 && t < 400 ? 1 - t / 400 : 0;
  });

  // --- Boost: the dorsal fin tip glows per charged segment (sky, brighter sky, gold) ---
  const fin = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const l = look.value;
    const segs = s.od > 0 ? 3 : Math.floor(s.boost / 100);
    const fx = -SHARK_W / 2 + SHARK_W * FIN_TIP.u;
    const fy = -SHARK_H / 2 + SHARK_H * FIN_TIP.v;
    const c = Math.cos(l.tilt);
    const sn = Math.sin(l.tilt);
    return { x: l.x + fx * c - fy * sn, y: l.y + l.lift + fx * sn + fy * c, segs, show: s.etier >= 2 && l.pose === 0 ? 1 : 0 };
  });
  const finX = useDerivedValue(() => fin.value.x);
  const finY = useDerivedValue(() => fin.value.y);
  const finR = useDerivedValue(() => (fin.value.segs <= 0 ? 0 : 9 + fin.value.segs * 3 + Math.sin(pres.value.fx / 90) * 1.5));
  const finColor = useDerivedValue(() => (fin.value.segs >= 3 ? REWARD : fin.value.segs === 2 ? '#9be6ff' : BOOST));
  const finOp = useDerivedValue(() => fin.value.show * (fin.value.segs > 0 ? 0.9 : 0));

  // --- Overdrive charge ring (Brawl Stars): fills 200ms, pops white, then shimmers ---
  const charge = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const t = p.fx - p.odArmT;
    const l = look.value;
    const path = Skia.Path.Make();
    let op = 0;
    let w = 6;
    if (s.odArmed && t >= 0) {
      const fill = Math.min(1, t / 200);
      path.addArc(Skia.XYWHRect(l.x - 104, l.y - 74, 208, 148), -90, 360 * fill);
      op = t < 200 ? 1 : 0.55 + 0.25 * Math.sin(p.fx / 160);
      w = t > 200 && t < 300 ? 12 * (1 - (t - 200) / 100) + 6 : 6;
    } else if (s.od > 0) {
      const k = s.od / OD_STEPS;
      path.addArc(Skia.XYWHRect(l.x - 104, l.y - 74, 208, 148), -90, 360 * k);
      op = 0.85;
    }
    return { path, op, w, flash: s.odArmed && t >= 200 && t < 300 ? 1 - (t - 200) / 100 : 0 };
  });
  const chargePath = useDerivedValue(() => charge.value.path);
  const chargeOp = useDerivedValue(() => charge.value.op);
  const chargeW = useDerivedValue(() => charge.value.w);
  const chargeFlash = useDerivedValue(() => charge.value.flash);

  // --- Bubble Float and shields -------------------------------------------------
  const floatT = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const l = look.value;
    let sc = 0;
    if (s.float > 0) {
      const k = Math.min(1, s.floatSteps / 24);
      const back = 1.4;
      sc = Math.max(0, 1 + (back + 1) * Math.pow(k - 1, 3) + back * Math.pow(k - 1, 2));
    }
    return [{ translateX: l.x }, { translateY: l.y }, { scale: sc }];
  });
  const shieldOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.shield || s.reviveShield > 0 ? 0.55 + 0.1 * Math.sin(s.worldT / 5) : 0;
  });
  const shieldT = useDerivedValue(() => [{ translateX: look.value.x }, { translateY: look.value.y }]);
  const bodyProps = { look, verts, tex, swim, dash, dizzy, bonked, cheer };
  void BOOST_MAX;

  return (
    <Group>
      {/* Overdrive afterimages */}
      {swim ? (
        <Group opacity={ghostOp}>
          {ghostT.map((t, k) => (
            <Group key={k} transform={t} opacity={0.45 - k * 0.1}>
              <SkImage image={swim} x={-SHARK_W / 2} y={-SHARK_H / 2} width={SHARK_W} height={SHARK_H} />
            </Group>
          ))}
        </Group>
      ) : null}
      {/* Chain badge: behind the shark, so it never covers the nose or a stamp */}
      <Group transform={badgeT} opacity={badgeOp}>
        <Circle cx={0} cy={-10} r={40} color={NEUTRAL} opacity={0.92} />
        <Circle cx={0} cy={-10} r={40} style="stroke" strokeWidth={5} color={INK} />
        <Path path={drain} style="stroke" strokeWidth={9} strokeCap="round" color={INK} />
        <Path path={drain} style="stroke" strokeWidth={5} strokeCap="round" color={drainColor} />
        {font ? (
          <Group>
            <SkText x={badgeTextX} y={4} text={badgeText} font={font} color={INK} style="stroke" strokeWidth={9} />
            <SkText x={badgeTextX} y={4} text={badgeText} font={font} color={NEUTRAL} style="stroke" strokeWidth={3} />
            <SkText x={badgeTextX} y={4} text={badgeText} font={font} color={badgeColor} />
          </Group>
        ) : null}
      </Group>
      <Path path={shards} color={REWARD_PALE} opacity={shardOp} />
      <Path path={shards} style="stroke" strokeWidth={3} color={INK} opacity={shardOp} />

      {/* Sticker rim (white 5u) and the gold warm-up / Frenzy rim, under an ink contact rim */}
      <Group opacity={bodyOp}>
        <Group layer={sticker}>
          <Body {...bodyProps} />
        </Group>
        <Group opacity={goldOp}>
          <Group layer={gold}>
            <Body {...bodyProps} />
          </Group>
        </Group>
        <Group layer={ink}>
          <Body {...bodyProps} />
        </Group>
        <Body {...bodyProps} />
      </Group>

      {/* Boost fin glow */}
      <Group opacity={finOp}>
        <Circle cx={finX} cy={finY} r={finR} color={finColor} opacity={0.55} />
        <Circle cx={finX} cy={finY} r={useDerivedValue(() => finR.value * 0.45)} color={NEUTRAL} opacity={0.9} />
      </Group>
      {/* Overdrive charge ring */}
      <Group opacity={chargeOp}>
        <Path path={chargePath} style="stroke" strokeWidth={useDerivedValue(() => chargeW.value + 5)} strokeCap="round" color={INK} />
        <Path path={chargePath} style="stroke" strokeWidth={chargeW} strokeCap="round" color={REWARD} />
        <Path path={chargePath} style="stroke" strokeWidth={chargeW} strokeCap="round" color={NEUTRAL} opacity={chargeFlash} />
      </Group>

      {/* Shield / revive bubble */}
      <Group transform={shieldT} opacity={shieldOp}>
        <Circle cx={0} cy={0} r={104} color="#bfeaff" opacity={0.35} />
        <Circle cx={0} cy={0} r={104} style="stroke" strokeWidth={6} color={NEUTRAL} />
        <Circle cx={-38} cy={-50} r={13} color={NEUTRAL} opacity={0.8} />
      </Group>
      {/* Bubble Float */}
      <Group transform={floatT}>
        {bubble ? <SkImage image={bubble} x={-132} y={-132} width={264} height={264} opacity={0.55} /> : null}
        <Circle cx={0} cy={0} r={126} style="stroke" strokeWidth={5} color={NEUTRAL} opacity={0.9} />
      </Group>
    </Group>
  );
});
