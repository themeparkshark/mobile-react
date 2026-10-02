'use strict';
/**
 * Tide Run chunk source (design v7.1 4.4). The sim (src/games/sharky/sim/core.ts)
 * must stay one self-contained file, so chunks are authored here with helpers
 * and emitted as integer tables between the CHUNKS-BEGIN / CHUNKS-END markers.
 *
 *   node tools/sharky/chunks-src.cjs          rewrite the table in core.ts
 *   node tools/sharky/chunks-src.cjs --check  exit 1 when core.ts is stale
 *
 * Entities: [type, x, y, p1, p2].
 *   coin   p1 = local line (0..7), p2 = Close-line flags (Rayman rule):
 *          bit0 Close-line coin, bit1 under the bottom cap (else the top),
 *          bits2-3 the pylon gap class, bit4 hugs a circle (no gap shift).
 *          The sim shifts pylon Close coins with the real gap (D1/D3).
 *   pylon  y = gap centre, p1 = gap class (0 std, 1 wide, 2 tight)
 *   jelly  p1 = bob phase (0..1023)
 *   token  a slot on the risky line (one per sprint is kept)
 *
 * Geometry (720 x 1000u view, shark x1.2): silhouette ry 43, so a shark
 * centre CLOSE_OFF = 43 + 8 = 51u inside a pylon gap edge holds its
 * silhouette 8u from the cap art: the middle of the 2-14u Close band.
 */
const fs = require('node:fs');
const path = require('node:path');

const E = { COIN: 1, RING: 2, TOKEN: 3, BOX: 4, PYLON: 5, JELLY: 6, PUFFER: 7, TORPEDO: 8, SHIELD: 11 };
const PYLON_W = 120;
const CLOSE_OFF = 51;
/** Chunk spacing scale (tuning lever 1). */
const X_SCALE = 1.15;
const JELLY_ART = 48;
const PUFF_ART0 = 28;
// Gap per class at D2 (core.pylonGap): the authoring line uses the D2 gap;
// D1 is wider and D3 tighter by 60u, so the Close line shifts 30u per side.
const GAP_D2 = { 0: 380, 1: 440, 2: 340 };

function chunk(id, name, len, diff, zone, tier, breather, exitY, build) {
  const e = [];
  let line = 0;
  const api = {
    /** A pylon pair with a Close-line coin line hugging the top or bottom cap. */
    pylon(x, gapY, cls = 0, hug = 'top', coins = 3) {
      e.push(E.PYLON, x, gapY, cls, 0);
      if (hug) {
        const half = GAP_D2[cls] / 2;
        const y = hug === 'top' ? gapY - half + CLOSE_OFF : gapY + half - CLOSE_OFF;
        const l = line++;
        const x0 = x + PYLON_W / 2 - ((coins - 1) * 70) / 2;
        const flags = 1 | (hug === 'bottom' ? 2 : 0) | (cls << 2);
        for (let k = 0; k < coins; k++) e.push(E.COIN, Math.round(x0 + k * 70), Math.round(y), l, flags);
      }
      return api;
    },
    /** A straight or sloped coin line of n coins at 70u spacing. */
    coins(x0, y0, y1, n = 4) {
      const l = line++;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1);
        e.push(E.COIN, Math.round(x0 + k * 70), Math.round(y0 + (y1 - y0) * t), l, 0);
      }
      return api;
    },
    /** A coin arc (hold-release teaching curve). */
    arc(x0, y0, peak, n = 6) {
      const l = line++;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const y = y0 - peak * 4 * t * (1 - t);
        e.push(E.COIN, Math.round(x0 + k * 70), Math.round(y), l, 0);
      }
      return api;
    },
    /** A Close-line coin line above or below a static circle hazard (puffer calm radius). */
    hugCircle(x, cy, r, side, n = 3) {
      const l = line++;
      const y = side === 'top' ? cy - r - CLOSE_OFF : cy + r + CLOSE_OFF;
      const x0 = x - ((n - 1) * 70) / 2;
      for (let k = 0; k < n; k++) e.push(E.COIN, Math.round(x0 + k * 70), Math.round(y), l, 1 | 16);
      return api;
    },
    ring(x, y) { e.push(E.RING, x, y, 0, 0); return api; },
    box(x, y) { e.push(E.BOX, x, y, 0, 0); return api; },
    token(x, y) { e.push(E.TOKEN, x, y, 0, 0); return api; },
    jelly(x, y, phase = 0) { e.push(E.JELLY, x, y, phase, 0); return api; },
    puffer(x, y) { e.push(E.PUFFER, x, y, 0, 0); return api; },
    torpedo(x, y) { e.push(E.TORPEDO, x, y, 0, 0); return api; },
    shield(x, y) { e.push(E.SHIELD, x, y, 0, 0); return api; },
  };
  build(api);
  if (line > 8) throw new Error(`${name}: more than 8 coin lines`);
  // Spacing scale (design 5.8 tuning lever 1, chunk density): x positions and
  // lengths stretch together; coin spacing inside a line stays 70u.
  const sc = Number(process.env.SHARKY_CHUNK_SCALE || X_SCALE);
  if (sc !== 1) {
    for (let k = 0; k < e.length; k += 5) {
      if (e[k] !== E.COIN) e[k + 1] = Math.round(e[k + 1] * sc);
    }
    // Coins: keep each line's 70u spacing, move the line with its anchor.
    const firstX = {};
    for (let k = 0; k < e.length; k += 5) {
      if (e[k] !== E.COIN) continue;
      const l = e[k + 3];
      if (firstX[l] === undefined) firstX[l] = { from: e[k + 1], to: Math.round(e[k + 1] * sc) };
      e[k + 1] += firstX[l].to - firstX[l].from;
    }
    len = Math.round(len * sc);
  }
  return { id, name, len, diff, zone, tier, breather, exitY, e };
}

