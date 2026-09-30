/**
 * Stage: the back Skia canvas (design 8 + 11.2 + 11.5).
 *
 * Layers, back to front: sky + sunburst, sea band with a stepped (12fps)
 * shimmer, boardwalk deck, marquee arch with beat-chasing bulbs and bunting,
 * two podiums, you (Alex's classic shark, mirrored to face the host) and
 * Captain Fin (gate-passed 12-cell sheet + spring hat layer), then a crowd
 * of Alex's shark colours holding foam fingers that bob on the beat.
 *
 * Environment shapes are drawn in code with the charcoal outline rule; every
 * character and prop is Alex's art or a gate-passed studio piece.
 */
import React, { useMemo } from 'react';
import {
  Canvas, Circle, Group, Image as SkImage, LinearGradient, Path, Rect, RoundedRect, Skia, useImage, vec,
  type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Sunburst } from '../../../gamekit/fx/ShaderFx';
import { ART, C, CROWD_LOOKS, FIN_CELL, FIN_POSE_ORDER, FIN_POSES, HAT_ANCHOR, SHARKS, type SharkLook } from '../art';

export interface StageActors {
  /** Index into FIN_POSE_ORDER. */
  finPose: SharedValue<number>;
  finSX: SharedValue<number>;
  finSY: SharedValue<number>;
  finY: SharedValue<number>;
  finRot: SharedValue<number>;
  hatRot: SharedValue<number>;
  hatY: SharedValue<number>;
  meSX: SharedValue<number>;
  meSY: SharedValue<number>;
  meY: SharedValue<number>;
  meRot: SharedValue<number>;
  shades: SharedValue<number>;
  /** 0..1 crowd cheer (fingers up). */
  cheer: SharedValue<number>;
  /** Crowd lean back on a photo finish. */
  crowdLean: SharedValue<number>;
  sunburst: SharedValue<number>;
  /** Fractional beat index (bulbs on 8ths, crowd bob on quarters). */
  beat: SharedValue<number>;
  /** 1 = 16th-note bulb chase (drum-roll). */
  bulbFast: SharedValue<number>;
  /** Final: spotlights + 90% stage. */
  spot: SharedValue<number>;
  /** Stage zoom/push (camera rig), 1 = rest. */
  push: SharedValue<number>;
  pushX: SharedValue<number>;
  /** Idle clock (ms) for breathing, drift and the sea shimmer. */
  t: SharedValue<number>;
  /** Winner podium rise (results): me, opp. */
  podMe: SharedValue<number>;
  podOpp: SharedValue<number>;
}

interface Props {
  width: number;
  height: number;
  actors: StageActors;
  /** 'fin' draws Captain Fin; a shark look draws a ghost/rival shark. */
  opponent: 'fin' | SharkLook;
  ghost?: boolean;
  meLook?: SharkLook;
  stripes: number;
  sunburstSpeed: number;
  reducedMotion?: boolean;
}

function archPath(cx: number, top: number, w: number, h: number, band: number) {
  const p = Skia.Path.Make();
  const l = cx - w / 2;
  const r = cx + w / 2;
  p.moveTo(l, top + h);
  p.cubicTo(l, top - h * 0.18, r, top - h * 0.18, r, top + h);
  p.lineTo(r - band, top + h);
  p.cubicTo(r - band, top + band * 0.9, l + band, top + band * 0.9, l + band, top + h);
  p.close();
  return p;
}

function archPoint(cx: number, top: number, w: number, h: number, band: number, u: number) {
  // Midline of the arch band (cubic), u in 0..1.
  const l = cx - w / 2 + band / 2;
  const r = cx + w / 2 - band / 2;
  const y0 = top + h;
  const c1y = top - h * 0.18 + band * 0.9 / 2;
  const x = (1 - u) ** 3 * l + 3 * (1 - u) ** 2 * u * l + 3 * (1 - u) * u * u * r + u ** 3 * r;
  const y = (1 - u) ** 3 * y0 + 3 * (1 - u) ** 2 * u * c1y + 3 * (1 - u) * u * u * c1y + u ** 3 * y0;
  return { x, y };
}

