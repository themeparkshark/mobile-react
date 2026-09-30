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
CHART_VERSION = 'pb-1.0'

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
VOCAB = {
    'opening_day_a': {1: {DRUM, BIG}, 2: {DRUM, RIM, BIG, ROLL}, 3: {DRUM, RIM, BIG, ROLL, CYMBAL, ECHO, FREEZE, POPPER}},
    'waiting_room_a': {1: {DRUM, RIM, BIG}, 2: {DRUM, RIM, BIG, ROLL, CYMBAL, ECHO}, 3: {DRUM, RIM, BIG, ROLL, CYMBAL, ECHO, FREEZE, POPPER}},
    'shark_shop_a': {1: {DRUM, RIM, ROLL, BIG}, 2: {DRUM, RIM, ROLL, BIG, CYMBAL, ECHO, POPPER}, 3: {DRUM, RIM, BIG, ROLL, CYMBAL, ECHO, FREEZE, POPPER}},
    'backpack_bounce_a': {1: {DRUM, RIM, BIG}, 2: {DRUM, RIM, ROLL, BIG, CYMBAL, ECHO, POPPER}, 3: {DRUM, RIM, BIG, ROLL, CYMBAL, ECHO, FREEZE, POPPER}},
}
RIDE_VOCAB = {DRUM, ROLL, BIG, CYMBAL}
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
    beat_us = f['beatTimesUs']
    pre = f['preRollBars']
    nplay = f['playableBars']
    sections = QUEUE_SECTIONS if fmt == 'queue' else RIDE_SECTIONS
    if nplay != (24 if fmt == 'queue' else 12):
        raise RuntimeError('section table expects 24 queue / 12 ride bars')
    vocab = RIDE_VOCAB if fmt == 'ride' else VOCAB[stage_id][d]
    notes = []
    groups = []  # [id, type, n alts, eligible]
    gid = [0]

    def new_group(kind, alts):
        gid[0] += 1
        groups.append([gid[0], kind, alts])
        return gid[0]

    def add(bar, slot, kind, zone, layers=STANDING, extra=0, g=0, a=0, flags=0, t=None):
        tt = t if t is not None else t_at(bar, slot, beat_us)
        notes.append([tt, bar.idx * 4 + slot // 4, slot % 4 + (slot // 4) * 0, kind, zone, layers, extra, g, a, flags])

    def section_of(r):
        for name, a, b in sections:
            if a <= r <= b:
                return name
        return 'finale'

    prev = None
    march_prev = None
    echo_pairs = []
    # ECHO candidates: bars 9-12 pairs (9,10), (11,12) plus chorus pair (13,14) -> seed picks 2 of 3
    if ECHO in vocab and fmt == 'queue':
        echo_pairs = [(9, 10), (11, 12), (15, 16)]
    echo_group = {}
    for pair in echo_pairs:
        echo_group[pair] = new_group('echo', 2)
    freeze_slots = []
    ride_cymbal_done = False
    for r in range(1, nplay + 1):
        bar = bars[pre + r - 1]
        sec = section_of(r)
        dens = DENSITY[sec][d - 1] if fmt == 'queue' else (3, 4, 4)[['warmup', 'chorus', 'finale'].index(sec)]
        last = r == nplay
        # March layer for this bar (pattern held for 2 bars)
        if (r - 1) % 2 == 0 or march_prev is None:
            march_prev = march_pattern(bar)
        mslots = {'1234': [0, 4, 8, 12], '13': [0, 8], '24': [4, 12], '123': [0, 4, 8]}[march_prev]
        if last:
            mslots = [0]

        def emit_bar(slots, zones, g=0, a=0, flags=0, allow_special=True):
            for s, z in zip(slots, zones):
                kind = z  # DRUM or RIM
                fl = flags
                v = bar.slots.get(s, {})
                if allow_special and CYMBAL in vocab and s in (0, 8) and v.get('c', 0) > 0.55 and v.get('sus', 0) > 0.25 and not last:
                    if fmt == 'ride':
                        if sec == 'finale' and not ride_cymbal_done:
                            kind, fl = CYMBAL, fl
                            mark_ride_cymbal()
                    else:
                        kind = CYMBAL
                        fl |= F_EITHER
                        if d == 3 and not any(0 < o - s <= 1 for o in slots):
                            fl |= F_FLICK
                layers = STANDING | (MARCH if (s in mslots and kind in (DRUM, RIM, CYMBAL)) else 0)
                add(bar, s, kind, 1 if kind == RIM else 0, layers, 0, g, a, fl)

        def mark_ride_cymbal():
            nonlocal ride_cymbal_done
            ride_cymbal_done = True

        pair = next((p for p in echo_pairs if r in p), None)
        is_fill_bar = r % 4 == 0 and not last
        if last:
            # BIG on beat 1, then nothing (the curtain). March hears it too.
            add(bar, 0, BIG, 2, STANDING | MARCH)
            prev = [0]
            continue
        if fmt == 'queue' and r == 20 and POPPER in vocab and d >= 2:
            end_t = int(beat_us[bar.idx * 4 + 4] / 1000)
            add(bar, 0, POPPER, 2, STANDING | MARCH, end_t, t=int(beat_us[bar.idx * 4] / 1000))
            prev = None
            continue
        if pair and r == pair[0]:
            # call bar: normal notes (alt 0) or empty for the leader's call (alt 1)
            g = echo_group[pair]
            slots = pick(bar, d, dens, prev)
            emit_bar(slots, zones_for(bar, slots, d, vocab), g, 0)
            # march still plays the call bar's quarter hits (no ECHO in March)
            for s in mslots:
                if bar.strength(s) >= THRESH * 0.8:
                    add(bar, s, DRUM, 2, MARCH, 0, g, 1)
                    if s not in slots:
                        add(bar, s, DRUM, 2, MARCH, 0, g, 0)
            prev = slots
            continue
        if pair and r == pair[1]:
            g = echo_group[pair]
            slots = pick(bar, min(d, 2), max(3, dens - 1), prev)
            zones = zones_for(bar, slots, d, vocab)
            emit_bar(slots, zones, g, 0, allow_special=False)
            emit_bar(slots, zones, g, 1, F_ECHO, allow_special=False)
            prev = slots
            continue
        if is_fill_bar:
            # three onset-backed alternates for every 4th bar
            g = new_group('fill', 3)
            base = pick(bar, d, dens, prev)
            alt1 = pick(bar, d, max(2, dens - 1), None, avoid=base[:1])
            rs = roll_span(bar) if ROLL in vocab else None
            for a_i, slots in enumerate([base, alt1, None]):
                if slots is None:
                    if rs:
                        head = [s for s in pick(bar, d, dens, prev) if s < rs[0]]
                        emit_bar(head, zones_for(bar, head, d, vocab), g, 2)
                        end_slot = rs[1]
                        b_end = bar.idx * 4 + end_slot // 4
                        end_t = int((beat_us[b_end] + (beat_us[b_end + 1] - beat_us[b_end]) * (end_slot % 4) / 4) / 1000)
                        add(bar, rs[0], ROLL, 2, STANDING, end_t, g, 2)
                        for s in mslots:
                            if s < rs[0] and s not in head:
                                add(bar, s, DRUM, 2, MARCH, 0, g, 2)
                            elif s >= rs[0]:
                                add(bar, s, DRUM, 2, MARCH, 0, g, 2)
                        continue
                    slots = pick(bar, min(3, d + 1), dens, None)
                emit_bar(slots, zones_for(bar, slots, d, vocab), g, a_i)
                for s in mslots:
                    if s not in slots and bar.strength(s) >= THRESH * 0.8:
                        add(bar, s, DRUM, 2, MARCH, 0, g, a_i)
            prev = base
            continue
        slots = pick(bar, d, dens, prev)
        emit_bar(slots, zones_for(bar, slots, d, vocab))
        for s in mslots:
            if s not in slots and bar.strength(s) >= THRESH * 0.8:
                add(bar, s, DRUM, 2, MARCH)
        prev = slots
        # FREEZE candidates on true rests in the Breakdown (d3)
        if fmt == 'queue' and d == 3 and FREEZE in vocab and sec == 'breakdown':
            for s in (4, 12, 6, 14):
                if s not in slots and bar.strength(s) < 0.2 and all(abs(s - o) >= 2 for o in slots):
                    freeze_slots.append((bar, s))
                    break
    for bar, s in freeze_slots[:4]:
        g = new_group('freeze', 2)
        add(bar, s, FREEZE, 2, STANDING, 0, g, 1)
    # ROLL in the ride sprint: on the chorus fill when there is a snare run
    if fmt == 'ride' and ROLL in vocab:
        pass
    notes.sort(key=lambda n: (n[0], n[3]))
    if d == 3:
        fix_runs(notes)
    # normalise the 'sixteenth' column to the in-beat 16th (0-3)
    for n_ in notes:
        n_[2] = n_[2] % 4
    return notes, groups


def fix_runs(notes):
    """No d3 bar has more than 3 same-zone notes in a row at 8th spacing or
    faster, counting an 'either' CYMBAL as the DRUM it may become."""
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
                        if seq[i][3] == DRUM:
                            seq[i][3], seq[i][4] = RIM, 1
                        elif seq[i][3] == RIM:
                            seq[i][3], seq[i][4] = DRUM, 0
                        else:
                            continue
                        run = 1
                else:
                    run = 1


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
            for d in ((1, 2, 3) if fmt == 'queue' else (1,)):
                n, g = author(sid, fmt, d, analysis, f, bars)
                charts[str(d)] = n
                groups[str(d)] = g
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