const CHUNKS = [
  // Every hazard chunk contests the y 400-600 settle line at least once
  // (design 4.4: a no-touch settle line is never a safe strategy).
  // 0: Lagoon warm-up (3s, no hazards): arcs teach hold and release, then a ring.
  chunk(0, 'lagoon_warmup', 900, 1, 0, 0, 1, 500, (c) => c
    .arc(60, 520, 170, 6)
    .arc(470, 470, -160, 5)
    .ring(820, 470)),
  // 1: Pylon pair: a high gap (coins teach the Close line under its top cap), then a low gap.
  chunk(1, 'pylon_pair', 960, 2, 1, 0, 0, 640, (c) => c
    .pylon(80, 300, 0, 'top')
    .pylon(580, 690, 0, false)),
  // 2: Jelly drift: weave over and under bobbing lanterns, one sits on the middle lane.
  chunk(2, 'jelly_drift', 960, 2, 1, 0, 0, 300, (c) => c
    .jelly(160, 300, 0)
    .jelly(460, 520, 512)
    .ring(460, 270)
    .jelly(780, 760, 256)),
  // 3: Ring lane (breather): 3 climbing rings then a coin line.
  chunk(3, 'ring_lane', 760, 1, 1, 0, 1, 330, (c) => c
    .ring(80, 420).ring(290, 360).ring(500, 300)
    .coins(560, 300, 360, 3)),
  // 4: Pylon slalom: a high gap, then a low gap (Close line on the low one), then high.
  chunk(4, 'pylon_slalom', 1000, 4, 2, 0, 0, 320, (c) => c
    .pylon(60, 300, 0, false)
    .pylon(500, 690, 0, 'top')
    .token(640, 870)
    .pylon(880, 320, 1, false)),
  // 5: Jelly curtain: a lantern column with its gap high, a ring in it.
  chunk(5, 'jelly_curtain', 940, 5, 2, 0, 0, 700, (c) => c
    .jelly(260, 480, 0).jelly(260, 620, 0).jelly(260, 760, 0).jelly(260, 900, 0)
    .ring(260, 250)
    .jelly(700, 160, 512).jelly(700, 520, 512)),
  // 6: Box bounty: prize boxes on the lines between pylons.
  chunk(6, 'box_bounty', 1000, 3, 1, 1, 0, 680, (c) => c
    .box(100, 380)
    .pylon(380, 290, 1, 'top')
    .token(680, 200)
    .pylon(840, 700, 0, false)),
  // 7: Puffer patrol: pass them before they inflate, or smash in Overdrive.
  chunk(7, 'puffer_patrol', 1000, 4, 2, 1, 0, 300, (c) => c
    .puffer(180, 500).hugCircle(180, 500, PUFF_ART0, 'top')
    .puffer(520, 320).puffer(550, 720)
    .token(540, 880)
    .box(840, 300)),
  // 8: Puffer in the pylon exit.
  chunk(8, 'puffer_pylon', 1000, 6, 2, 1, 0, 380, (c) => c
    .pylon(40, 300, 0, 'top')
    .puffer(380, 460)
    .pylon(640, 690, 0, false)
    .puffer(920, 380)),
  // 9: Torpedo alley: a runaway bumper boat plus a pylon.
  chunk(9, 'torpedo_alley', 1000, 5, 2, 3, 0, 700, (c) => c
    .torpedo(380, 500)
    .pylon(700, 690, 1, 'bottom')
    .token(900, 240)),
  // 10: Storm mix.
  chunk(10, 'storm_mix', 1000, 8, 3, 3, 0, 860, (c) => c
    .pylon(40, 300, 0, 'bottom')
    .jelly(360, 700, 0).jelly(390, 250, 512)
    .torpedo(600, 500)
    .pylon(820, 690, 0, false)),
  // 11: Gauntlet: tight pylons, puffers, lanterns.
  chunk(11, 'gauntlet', 1000, 9, 3, 1, 0, 520, (c) => c
    .pylon(40, 300, 2, 'bottom')
    .puffer(360, 560).jelly(360, 860, 256)
    .pylon(600, 690, 2, false)
    .jelly(880, 330, 0)),
  // 12: Shield breather (ride sprint 2 only): rings and a Bubble Shield.
  chunk(12, 'shield_breather', 760, 1, 1, 0, 1, 520, (c) => c
    .ring(80, 420).shield(300, 500).ring(500, 360)
    .coins(560, 380, 520, 3)),
  // 13: Risk fork (diff 4+): the tight line under the low gap's top cap pays about 2x.
  chunk(13, 'reef_fork', 1000, 4, 2, 0, 0, 300, (c) => c
    .pylon(120, 700, 0, 'top')
    .ring(180, 700 - 190 + 51)
    .jelly(660, 520, 0)
    .pylon(660, 280, 1, false)),
];

