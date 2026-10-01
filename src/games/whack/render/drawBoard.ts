/**
 * drawBoard.ts: the dynamic half of the Bonk Rush scene, drawn imperatively
 * into one SkPicture per frame on the UI thread (design v4 8.2, 14.1).
 *
 * One worklet records every well, occupant, overlay, hat and the foam
 * finger, so the per-frame cost is one derived value instead of hundreds of
 * animated props. Paints, clip paths and interior shaders are built once per
 * layout on the JS thread (`buildWellKit`) and captured.
 *
 * Splash well, back to front (8.2): rim art -> painted interior (radial teal,
 * never darker than L* 35) -> caustics (baked 16-frame strip) -> contact
 * shadow -> ripple / pulse -> occupant (clipped above the water plane) ->
 * front lip (the rim's front arc drawn again over the occupant's base) ->
 * rim language overlays (teeth + "!" tab, golden studs, heavy bolts) -> the
 * QUICK ring -> splats.
 */

import { BlendMode, ClipOp, Skia, TileMode, type SkCanvas, type SkImage, type SkPaint, type SkPath, type SkRect } from '@shopify/react-native-skia';
import type { BoardLayout } from './layout';
import { HAT_SLOTS, RIM_GOLDEN, RIM_HARMFUL, RIM_HEAVY, type RenderState } from './renderState';

const NAVY = '#0b3a66';
const GOLD = '#ffcf3b';
const CORAL = '#ff6b5c';

export interface BoardArt {
  /** Images indexed by frame code (mipmapped copies). */
  frames: (SkImage | null)[];
  rim: SkImage | null;
  teeth: SkImage | null;
  tab: SkImage | null;
  caustics: SkImage | null;
  shadow: SkImage | null;
  starburst: SkImage | null;
  helmet: SkImage | null;
  glasses: SkImage | null;
  star: SkImage | null;
  splatInk: SkImage | null;
  splatCandy: SkImage | null;
  hat: SkImage | null;
  finger: SkImage | null;
}

export interface WellKit {
  interior: SkPaint[];
  mouth: SkRect[];
  mouthPath: SkPath[];
  occClip: SkPath[];
  lipClip: SkRect[];
  rimRect: SkRect[];
  highlight: SkRect[];
  studs: SkPath[];
  /** v5: the 6 golden studs one by one (Ripe Golden lights 2, 4, 6). */
  studList: SkPath[][];
  bolts: SkPath[];
  /** v5 waterline: the submerged tint (-12% value, -20% saturation, +6% teal). */
  tint: SkPaint;
  /** Ghost finger tints (PB blue, then rival gold, coral, green; never purple). */
  ghostTint: SkPaint[];
  paint: SkPaint;
  white: SkPaint;
  gold: SkPaint;
  navySil: SkPaint;
  stroke: SkPaint;
  fill: SkPaint;
  hatW: number;
}

