"""Parade Beat chart authoring (design rhythm.md 3.2-3.5, 4.6, 5.5, 7.3).

Reads tools/rhythm/analysis/<stage>.json (band onsets on the 16th grid of the
measured beat map) and writes src/games/rhythm/stages/<stage>.json: the
authored charts for every difficulty and format, the March layer, the seeded
variant groups and the beat map. The runtime generate() only picks among the
authored alternates with the seed; it never invents a note.

Charting rules (every rule is a design rule):
  * a note is placed only where the exported stage audio has an onset within
    +/-15 ms of the grid slot, and its time is that onset's time;
  * DRUM on kick-led onsets, RIM on snare-led ones (stage vocab permitting);
  * density per section and difficulty from section 3.4 (targets, not a
    recipe: no onset, no note);
  * d1 plays quarters, d2 adds 8ths, d3 adds at most two 16ths a bar;
  * no d3 bar has more than 3 same-zone notes in a row at 8th spacing;
  * CYMBAL on crash onsets with a real high-band sustain, never within 1/4
    beat before another note when it may be a flick (d3);
  * ROLL only over a real snare/tom run (3+ snare onsets in 2 beats);
  * BIG on the last playable bar's downbeat (+2 mid-song at d3);
  * POPPER on the last Breakdown bar at d2/d3; FREEZE only on true rests;
  * ECHO: an answer bar whose call bar is left empty for the leader;
  * March layer: 2-4 quarter-note hits a bar with audible kick/snare, one of
    four patterns, changed at most every 2 bars.

Note row: [tMs, beat, sixteenth, kind, zone, layers, extra, group, alt, flags]
  kind: 0 DRUM, 1 RIM, 2 ROLL, 3 BIG, 4 CYMBAL, 5 POPPER, 6 FREEZE
  zone: 0 centre, 1 rim (RIM notes), 2 any
  layers: 1 standing, 2 march (bitmask)
  extra: ROLL end ms, POPPER taps needed, else 0
  group/alt: seeded variant group (0 = always) and alternate index
  flags: 1 ECHO answer, 2 either (CYMBAL or DRUM by seed), 4 flick-able
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src/games/rhythm/stages')

DRUM, RIM, ROLL, BIG, CYMBAL, POPPER, FREEZE = range(7)
STANDING, MARCH = 1, 2
F_ECHO, F_EITHER, F_FLICK = 1, 2, 4
CHART_VERSION = 'pb-3.0'

# Round sections (queue, 24 playable bars): name, first bar, last bar (1-based).
QUEUE_SECTIONS = [
    ('warmup', 1, 4), ('stepup', 5, 8), ('echo', 9, 12), ('chorus', 13, 16), ('breakdown', 17, 20), ('finale', 21, 24),
]
RIDE_SECTIONS = [('warmup', 1, 4), ('chorus', 5, 8), ('finale', 9, 12)]
DENSITY = {  # notes per bar, d1 / d2 / d3
    'warmup': (3, 4, 5), 'stepup': (4, 5, 7), 'echo': (3, 4, 6), 'chorus': (4, 6, 8),
    'breakdown': (2, 3, 4), 'finale': (4, 6, 9),
}
ECHO = 'echo'
# Rev 7 launch vocabulary (design 3.2): DRUM, RIM, BIG only. RIM is Shark
# Shop's new idea (stage 2); Waiting Room (stage 1, the ride stage) is DRUM and
# BIG. ROLL returns in drop C2; CYMBAL, POPPER, ECHO and FREEZE in C3-C5.
VOCAB = {
    'waiting_room_a': {1: {DRUM, BIG}, 2: {DRUM, BIG}},
    'shark_shop_a': {1: {DRUM, RIM, BIG}, 2: {DRUM, RIM, BIG}},
    # Drop C1 stages (not in the launch rotation).
    'opening_day_a': {1: {DRUM, BIG}, 2: {DRUM, RIM, BIG}},
    'backpack_bounce_a': {1: {DRUM, RIM, BIG}, 2: {DRUM, RIM, BIG}},
}
RIDE_VOCAB = {DRUM, BIG}
POS_WEIGHT = {0: 1.35, 4: 1.0, 8: 1.15, 12: 1.0, 2: 0.9, 6: 0.9, 10: 0.9, 14: 0.9}  # slot in bar -> weight
THRESH = 0.28  # minimum onset strength for a note (normalised flux)


def slot_weight(slot):
    if slot in POS_WEIGHT:
        return POS_WEIGHT[slot]
    return 0.7


class Bar:
    def __init__(self, idx, slots):
        self.idx = idx  # bar index in the file (0 = first pre-roll bar)
        self.slots = slots  # slot 0..15 -> dict(t, a, k, s, c, sus)

    def strength(self, slot):
        v = self.slots.get(slot)
        if not v:
            return 0.0
        return max(v['a'], 0.8 * (v['k'] + v['s']))

    def zone(self, slot):
        v = self.slots[slot]
        return RIM if v['s'] > v['k'] * 1.25 and v['s'] > 0.35 else DRUM


def load(stage_id, fmt):
    a = json.load(open(os.path.join(HERE, 'analysis', f'{stage_id}.json')))
    f = a['formats'][fmt]
    bars = {}
    for k, s, t, aa, kk, sn, cr, sus in f['candidates']:
        b = k // 4
        slot = (k % 4) * 4 + s
        bars.setdefault(b, {})[slot] = dict(t=t, a=aa, k=kk, s=sn, c=cr, sus=sus)
    nb = f['preRollBars'] + f['playableBars'] + f['outroBars']
    return a, f, [Bar(b, bars.get(b, {})) for b in range(nb)]


def allowed_slots(d):
    if d == 1:
        return [0, 4, 8, 12]
    if d == 2:
        return list(range(0, 16, 2))
    return list(range(16))


def pick(bar, d, n, prev_pattern=None, avoid=()):
    """Choose up to n slots on real onsets with rhythmic weighting."""
    slots = [s for s in allowed_slots(d) if s not in avoid and bar.strength(s) >= THRESH]
    scored = sorted(slots, key=lambda s: -bar.strength(s) * slot_weight(s))
    # prefer repeating the previous bar's rhythm when the audio supports it
    if prev_pattern:
        rep = [s for s in prev_pattern if s in slots]
        greedy = scored[:n]
        if rep and sum(bar.strength(s) for s in rep[:n]) >= 0.8 * sum(bar.strength(s) for s in greedy):
            scored = rep + [s for s in scored if s not in rep]
    out = []
    sixteenths = 0
    for s in scored:
        if len(out) >= n:
            break
        if d == 3 and s % 2 == 1:
            if sixteenths >= 2:
                continue
            # a 16th needs a neighbour 8th to form a readable figure
        if any(abs(s - o) < (4 if d == 1 else 2 if d == 2 else 1) for o in out):
            continue
        out.append(s)
        if s % 2 == 1:
            sixteenths += 1
    return sorted(out)


def zones_for(bar, slots, d, vocab):
    z = []
    for s in slots:
        zz = bar.zone(s) if RIM in vocab else DRUM
        z.append(zz)
    if d == 3:  # no more than 3 consecutive same-zone notes at 8th spacing or faster
        run = 1
        for i in range(1, len(slots)):
            if z[i] == z[i - 1] and slots[i] - slots[i - 1] <= 2:
                run += 1
                if run > 3:
                    z[i] = RIM if z[i] == DRUM else DRUM
                    run = 1
            else:
                run = 1
    return z


def roll_span(bar):
    """A ROLL over beats 3-4 when there is a real snare run (3+ onsets)."""
    hits = [s for s in range(8, 16) if bar.slots.get(s, {}).get('s', 0) >= 0.3]
    if len(hits) >= 3:
        return hits[0], min(15, hits[-1] + 1)
    return None


def march_pattern(bar):
    beats = [bar.strength(s) for s in (0, 4, 8, 12)]
    pats = {'1234': (0, 1, 2, 3), '13': (0, 2), '24': (1, 3), '123': (0, 1, 2)}
    best, bs = None, -1
    for name, p in pats.items():
        if any(beats[i] < THRESH * 0.8 for i in p):
            continue
        sc = sum(beats[i] for i in p) / len(p) + 0.05 * len(p)
        if sc > bs:
            best, bs = name, sc
    return best or '13'


def t_at(bar, slot, beat_us):
    v = bar.slots.get(slot)
    if v:
        return v['t']
    b = bar.idx * 4 + slot // 4
    frac = (slot % 4) / 4
    return int((beat_us[b] + (beat_us[b + 1] - beat_us[b]) * frac) / 1000)


def author(stage_id, fmt, d, analysis, f, bars):
    """Rev 6 wrapper: author every difficulty together (nesting) and return one."""
    charts = author_all(stage_id, fmt, f, bars)
    return charts[d], []


def pick_with(bar, d, n, forced, avoid, prev):
    """Up to n slots: the forced slots first, then the strongest onsets that
    keep the difficulty's spacing (quarters d1, 8ths d2)."""
    out = sorted(set(forced))
    gap = 4 if d == 1 else 2
    slots = [s for s in allowed_slots(d) if s not in avoid and s not in out and bar.strength(s) >= THRESH]
    scored = sorted(slots, key=lambda s: -bar.strength(s) * slot_weight(s))
    if prev:
        rep = [s for s in prev if s in slots]
        if rep:
            scored = rep + [s for s in scored if s not in rep]
    for s in scored:
        if len(out) >= n:
            break
        if any(abs(s - o) < gap for o in out):
            continue
        out.append(s)
    return sorted(out)