const BULBS = 13;

export const Stage = React.memo(function Stage({ width: W, height: H, actors: a, opponent, ghost, meLook = 'classic', stripes, sunburstSpeed, reducedMotion }: Props) {
  const finImgs = FIN_POSE_ORDER.map((p) => useImage(FIN_POSES[p])); // eslint-disable-line react-hooks/rules-of-hooks
  const hat = useImage(ART.hat);
  const shades = useImage(ART.sunglasses);
  const finger = useImage(ART.foamFinger);
  const meImg = useImage(SHARKS[meLook]);
  const oppImg = useImage(opponent === 'fin' ? SHARKS.blue : SHARKS[opponent]);
  const crowdImgs = [useImage(SHARKS.pink), useImage(SHARKS.green), useImage(SHARKS.orange), useImage(SHARKS.blue), useImage(SHARKS.red), useImage(SHARKS.classic)];

  const seaTop = H * 0.47;
  const deckTop = H * 0.62;
  const podTop = H * 0.7;
  const podW = W * 0.3;
  const podH = H * 0.26;
  const meX = W * 0.22;
  const oppX = W * 0.78;
  const arch = useMemo(() => ({ cx: W / 2, top: H * 0.07, w: W * 0.62, h: H * 0.5, band: 16 }), [W, H]);
  const archP = useMemo(() => archPath(arch.cx, arch.top, arch.w, arch.h, arch.band), [arch]);
  const bulbs = useMemo(() => Array.from({ length: BULBS }, (_, i) => archPoint(arch.cx, arch.top, arch.w, arch.h, arch.band, (i + 0.5) / BULBS)), [arch]);

  const bunting = useMemo(() => {
    const flags: { path: ReturnType<typeof Skia.Path.Make>; color: string }[] = [];
    const n = 11;
    const cols = [C.blue, C.gold, C.white];
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x0 = side === 0 ? u * W * 0.3 : W - u * W * 0.3;
        const y0 = 6 + Math.sin(u * Math.PI) * 14;
        const f = Skia.Path.Make();
        const dx = side === 0 ? 10 : -10;
        f.moveTo(x0, y0);
        f.lineTo(x0 + dx * 1.6, y0 + 1);
        f.lineTo(x0 + dx * 0.8, y0 + 16);
        f.close();
        flags.push({ path: f, color: cols[i % 3] });
      }
    }
    const string = Skia.Path.Make();
    string.moveTo(0, 6);
    string.quadTo(W * 0.15, 30, W * 0.3, 6);
    string.moveTo(W, 6);
    string.quadTo(W * 0.85, 30, W * 0.7, 6);
    return { flags, string };
  }, [W]);

  const deckPlanks = useMemo(() => {
    const p = Skia.Path.Make();
    for (let i = 1; i < 6; i++) {
      const y = deckTop + (H - deckTop) * (i / 6) ** 0.8;
      p.moveTo(0, y);
      p.lineTo(W, y);
    }
    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * W;
      p.moveTo(W / 2 + (x - W / 2) * 0.55, deckTop);
      p.lineTo(x, H);
    }
    return p;
  }, [W, H, deckTop]);

  const podium = useMemo(() => {
    const make = (cx: number) => {
      const body = Skia.Path.Make();
      body.moveTo(cx - podW / 2, podTop);
      body.lineTo(cx + podW / 2, podTop);
      body.lineTo(cx + podW / 2 - 8, podTop + podH);
      body.lineTo(cx - podW / 2 + 8, podTop + podH);
      body.close();
      return body;
    };
    return { me: make(meX), opp: make(oppX) };
  }, [podW, podH, podTop, meX, oppX]);

  // Sea shimmer: two wavy highlight lines, stepped on twos (12fps) so it reads hand-drawn.
  const shimmer = useDerivedValue(() => {
    const t = Math.floor(a.t.value / 83) * 83;
    const p = Skia.Path.Make();
    for (let row = 0; row < 3; row++) {
      const y = seaTop + 8 + row * ((deckTop - seaTop - 12) / 3);
      const ph = t * 0.0019 * (row % 2 ? -1 : 1) + row;
      for (let x = 10 + row * 23; x < W; x += 64) {
        const yy = y + Math.sin(ph + x * 0.05) * 1.5;
        p.moveTo(x, yy);
        p.quadTo(x + 9, yy - 3, x + 18, yy);
      }
    }
    return p;
  });

  const bulbLit = useDerivedValue(() => {
    const div = a.bulbFast.value > 0.5 ? 4 : 2;
    return Math.floor(a.beat.value * div) % 4;
  });

  // Camera rig: push toward the podiums, lateral whip.
  const rig = useDerivedValue(() => [
    { translateX: a.pushX.value + Math.sin(a.t.value / 955) * (reducedMotion ? 0 : 4) },
    { scale: a.push.value },
  ]);

  const breath = useDerivedValue(() => (reducedMotion ? 0 : Math.sin((a.t.value / 1600) * Math.PI * 2)));

  const finH = Math.min(H * 0.64, 140);
  const finS = finH / FIN_CELL.h;
  const finW = FIN_CELL.w * finS;
  const finBaseY = podTop + 6;
  const finTransform = useDerivedValue(() => [
    { translateX: oppX + 6 },
    { translateY: finBaseY + a.finY.value - a.podOpp.value },
    { rotate: a.finRot.value },
    { scaleX: a.finSX.value * finS },
    { scaleY: a.finSY.value * finS * (1 + 0.02 * breath.value) },
    { translateX: -FIN_CELL.w / 2 },
    { translateY: -FIN_CELL.h },
  ]);
  const finImage = useDerivedValue<SkImageType | null>(() => finImgs[a.finPose.value] ?? finImgs[0]);
  const hatAnchor = useDerivedValue(() => {
    const pose = FIN_POSE_ORDER[a.finPose.value] ?? 'idle';
    return HAT_ANCHOR[pose];
  });
  const hatW = FIN_CELL.w * 0.62;
  const hatH = hatW * (321 / 384);
  const hatTransform = useDerivedValue(() => {
    const h = hatAnchor.value;
    return [
      { translateX: h.x },
      { translateY: h.y + a.hatY.value - 2 * breath.value },
      { rotate: ((h.rot + a.hatRot.value) * Math.PI) / 180 },
    ];
  });

  const meH = Math.min(H * 0.52, 112);
  const meTransform = useDerivedValue(() => [
    { translateX: meX },
    { translateY: podTop + 4 + a.meY.value - a.podMe.value },
    { rotate: a.meRot.value },
    { scaleX: -a.meSX.value },
    { scaleY: a.meSY.value * (1 + 0.015 * breath.value) },
  ]);
  const shadesOpacity = useDerivedValue(() => a.shades.value);
  const shadesY = useDerivedValue(() => -meH * 0.78 - (1 - a.shades.value) * 40);

  const spotOpacity = useDerivedValue(() => a.spot.value * 0.55);
  const dim = useDerivedValue(() => a.spot.value * 0.1);

  const crowdN = CROWD_LOOKS.length;
  const crowdSize = Math.min(W / (crowdN - 1.5), 64);

  return (
    <Canvas style={{ width: W, height: H }} pointerEvents="none">
      <Group transform={rig} origin={vec(W / 2, H * 0.75)}>
        {/* L1 sky, sea, deck */}
        <Rect x={-40} y={-20} width={W + 80} height={seaTop + 20}>
          <LinearGradient start={vec(0, 0)} end={vec(0, seaTop)} colors={[C.skyTop, '#bfeaff']} />
        </Rect>
        <Sunburst cx={W / 2} cy={H * 0.36} radius={W * 0.9} intensity={a.sunburst} rays={14} width={W} height={H} speed={sunburstSpeed} />
        <Rect x={-40} y={seaTop} width={W + 80} height={deckTop - seaTop} color={C.sea} />
        <Path path={shimmer} color="rgba(255,255,255,0.85)" style="stroke" strokeWidth={2.5} strokeCap="round" />
        <Rect x={-40} y={seaTop - 1.5} width={W + 80} height={3} color={C.ink} />
        <Rect x={-40} y={deckTop} width={W + 80} height={H - deckTop + 20}>
          <LinearGradient start={vec(0, deckTop)} end={vec(0, H)} colors={[C.wood, '#d99452']} />
        </Rect>
        <Path path={deckPlanks} color="rgba(120,70,30,0.35)" style="stroke" strokeWidth={1.5} />
        <Rect x={-40} y={deckTop - 1.5} width={W + 80} height={3} color={C.ink} />

        {/* L2 marquee arch + bunting */}
        <Path path={archP} color={C.gold} />
        <Path path={archP} color={C.ink} style="stroke" strokeWidth={3} strokeJoin="round" />
        {bulbs.map((b, i) => (
          <Bulb key={i} x={b.x} y={b.y} index={i} lit={bulbLit} />
        ))}
        <Path path={bunting.string} color={C.ink} style="stroke" strokeWidth={1.5} />
        {bunting.flags.map((f, i) => (
          <Group key={i}>
            <Path path={f.path} color={f.color} />
            <Path path={f.path} color={C.ink} style="stroke" strokeWidth={2} strokeJoin="round" />
          </Group>
        ))}

        {/* Final spotlights */}
        <Group opacity={spotOpacity}>
          <Path path={cone(W * 0.1, -10, meX, podTop + 10, 46)} color="rgba(255,249,220,0.7)" />
          <Path path={cone(W * 0.9, -10, oppX, podTop + 10, 46)} color="rgba(255,249,220,0.7)" />
        </Group>

        {/* L3 podiums */}
        <Podium path={podium.me} cx={meX} top={podTop} w={podW} h={podH} rise={a.podMe} />
        <Podium path={podium.opp} cx={oppX} top={podTop} w={podW} h={podH} rise={a.podOpp} />

        {/* You */}
        {meImg ? (
          <Group transform={meTransform}>
            <SkImage image={meImg} x={-meH / 2} y={-meH} width={meH} height={meH} />
            {shades ? (
              <Group opacity={shadesOpacity}>
                <SkImage image={shades} x={-meH * 0.36} y={shadesY} width={meH * 0.42} height={meH * 0.42 * (153 / 256)} />
              </Group>
            ) : null}
          </Group>
        ) : null}

        {/* Opponent */}
        {opponent === 'fin' ? (
          <Group transform={finTransform}>
            <SkImage image={finImage} x={0} y={0} width={FIN_CELL.w} height={FIN_CELL.h} />
            {hat ? (
              <Group transform={hatTransform}>
                <SkImage image={hat} x={-hatW / 2} y={-hatH * 0.92} width={hatW} height={hatH} />
                {Array.from({ length: stripes }, (_, i) => (
                  <RoundedRect key={i} x={-hatW * 0.34 + i * hatW * 0.24} y={-hatH * 0.3} width={hatW * 0.16} height={5} r={2} color={C.gold} />
                ))}
              </Group>
            ) : null}
          </Group>
        ) : oppImg ? (
          <Group transform={finTransform} opacity={ghost ? 0.55 : 1}>
            <SkImage image={oppImg} x={-10} y={30} width={FIN_CELL.w} height={FIN_CELL.w} />
            {ghost ? <Rect x={-10} y={30} width={FIN_CELL.w} height={FIN_CELL.w} color="rgba(0,165,245,0.18)" /> : null}
          </Group>
        ) : null}

        {/* L4 crowd strip */}
        {CROWD_LOOKS.map((look, i) => {
          const img = crowdImgs[['pink', 'green', 'orange', 'blue', 'red', 'classic'].indexOf(look)];
          return (
            <CrowdShark key={i} i={i} n={crowdN} W={W} H={H} size={crowdSize} img={img} finger={finger} a={a} />
          );
        })}

        <Rect x={-40} y={-20} width={W + 80} height={H + 40} color="#063f73" opacity={dim} />
      </Group>
    </Canvas>
  );
});