function starPath(cx: number, cy: number, r: number): SkPath {
  const p = Skia.Path.Make();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (k === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

/** Static per-layout geometry and paints (JS thread, once per layout). */
export function buildWellKit(L: BoardLayout, hatAspect: number): WellKit {
  const interior: SkPaint[] = [];
  const mouth: SkRect[] = [];
  const mouthPath: SkPath[] = [];
  const occClip: SkPath[] = [];
  const lipClip: SkRect[] = [];
  const rimRect: SkRect[] = [];
  const highlight: SkRect[] = [];
  const studs: SkPath[] = [];
  const studList: SkPath[][] = [];
  const bolts: SkPath[] = [];
  for (let i = 0; i < 9; i++) {
    const cx = L.cx[i];
    const my = L.my[i];
    const mrx = L.mrx[i];
    const mry = L.mry[i];
    const H = L.spriteH[i];
    const m = Skia.XYWHRect(cx - mrx, my - mry, mrx * 2, mry * 2);
    mouth.push(m);
    const mp = Skia.Path.Make();
    mp.addOval(m);
    mouthPath.push(mp);
    // Painted interior: #46c3d1 at the lip to #127a90 at the centre (ellipse via a y-scaled radial).
    const ip = Skia.Paint();
    ip.setAntiAlias(true);
    const sy = mry / mrx;
    const lm = Skia.Matrix();
    lm.translate(cx, my);
    lm.scale(1, sy);
    lm.translate(-cx, -my);
    ip.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: my }, mrx, [Skia.Color('#127a90'), Skia.Color('#2aa3b8'), Skia.Color('#46c3d1')], [0, 0.62, 1], TileMode.Clamp, lm));
    interior.push(ip);
    // Occupant clip: everything above the water line, plus a water-plane ellipse as wide as the
    // character so fins wider than the rim sink on a curve instead of a hard cut.
    const oc = Skia.Path.Make();
    oc.addRect(Skia.XYWHRect(cx - L.w, -2000, L.w * 2, my + 2000));
    oc.addOval(m);
    const wide = Math.max(mrx, H * 0.48);
    oc.addOval(Skia.XYWHRect(cx - wide, my - mry * 0.55, wide * 2, mry * 1.1));
    occClip.push(oc);
    lipClip.push(Skia.XYWHRect(L.rimX[i] - 4, my, L.rimW[i] + 8, L.rimH[i] + 8));
    rimRect.push(Skia.XYWHRect(L.rimX[i], L.rimY[i], L.rimW[i], L.rimH[i]));
    highlight.push(Skia.XYWHRect(cx - mrx * 0.8, my - mry * 0.92, mrx * 1.6, mry * 0.5));
    // Golden: 6 star studs around the rim; heavy: 4 bolts.
    const st = Skia.Path.Make();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      st.addPath(starPath(cx + Math.cos(a) * mrx * 1.22, my + Math.sin(a) * mry * 1.5, Math.max(5, L.rimW[i] * 0.065)));
    }
    studs.push(st);
    const one: SkPath[] = [];
    for (let k = 0; k < 6; k++) {
      // Reading order around the rim from the top, so the lit studs climb as it ripens.
      const a = -Math.PI / 2 + (k / 6) * Math.PI * 2 + Math.PI / 6;
      one.push(starPath(cx + Math.cos(a) * mrx * 1.22, my + Math.sin(a) * mry * 1.5, Math.max(5, L.rimW[i] * 0.065)));
    }
    studList.push(one);
    const bo = Skia.Path.Make();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      bo.addCircle(cx + Math.cos(a) * mrx * 1.2, my + Math.sin(a) * mry * 1.55, Math.max(3.5, L.rimW[i] * 0.04));
    }
    bolts.push(bo);
  }
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const white = Skia.Paint();
  white.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color('#ffffff'), BlendMode.SrcIn));
  const gold = Skia.Paint();
  gold.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color('#ffd84a'), BlendMode.SrcIn));
  const navySil = Skia.Paint();
  navySil.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(NAVY), BlendMode.SrcIn));
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(1);
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  // Submerged tint: value x0.88, saturation x0.8 (toward luma), then a small teal lift.
  const sat = 0.8;
  const v = 0.88;
  const lr = 0.213 * (1 - sat);
  const lg = 0.715 * (1 - sat);
  const lb = 0.072 * (1 - sat);
  const tint = Skia.Paint();
  tint.setAntiAlias(true);
  tint.setColorFilter(Skia.ColorFilter.MakeMatrix([
    (lr + sat) * v, lg * v, lb * v, 0, 0,
    lr * v, (lg + sat) * v, lb * v, 0, 0.024,
    lr * v, lg * v, (lb + sat) * v, 0, 0.036,
    0, 0, 0, 1, 0,
  ]));
  const ghostTint = ['#7fd6ff', '#ffcf3b', '#ff6b5c', '#5fd38a'].map((c) => {
    const g = Skia.Paint();
    g.setAntiAlias(true);
    g.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(c), BlendMode.Modulate));
    return g;
  });
  return {
    interior, mouth, mouthPath, occClip, lipClip, rimRect, highlight, studs, studList, bolts, tint, ghostTint, paint, white, gold, navySil, stroke, fill,
    hatW: L.cellW * 0.62 * (hatAspect > 0 ? 1 : 1),
  };
}