def author_all(stage_id, fmt, f, bars):
    """Rev 7 charting (design rhythm.md 3.2-3.6, 4.5):
      * launch vocabulary only: DRUM, RIM, BIG (RIM from stage 2);
      * one canonical chart per stage and difficulty (no seeded groups);
      * nesting by tick: MARCH layer in d1, d1 in d2;
      * no note in the last beat before a drop line (sections start on
        bars 5, 9, 13, 17, 21; ride 5, 9): Fever drops out of silence;
      * at most one RIM a bar at d1; no d2 bar with 4 same-zone 8ths in a row;
      * one BIG at d2 on the bar-12 crash, BIG on the last bar's downbeat."""
    beat_us = f['beatTimesUs']
    pre = f['preRollBars']
    nplay = f['playableBars']
    sections = QUEUE_SECTIONS if fmt == 'queue' else RIDE_SECTIONS
    if nplay != (24 if fmt == 'queue' else 12):
        raise RuntimeError('section table expects 24 queue / 12 ride bars')
    diffs = (1, 2) if fmt == 'queue' else (1,)
    notes = {d: [] for d in diffs}

    def add(d, bar, slot, kind, layers=STANDING, extra=0):
        tt = t_at(bar, slot, beat_us)
        zone = 1 if kind == RIM else (2 if kind == BIG else 0)
        notes[d].append([tt, bar.idx * 4 + slot // 4, slot % 4, kind, zone, layers, extra, 0, 0, 0])

    def section_of(r):
        for name, a, b in sections:
            if a <= r <= b:
                return name
        return 'finale'

    def slot_t(bar, slot):
        b = bar.idx * 4 + slot // 4
        return int((beat_us[b] + (beat_us[b + 1] - beat_us[b]) * (slot % 4) / 4) / 1000)

    prev = {d: None for d in diffs}
    march_prev = None
    for r in range(1, nplay + 1):
        bar = bars[pre + r - 1]
        sec = section_of(r)
        last = r == nplay
        pre_drop = r % 4 == 0 and not last  # the bar before a drop line
        forbid = set(range(12, 16)) if pre_drop else set()
        vocab = {d: (RIDE_VOCAB if fmt == 'ride' else VOCAB[stage_id][d]) for d in diffs}
        if last:
            for d in diffs:
                add(d, bar, 0, BIG, STANDING | MARCH)
            continue
        # March pattern held for 2 bars, only on audible quarters.
        if (r - 1) % 2 == 0 or march_prev is None:
            march_prev = march_pattern(bar)
        mslots = {'1234': [0, 4, 8, 12], '13': [0, 8], '24': [4, 12], '123': [0, 4, 8]}[march_prev]
        mslots = [s for s in mslots if s not in forbid and bar.strength(s) >= THRESH * 0.8]
        if not mslots:
            mslots = [0]
        # ROLL on a real snare run in a fill bar (ends before the rest beat).
        roll = None
        if pre_drop and any(ROLL in vocab[d] for d in diffs):
            hits = [s for s in range(4, 12) if bar.slots.get(s, {}).get('s', 0) >= 0.3]
            if len(hits) >= 3:
                roll = (4, 12)
        # d1: march slots plus the strongest quarters.
        dens = lambda d: DENSITY[sec][d - 1] if fmt == 'queue' else (3, 4, 4)[['warmup', 'chorus', 'finale'].index(sec)]
        d1_avoid = set(forbid)
        if roll:
            d1_avoid |= set(range(5, 16))
            mslots = [s for s in mslots if s <= 4]
        s1 = pick_with(bar, 1, max(dens(1), len(mslots)), mslots, d1_avoid, prev[1])
        chosen = {1: s1}
        if 2 in diffs:
            d2_avoid = set(forbid) | (set(range(5, 16)) if roll and ROLL in vocab[2] else set())
            chosen[2] = pick_with(bar, 2, max(dens(2), len(s1)), s1, d2_avoid, prev[2])
        for d in diffs:
            slots = chosen[d]
            prev[d] = slots
            has_roll = roll and ROLL in vocab[d]
            rim_used = 0
            for s in slots:
                kind = bar.zone(s) if RIM in vocab[d] else DRUM
                if kind == RIM and d == 1:
                    if rim_used >= 1:
                        kind = DRUM
                    rim_used += 1
                if has_roll and s == roll[0]:
                    add(d, bar, s, ROLL, STANDING, slot_t(bar, roll[1]))
                    continue
                if d == 2 and r == 12 and s == 0 and fmt == 'queue' and bar.slots.get(0, {}).get('c', 0) > 0.3:
                    kind = BIG
                layers = STANDING | (MARCH if s in mslots else 0)
                add(d, bar, s, kind, layers)
            if has_roll and roll[0] not in slots:
                add(d, bar, roll[0], ROLL, STANDING, slot_t(bar, roll[1]))
    for d in diffs:
        notes[d].sort(key=lambda n: (n[0], n[3]))
        if d == 2:
            vocab = RIDE_VOCAB if fmt == 'ride' else VOCAB[stage_id][2]
            d1_ticks = {n_[1] * 4 + n_[2] for n_ in notes.get(1, [])}
            fix_runs(notes[d], RIM in vocab, d1_ticks)
    return notes


def fix_runs(notes, allow_rim=True, d1_ticks=frozenset()):
    """No d2 bar has more than 3 same-zone notes in a row at 8th spacing or
    faster, counting an 'either' CYMBAL as the DRUM it may become. A stage
    without RIM drops the 4th d2-only note instead of switching its zone."""
    drop = []
    by_bar = {}
    for n_ in notes:
        if n_[5] & STANDING and n_[3] in (DRUM, RIM, CYMBAL):
            by_bar.setdefault(n_[1] // 4, []).append(n_)
    for bar_notes in by_bar.values():
        combos = {(0, 0)} | {(n_[7], n_[8]) for n_ in bar_notes if n_[7]}
        for g, a in combos:
            seq = [n_ for n_ in bar_notes if n_[7] == 0 or (n_[7] == g and n_[8] == a)]
            seq.sort(key=lambda n_: n_[0])
            run = 1
            for i in range(1, len(seq)):
                za = RIM if seq[i - 1][3] == RIM else DRUM
                zb = RIM if seq[i][3] == RIM else DRUM
                if za == zb and seq[i][0] - seq[i - 1][0] <= 260:
                    run += 1
                    if run > 3:
                        if not allow_rim:
                            if seq[i][1] * 4 + seq[i][2] in d1_ticks or seq[i][3] != DRUM:
                                continue
                            drop.append(seq[i])
                            run = 1
                            continue
                        if seq[i][3] == DRUM:
                            seq[i][3], seq[i][4] = RIM, 1
                        elif seq[i][3] == RIM:
                            seq[i][3], seq[i][4] = DRUM, 0
                        else:
                            continue
                        run = 1
                else:
                    run = 1
    for n_ in drop:
        if n_ in notes:
            notes.remove(n_)


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    for sid in ids:
        out = None
        for fmt in ('queue', 'ride'):
            a = json.load(open(os.path.join(HERE, 'analysis', f'{sid}.json')))
            if fmt not in a['formats']:
                continue
            analysis, f, bars = load(sid, fmt)
            if out is None:
                out = dict(id=sid, title=analysis['title'], key=analysis['key'], bpm=analysis['bpm'],
                           chartVersion=CHART_VERSION, formats={})
            charts = {}
            groups = {}
            for d, n in author_all(sid, fmt, f, bars).items():
                charts[str(d)] = n
                groups[str(d)] = []
            bh = hashlib.sha1(json.dumps(f['beatTimesUs']).encode()).hexdigest()[:8]
            out['formats'][fmt] = dict(
                audio=f['audio'], fever=f['fever'], durationMs=f['durationMs'],
                preRollBars=f['preRollBars'], playableBars=f['playableBars'], outroBars=f['outroBars'],
                beatUs=f['beatTimesUs'], beatmapHash=bh, barEnergy=f['barEnergy'],
                residualMs=f['residualMs'], charts=charts, groups=groups,
            )
            for d, n in charts.items():
                st = sum(1 for x in n if x[5] & STANDING)
                mk = sum(1 for x in n if x[5] & MARCH)
                kinds = {}
                for x in n:
                    kinds[x[3]] = kinds.get(x[3], 0) + 1
                print(f'{sid} {fmt} d{d}: {len(n)} rows, standing {st}, march {mk}, kinds {kinds}, groups {len(groups[d])}')
        with open(os.path.join(OUT, f'{sid}.json'), 'w') as fh:
            json.dump(out, fh, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1:] or ['opening_day_a', 'waiting_room_a', 'shark_shop_a', 'backpack_bounce_a'])