function cone(x0: number, y0: number, x1: number, y1: number, spread: number) {
  const p = Skia.Path.Make();
  p.moveTo(x0 - 6, y0);
  p.lineTo(x0 + 6, y0);
  p.lineTo(x1 + spread, y1);
  p.lineTo(x1 - spread, y1);
  p.close();
  return p;
}

const Bulb = React.memo(function Bulb({ x, y, index, lit }: { x: number; y: number; index: number; lit: SharedValue<number> }) {
  const on = useDerivedValue(() => (index % 4 === lit.value ? 1 : 0));
  const glow = useDerivedValue(() => on.value * 0.85);
  const fill = useDerivedValue(() => (on.value ? '#fff7c2' : '#f6d774'));
  return (
    <Group>
      <Circle cx={x} cy={y} r={9} color="rgba(255,240,150,1)" opacity={glow} />
      <Circle cx={x} cy={y} r={4.2} color={fill} />
      <Circle cx={x} cy={y} r={4.2} color={C.ink} style="stroke" strokeWidth={1.6} />
    </Group>
  );
});

const Podium = React.memo(function Podium({ path, cx, top, w, h, rise }: { path: ReturnType<typeof Skia.Path.Make>; cx: number; top: number; w: number; h: number; rise: SharedValue<number> }) {
  const tr = useDerivedValue(() => [{ translateY: -rise.value }]);
  return (
    <Group transform={tr}>
      <Path path={path} color={C.blue} />
      <Rect x={cx - w / 2 + 4} y={top + h * 0.3} width={w - 8} height={h * 0.18} color={C.gold} />
      <RoundedRect x={cx - w / 2 - 4} y={top - 7} width={w + 8} height={12} r={4} color={C.cream} />
      <RoundedRect x={cx - w / 2 - 4} y={top - 7} width={w + 8} height={12} r={4} color={C.ink} style="stroke" strokeWidth={2.5} />
      <Path path={path} color={C.ink} style="stroke" strokeWidth={3} strokeJoin="round" />
    </Group>
  );
});