/** Plain-object rect (JSI reads x/y/width/height): no host-object allocation per draw. */
function R(x: number, y: number, width: number, height: number): SkRect {
  'worklet';
  return { x, y, width, height } as unknown as SkRect;
}

const C_WHITE = Skia.Color('#ffffff');
const C_CORAL = Skia.Color(CORAL);
const C_GOLD = Skia.Color(GOLD);
const C_NAVY = Skia.Color(NAVY);
const C_CREAM = Skia.Color('#fff8e4');

function img(canvas: SkCanvas, im: SkImage | null, x: number, y: number, w: number, h: number, p: SkPaint): void {
  'worklet';
  if (!im || w <= 0 || h <= 0) return;
  canvas.drawImageRectOptions(im, R(0, 0, im.width(), im.height()), R(x, y, w, h), 1, 0, p);
}

function imgC(canvas: SkCanvas, im: SkImage | null, cx: number, cy: number, w: number, h: number, p: SkPaint): void {
  'worklet';
  img(canvas, im, cx - w / 2, cy - h / 2, w, h, p);
}

/** Record one frame of the wells and everything that moves with them. */
export function drawWells(canvas: SkCanvas, rs: RenderState, L: BoardLayout, art: BoardArt, kit: WellKit, feverRim: number): void {
  'worklet';
  const p = kit.paint;
  const st = kit.stroke;
  const fl = kit.fill;
  // Pre-warm: draw every frame image once, nearly invisible, so no first-bonk texture upload hitches a frame.
  if (rs.tick < 90 && (rs.tick & 7) === 0) {
    p.setAlphaf(0.01);
    for (let f = 0; f < art.frames.length; f++) img(canvas, art.frames[f], 0, 0, 3, 3, p);
    img(canvas, art.hat, 0, 0, 3, 3, p);
    img(canvas, art.teeth, 0, 0, 3, 3, p);
    img(canvas, art.tab, 0, 0, 3, 3, p);
    img(canvas, art.starburst, 0, 0, 3, 3, p);
    img(canvas, art.splatInk, 0, 0, 3, 3, p);
    img(canvas, art.splatCandy, 0, 0, 3, 3, p);
    kit.white.setAlphaf(0.01);
    if (art.frames[1]) img(canvas, art.frames[1], 0, 0, 3, 3, kit.white);
  }
  for (let i = 0; i < 9; i++) {
    const cx = L.cx[i];
    const my = L.my[i];
    const mrx = L.mrx[i];
    const mry = L.mry[i];
    const H = L.spriteH[i];
    canvas.save();
    canvas.translate(rs.kx[i], rs.ky[i]);
    const rr = kit.rimRect[i];
    // 0. The well sits on the deck: a soft navy base shadow separates the rim from any floor.
    if (art.shadow) {
      p.setAlphaf(0.34);
      imgC(canvas, art.shadow, cx, rr.y + rr.height * 0.86, rr.width * 1.18, rr.height * 0.5, p);
    }
    // 1. Rim art.
    p.setAlphaf(1);
    img(canvas, art.rim, rr.x, rr.y, rr.width, rr.height, p);
    // 2. Painted interior and the water disc (baked caustics, per-well phase).
    canvas.drawOval(kit.mouth[i], kit.interior[i]);
    if (art.caustics) {
      canvas.save();
      canvas.clipPath(kit.mouthPath[i], ClipOp.Intersect, true);
      p.setAlphaf(0.28);
      const f = rs.caustic[i];
      canvas.drawImageRectOptions(art.caustics, R(f * 128, 0, 128, 128), R(cx - mrx, my - mrx * 0.5, mrx * 2, mrx), 1, 0, p);
      // 3. Contact shadow under the occupant (grows with the rise).
      if (rs.shadowOp[i] > 0 && art.shadow) {
        p.setAlphaf(rs.shadowOp[i]);
        const sw = rs.shadowW[i];
        imgC(canvas, art.shadow, cx, my + mry * 0.15, sw, sw * 0.36, p);
      }
      canvas.restore();
    }
    p.setAlphaf(0.26);
    fl.setColor(C_WHITE);
    fl.setAlphaf(0.26);
    canvas.drawOval(kit.highlight[i], fl);
    // Lock (angler bite) and the tell pulse.
    if (rs.lock[i] > 0) {
      fl.setColor(C_CORAL);
      fl.setAlphaf(0.4);
      canvas.drawOval(kit.mouth[i], fl);
    }
    if (rs.pulse[i] > 0.01) {
      const k = rs.pulseKind[i];
      const al = Math.min(1, rs.pulse[i] * 0.85);
      // Two-tone (7.1): every light ring carries a navy edge.
      st.setColor(C_NAVY);
      st.setStrokeWidth(8);
      st.setAlphaf(al);
      canvas.drawOval(kit.mouth[i], st);
      st.setColor(k === 2 || k === 6 ? C_CORAL : k === 1 || k === 8 ? C_GOLD : C_WHITE);
      st.setStrokeWidth(4);
      canvas.drawOval(kit.mouth[i], st);
    }
    if (feverRim > 0.01) {
      st.setColor(C_GOLD);
      st.setStrokeWidth(4);
      st.setAlphaf(feverRim * 0.8);
      canvas.drawOval(R(cx - mrx - 2, my - mry - 2, mrx * 2 + 4, mry * 2 + 4), st);
    }
    // Ripple ring on emerge / duck.
    if (rs.rippleOp[i] > 0.01) {
      const r = rs.ripple[i];
      const ro = R(cx - r, my - r * (mry / mrx) * 1.1, r * 2, r * 2 * (mry / mrx) * 1.1);
      st.setColor(C_NAVY);
      st.setStrokeWidth(5);
      st.setAlphaf(rs.rippleOp[i] * 0.8);
      canvas.drawOval(ro, st);
      st.setColor(C_WHITE);
      st.setStrokeWidth(2.5);
      st.setAlphaf(rs.rippleOp[i]);
      canvas.drawOval(ro, st);
    }
    // Impact-frame starburst behind the sprite.
    const frame = rs.frame[i];
    const fi = frame >= 0 ? art.frames[frame] : null;
    if (rs.impact[i] > 0 && art.starburst) {
      p.setAlphaf(1);
      const sb = H * 1.3 * rs.impact[i];
      imgC(canvas, art.starburst, cx, my - H * 0.5, sb, sb, p);
    }
    // 4. Occupant, clipped above the water plane, squashed about its base.
    if (fi) {
      canvas.save();
      canvas.clipPath(kit.occClip[i], ClipOp.Intersect, true);
      // The hat-off pose's drawn hat is handed to the physics hat: clip it off the sinking pose.
      if (rs.clipTop[i] > 0) canvas.clipRect(R(cx - L.w, rs.clipTop[i], L.w * 2, L.h), ClipOp.Intersect, true);
      const px = rs.px[i];
      const py = rs.py[i];
      canvas.translate(px, py);
      if (rs.rot[i] !== 0) canvas.rotate(rs.rot[i], 0, 0);
      canvas.scale(rs.sx[i], rs.sy[i]);
      canvas.translate(-px, -py);
      const x = rs.ix[i];
      const y = rs.iy[i];
      const w = rs.iw[i];
      const h = rs.ih[i];
      const alpha = rs.op[i] * rs.fade[i];
      // Fever: a gold rim light behind the occupant (characters stay true colour).
      if (rs.rimLight[i] > 0.01) {
        kit.gold.setAlphaf(rs.rimLight[i] * alpha);
        img(canvas, fi, x - 3, y - 3, w + 6, h + 4, kit.gold);
      }
      if (rs.flash[i] >= 1) {
        // Impact frame: a solid white silhouette with a navy outline.
        kit.navySil.setAlphaf(1);
        img(canvas, fi, x - 3, y - 3, w + 6, h + 4, kit.navySil);
        kit.white.setAlphaf(1);
        img(canvas, fi, x, y, w, h, kit.white);
      } else {
        // QUICK: a 2-frame white outline flash (a 2pt white outer edge) under the brightness flash.
        if (rs.outline[i] > 0) {
          kit.white.setAlphaf(1);
          img(canvas, fi, x - 2, y - 2, w + 4, h + 3, kit.white);
        }
        p.setAlphaf(alpha);
        img(canvas, fi, x, y, w, h, p);
        // Waterline (v5 8.2): the part of the occupant inside the water disc is lit as submerged.
        canvas.save();
        canvas.clipPath(kit.mouthPath[i], ClipOp.Intersect, true);
        kit.tint.setAlphaf(alpha);
        img(canvas, fi, x, y, w, h, kit.tint);
        canvas.restore();
        if (rs.flash[i] > 0) {
          kit.white.setAlphaf(rs.flash[i]);
          img(canvas, fi, x, y, w, h, kit.white);
        }
      }
      p.setAlphaf(alpha);
      if (rs.helm[i] > 0 && art.helmet) img(canvas, art.helmet, px - H * 0.26, y + h * 0.02 - H * 0.08, H * 0.52, H * 0.46, p);
      if (rs.glasses[i] > 0 && art.glasses && rs.glW[i] > 0) {
        const gw = rs.glW[i];
        const gh = gw * (art.glasses.height() / Math.max(1, art.glasses.width()));
        img(canvas, art.glasses, rs.glX[i] - gw / 2, rs.glY[i] - gh / 2, gw, gh, p);
      }
      canvas.restore();
      // Foam line where the occupant meets the water: a wavy white strip with a navy underside, stepped on twos.
      if (rs.foam[i] > 0 && rs.foamW[i] > 2) {
        const fw = rs.foamW[i];
        const fy = rs.foamY[i];
        const th = 2.2 * rs.foam[i];
        const ph = (rs.foamStep + i * 3) % 4;
        const path = Skia.Path.Make();
        const n = 7;
        for (let k = 0; k <= n; k++) {
          const xx = cx - fw + (2 * fw * k) / n;
          const yy = fy + ((k + ph) % 2 === 0 ? -1.4 : 1.1) * rs.foam[i];
          if (k === 0) path.moveTo(xx, yy);
          else path.lineTo(xx, yy);
        }
        st.setAlphaf(0.9 * alpha);
        st.setColor(C_NAVY);
        st.setStrokeWidth(th + 2.5);
        canvas.save();
        canvas.translate(0, 1.2);
        canvas.drawPath(path, st);
        canvas.restore();
        st.setColor(C_WHITE);
        st.setStrokeWidth(th);
        canvas.drawPath(path, st);
      }
    }
    // 5. Front lip occludes the occupant's base.
    canvas.save();
    canvas.clipRect(kit.lipClip[i], ClipOp.Intersect, true);
    p.setAlphaf(1);
    img(canvas, art.rim, rr.x, rr.y, rr.width, rr.height, p);
    canvas.restore();
    // Wet highlight: a 2pt white arc on the inner front lip.
    st.setColor(C_WHITE);
    st.setStrokeWidth(2);
    st.setAlphaf(0.7);
    canvas.drawArc(R(cx - mrx * 0.88, my - mry * 0.8, mrx * 1.76, mry * 1.6), 35, 110, false, st);
    // 6. Rim language overlays.
    const rim = rs.rim[i];
    if (rim === RIM_HARMFUL) {
      p.setAlphaf(1);
      if (art.teeth) imgC(canvas, art.teeth, cx, my + mry * 0.1, mrx * 2.7, mry * 2 * 2.3, p);
      if (art.tab) {
        const tw = L.rimW[i] * 0.3 * rs.tab[i];
        imgC(canvas, art.tab, cx, my - mry - tw * 0.55, tw * 0.8, tw, p);
      }
    } else if (rim === RIM_GOLDEN) {
      const lit = rs.studs[i];
      if (rs.studPulse[i] > 0) {
        // Stage 3: the whole rim pulses gold (800 is on the table, and it can bolt any moment).
        st.setColor(C_NAVY);
        st.setStrokeWidth(9);
        st.setAlphaf(0.85);
        canvas.drawOval(R(cx - mrx * 1.12, my - mry * 1.35, mrx * 2.24, mry * 2.7), st);
        st.setColor(C_GOLD);
        st.setStrokeWidth(4 + 3 * rs.studPulse[i]);
        st.setAlphaf(1);
        canvas.drawOval(R(cx - mrx * 1.12, my - mry * 1.35, mrx * 2.24, mry * 2.7), st);
      }
      if (lit > 0) {
        // Ripe Golden: studs light 2, 4, 6 as it ripens; unlit studs are cream.
        for (let k = 0; k < 6; k++) {
          fl.setColor(k < lit ? C_GOLD : C_CREAM);
          fl.setAlphaf(1);
          canvas.drawPath(kit.studList[i][k], fl);
          st.setColor(C_NAVY);
          st.setStrokeWidth(2);
          st.setAlphaf(1);
          canvas.drawPath(kit.studList[i][k], st);
        }
      } else {
        fl.setColor(C_GOLD);
        fl.setAlphaf(1);
        canvas.drawPath(kit.studs[i], fl);
        st.setColor(C_NAVY);
        st.setStrokeWidth(2);
        st.setAlphaf(1);
        canvas.drawPath(kit.studs[i], st);
      }
    } else if (rim === RIM_HEAVY) {
      fl.setColor(C_GOLD);
      fl.setAlphaf(1);
      canvas.drawPath(kit.bolts[i], fl);
      st.setColor(C_NAVY);
      st.setStrokeWidth(2.5);
      st.setAlphaf(1);
      canvas.drawPath(kit.bolts[i], st);
    }
    // 7. QUICK ring: 4pt white (gold as it closes) over a 3pt navy outline each side.
    if (rs.ring[i] > 0) {
      const r = rs.ring[i];
      const ry = my - H * 0.42;
      st.setAlphaf(1);
      st.setColor(C_NAVY);
      st.setStrokeWidth(10);
      canvas.drawCircle(cx, ry, r, st);
      st.setColor(rs.ringGold[i] > 0 ? C_GOLD : C_WHITE);
      st.setStrokeWidth(4);
      canvas.drawCircle(cx, ry, r, st);
    }
    // Dizzy stars (non-pose dazed frames only: the key poses draw their own).
    if (rs.dizzy[i] > 0.01 && art.star) {
      p.setAlphaf(rs.dizzy[i]);
      const t = rs.tick * 0.26;
      for (let s = 0; s < 3; s++) {
        const a = t + s * 2.09;
        img(canvas, art.star, cx + Math.cos(a) * H * 0.28 - 8, my - H * 0.85 + Math.sin(a) * H * 0.08 - 8, 16, 16, p);
      }
    }
    // Splats (boss ink / duel cotton candy).
    if (rs.splat[i] > 0) {
      const landed = rs.splat[i] >= 1;
      const sc = landed ? 1 : 0.2 + 0.7 * ((rs.tick % 40) / 40);
      const sw = L.rimW[i] * 1.25 * sc;
      p.setAlphaf(landed ? 1 : 0.35);
      imgC(canvas, rs.splatType[i] === 4 ? art.splatCandy : art.splatInk, cx, my - H * 0.25, sw, sw * 0.9, p);
    }
    canvas.restore();
  }
  // Bucket helmets flying off.
  if (art.helmet) {
    for (let i = 0; i < 9; i++) {
      if (rs.hfo[i] <= 0) continue;
      const size = L.spriteH[i] * 0.5;
      canvas.save();
      canvas.translate(rs.hfx[i], rs.hfy[i]);
      canvas.rotate(rs.hfr[i], 0, 0);
      p.setAlphaf(rs.hfo[i]);
      imgC(canvas, art.helmet, 0, 0, size, size, p);
      canvas.restore();
    }
  }
  // Costume hats knocked off (rigid bodies, one deck bounce).
  if (art.hat) {
    const hw = kit.hatW;
    const hh = hw * (art.hat.height() / Math.max(1, art.hat.width()));
    for (let k = 0; k < HAT_SLOTS; k++) {
      if (rs.hatO[k] <= 0) continue;
      canvas.save();
      canvas.translate(rs.hatX[k], rs.hatY[k]);
      canvas.rotate(rs.hatR[k], 0, 0);
      p.setAlphaf(rs.hatO[k]);
      imgC(canvas, art.hat, 0, -hh * 0.3, hw, hh, p);
      canvas.restore();
    }
  }
  // Auto Look-Up veil over the deck.
  if (rs.veil > 0.01) {
    fl.setColor(C_WHITE);
    fl.setAlphaf(rs.veil * 0.3);
    canvas.drawRect(R(0, L.deckTop, L.w, L.h - L.deckTop), fl);
  }
  // Look-up resume: a soft two-tone release ring (the touch only resumes).
  if (rs.release >= 0) {
    const r = 10 + 34 * rs.release;
    st.setAlphaf(1 - rs.release);
    st.setColor(C_NAVY);
    st.setStrokeWidth(5);
    canvas.drawCircle(rs.releaseX, rs.releaseY, r, st);
    st.setColor(C_WHITE);
    st.setStrokeWidth(2.5);
    canvas.drawCircle(rs.releaseX, rs.releaseY, r, st);
  }
  // Ghost fingers (GHOST PLAY): tinted, translucent, never mistaken for your own.
  if (art.finger) {
    const gw = L.cellW * 0.42;
    const gh = gw / 0.871;
    for (let k = 0; k < rs.ghostOp.length; k++) {
      if (rs.ghostOp[k] <= 0) continue;
      const tp = kit.ghostTint[rs.ghostC[k] % kit.ghostTint.length];
      tp.setAlphaf(rs.ghostOp[k]);
      canvas.save();
      canvas.translate(rs.ghostX[k], rs.ghostY[k]);
      canvas.rotate(4, 0, 0);
      img(canvas, art.finger, -gw * 0.5, -gh * 0.2, gw, gh, tp);
      canvas.restore();
    }
  }
  // Foam finger above the touch.
  if (rs.fingerOp > 0 && art.finger) {
    const fw = L.cellW * 0.5;
    const fh = fw / 0.871;
    if (rs.smear > 0) {
      // The swing smear, already behind the finger on the touch-down frame: a navy-edged white
      // ribbon along a -40 deg arc and one afterimage at 35%, fading over 90 ms.
      const ax = rs.fingerX;
      const ay = rs.fingerY + fh * 0.1;
      const rad = fh * 0.95;
      const arc = Skia.Path.Make();
      arc.addArc(R(ax - rad * 2, ay - rad, rad * 2, rad * 2), -40, 38);
      st.setAlphaf(0.7 * rs.smear);
      st.setColor(C_NAVY);
      st.setStrokeWidth(9);
      canvas.drawPath(arc, st);
      st.setColor(C_WHITE);
      st.setStrokeWidth(5);
      canvas.drawPath(arc, st);
      canvas.save();
      canvas.translate(rs.fingerX - fw * 0.42, rs.fingerY - fh * 0.16);
      canvas.rotate(-36, 0, 0);
      p.setAlphaf(0.35 * rs.smear);
      img(canvas, art.finger, -fw * 0.5, -fh * 0.2, fw, fh, p);
      canvas.restore();
    }
    canvas.save();
    canvas.translate(rs.fingerX, rs.fingerY);
    canvas.rotate(rs.fingerRot, 0, 0);
    canvas.scale(rs.fingerScale, rs.fingerScale);
    p.setAlphaf(rs.fingerOp);
    img(canvas, art.finger, -fw * 0.5, -fh * 0.2, fw, fh, p);
    canvas.restore();
  }
  p.setAlphaf(1);
}