const CHUNK_WARMUP = 0;
const CHUNK_BREATHER = 3;
const CHUNK_SHIELD = 12;

function emit() {
  const lines = [];
  lines.push('// CHUNKS-BEGIN (generated by tools/sharky/chunks-src.cjs; edit the source, then run it)');
  lines.push('export const CHUNKS: Chunk[] = [');
  for (const c of CHUNKS) {
    lines.push(`  { id: ${c.id}, name: '${c.name}', len: ${c.len}, diff: ${c.diff}, zone: ${c.zone}, tier: ${c.tier}, breather: ${c.breather}, exitY: ${c.exitY},`);
    const rows = [];
    for (let k = 0; k < c.e.length; k += 5) rows.push(c.e.slice(k, k + 5).join(', '));
    lines.push('    e: [');
    for (let k = 0; k < rows.length; k += 4) lines.push(`      ${rows.slice(k, k + 4).join(', ')},`);
    lines.push('    ] },');
  }
  lines.push('];');
  lines.push(`export const CHUNK_WARMUP = ${CHUNK_WARMUP};`);
  lines.push(`export const CHUNK_BREATHER = ${CHUNK_BREATHER};`);
  lines.push(`export const CHUNK_SHIELD = ${CHUNK_SHIELD};`);
  lines.push('// CHUNKS-END');
  return lines.join('\n');
}

module.exports = { CHUNKS, emit, CLOSE_OFF, GAP_D2 };

if (require.main === module) {
  const file = path.resolve(__dirname, '../../src/games/sharky/sim/core.ts');
  const src = fs.readFileSync(file, 'utf8');
  const re = /\/\/ CHUNKS-BEGIN[\s\S]*?\/\/ CHUNKS-END/;
  if (!re.test(src)) throw new Error('core.ts has no CHUNKS markers');
  const next = src.replace(re, emit());
  if (process.argv.includes('--check')) {
    if (next !== src) {
      console.error('core.ts chunk table is stale: run node tools/sharky/chunks-src.cjs');
      process.exit(1);
    }
    console.log('chunks ok');
  } else {
    fs.writeFileSync(file, next);
    console.log('wrote', CHUNKS.length, 'chunks');
  }
}