const CrowdShark = React.memo(function CrowdShark({ i, n, W, H, size, img, finger, a }: {
  i: number; n: number; W: number; H: number; size: number; img: SkImageType | null; finger: SkImageType | null; a: StageActors;
}) {
  const x = (i / (n - 1)) * W;
  const baseY = H - size * 0.46 + (i % 2) * 6;
  const flip = i < n / 2 ? -1 : 1;
  const tr = useDerivedValue(() => {
    const bob = Math.abs(Math.sin((a.beat.value + i * 0.25) * Math.PI)) * 2;
    return [
      { translateX: x + a.crowdLean.value * flip * -3 },
      { translateY: baseY - bob - a.cheer.value * 5 },
      { rotate: a.crowdLean.value * flip * 0.12 },
      { scaleX: flip },
    ];
  });
  const fingerTr = useDerivedValue(() => {
    const up = a.cheer.value;
    // Prop rotates -30deg on a cheer, stepped on twos.
    const stepped = Math.round(up * 6) / 6;
    return [{ translateX: size * 0.1 }, { translateY: -size * (0.55 + 0.25 * stepped) }, { rotate: (-0.52 * stepped) }];
  });
  if (!img) return null;
  return (
    <Group transform={tr}>
      <SkImage image={img} x={-size / 2} y={-size / 2} width={size} height={size} />
      {finger && i % 2 === 0 ? (
        <Group transform={fingerTr}>
          <SkImage image={finger} x={-size * 0.18} y={-size * 0.1} width={size * 0.36} height={size * 0.41} />
        </Group>
      ) : null}
    </Group>
  );
});
