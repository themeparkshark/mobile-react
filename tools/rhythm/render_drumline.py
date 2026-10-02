#!/usr/bin/env python3
"""
Parade Beat rev 7 audio render (design rhythm.md 7.3-7.6). Offline, 0 credits.

For every launch stage format it writes four MP3 decks that start together and
stay sample-locked (same rate, same encoder, so any decoder priming is equal):

  <stage>_<fmt>_bed.mp3    Chris's song window (the existing cut), 44.1 kHz stereo
  <stage>_<fmt>_acc.mp3    Drumline accompaniment: bass drum on uncharted beats,
                           snare ghosts, tenor fills into each drop line, the 4
                           count-in stick clicks, a unison crash on every drop
                           line; 4 LU under the bed
  <stage>_<fmt>_guide.mp3  one drum voice per d1 note (MARCH notes included),
                           12 LU under the bed; the game gains it per section
  <stage>_<fmt>_fever.mp3  claps on 2 and 4 plus tambourine 8ths, 6 LU under the
                           bed; faded in only during a Fever section

and the layered keysounds (7.5) as short WAVs in audio/sfx/:
  rh_drum_hit, rh_drum_hit_plus, rh_rim_hit, rh_rim_hit_plus, rh_big_crash.

Sources are the studio's existing one-shots (ElevenLabs takes already paid for
in wave 6, studio/audio/_raw/rhythm) and Chris's firework_pop.mp3. The marching
knock layer is procedural (a damped 190 Hz body and a short filtered noise
burst) until the gated rh_drum_knock take exists. Nothing here is AI music.

Humanised (7.3): round-robin over every variant, never the same twice in a
row; accents downbeat +3 dB, offbeat -3 dB, ghosts -9 dB; seeded +/-3 ms on
the accompaniment only; a flam on BIG (grace hit 25 ms early at -6 dB);
velocity follows barEnergy.

Mastering (7.6): one-shots get a 50 Hz high-pass (40 Hz on kick bodies),
leading silence trimmed at -50 dB, 5 ms fades and a -1.5 dBTP ceiling
(4x oversampled peak). Stems are loudness-matched to the bed with ffmpeg's
ebur128 and limited to -1.0 dBTP after encoding.

  python3 tools/rhythm/render_drumline.py [stage_id ...]
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
STAGES = os.path.join(ROOT, 'src/games/rhythm/stages')
AUDIO = os.path.join(ROOT, 'src/games/rhythm/audio')
SFX = os.path.join(AUDIO, 'sfx')
RAW = os.path.expanduser('~/apps/tps-mg/audio/_raw/rhythm')
CHRIS = os.path.join(ROOT, 'assets/sounds')
SR = 44100
LAUNCH = [('waiting_room_a', 'queue'), ('waiting_room_a', 'ride'), ('shark_shop_a', 'queue')]
DRUM, RIM, ROLL, BIG = 0, 1, 2, 3
STANDING, MARCH = 1, 2


# ---------------------------------------------------------------- io

def decode(path, sr=SR, mono=True):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(sr), '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).copy()
    return a if mono else a.reshape(-1, 2)


def write_wav(path, x, sr=SR):
    x = np.clip(x, -1, 1)
    with tempfile.NamedTemporaryFile(suffix='.f32', delete=False) as fh:
        fh.write(x.astype(np.float32).tobytes())
        tmp = fh.name
    ch = '2' if x.ndim == 2 else '1'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', ch, '-i', tmp,
                    '-c:a', 'pcm_s16le', path], check=True)
    os.unlink(tmp)


def encode_mp3(path, x, kbps, sr=SR):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as fh:
        tmp = fh.name
    write_wav(tmp, x, sr)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', f'{kbps}k',
                    '-ar', str(sr), path], check=True)
    os.unlink(tmp)


def lufs(x, sr=SR):
    """Integrated loudness via ffmpeg ebur128 (None when too quiet to gate)."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as fh:
        tmp = fh.name
    write_wav(tmp, x, sr)
    out = subprocess.run(['ffmpeg', '-v', 'info', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    os.unlink(tmp)
    val = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('I:') and 'LUFS' in line:
            try:
                val = float(line.split()[1])
            except ValueError:
                pass
    return val


def true_peak(x):
    """4x oversampled peak (dBTP) of a mono or stereo signal."""
    m = x if x.ndim == 1 else x.max(axis=1)
    n = len(m)
    if n == 0:
        return -120.0
    spec = np.fft.rfft(m)
    up = np.fft.irfft(spec, n * 4) * 4
    pk = max(np.max(np.abs(up)), np.max(np.abs(x)))
    return float(20 * np.log10(max(float(pk), 1e-9)))


# ---------------------------------------------------------------- dsp

def hpf(x, hz, sr=SR):
    """2nd-order Butterworth high-pass (RBJ biquad)."""
    w0 = 2 * np.pi * hz / sr
    q = 0.7071
    alpha = np.sin(w0) / (2 * q)
    cs = np.cos(w0)
    b0, b1, b2 = (1 + cs) / 2, -(1 + cs), (1 + cs) / 2
    a0, a1, a2 = 1 + alpha, -2 * cs, 1 - alpha
    b = np.array([b0, b1, b2]) / a0
    a = np.array([1, a1 / a0, a2 / a0])
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        xi = x[i]
        yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2, x1 = x1, xi
        y2, y1 = y1, yi
        y[i] = yi
    return y


def lpf1(x, hz, sr=SR):
    a = np.exp(-2 * np.pi * hz / sr)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def trim(x, thresh_db=-50):
    t = 10 ** (thresh_db / 20) * max(np.max(np.abs(x)), 1e-9)
    idx = np.nonzero(np.abs(x) > t)[0]
    if len(idx) == 0:
        return x
    return x[idx[0]:]


def fades(x, ms_in=5, ms_out=5):
    x = x.copy()
    a = int(SR * ms_in / 1000)
    b = int(SR * ms_out / 1000)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def cut(x, ms):
    n = int(SR * ms / 1000)
    return fades(x[:n], 5, min(40, ms // 4))


def ceiling(x, dbtp=-1.5):
    tp = true_peak(x)
    if tp > dbtp:
        x = x * 10 ** ((dbtp - tp) / 20)
    return x


def limit(x, thr_db=-2.5, release_ms=60):
    """Peak limiter: instant attack on a 1 ms look-ahead envelope, exponential release."""
    thr = db(thr_db)
    a = np.abs(x)
    w = max(1, int(SR * 0.001))
    # Look-ahead envelope: max over the next 1 ms.
    pad = np.concatenate([a, np.zeros(w)])
    env = np.maximum.reduce([pad[k:k + len(a)] for k in range(w)])
    want = np.minimum(1.0, thr / np.maximum(env, 1e-9))
    rel = np.exp(-1 / (SR * release_ms / 1000))
    g = np.empty_like(want)
    cur = 1.0
    for i in range(len(want)):
        cur = want[i] if want[i] < cur else want[i] + (cur - want[i]) * rel
        g[i] = cur
    return x * g


def master(x, hp=50):
    return ceiling(fades(trim(hpf(x, hp))), -1.5)


def db(v):
    return 10 ** (v / 20)


def band_energy(x, lo, hi):
    spec = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    tot = spec.sum() or 1
    return spec[(f >= lo) & (f < hi)].sum() / tot


# ---------------------------------------------------------------- sources

def load_takes(name, variants=(1, 2, 3), hp=50):
    out = []
    for v in variants:
        p = os.path.join(RAW, f'{name}__v{v}.mp3')
        if os.path.exists(p):
            out.append(master(decode(p), hp))
    if not out:
        raise RuntimeError(f'no takes for {name} in {RAW}')
    return out


def knock(seed):
    """Procedural marching tenor knock: damped 190 Hz body + bandpassed click (placeholder for rh_drum_knock)."""
    rng = np.random.default_rng(seed)
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    f = 190 * (1 + 0.25 * np.exp(-t * 60))  # small pitch drop
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    noise = rng.standard_normal(n) * np.exp(-t * 180)
    noise = hpf(lpf1(noise, 4500), 900) * 0.6
    return master(body * 0.9 + noise, 60)


class RoundRobin:
    def __init__(self, takes, seed):
        self.takes = takes
        self.last = -1
        self.rng = np.random.default_rng(seed)

    def next(self):
        if len(self.takes) == 1:
            return self.takes[0]
        k = self.last
        while k == self.last:
            k = int(self.rng.integers(len(self.takes)))
        self.last = k
        return self.takes[k]


def place(buf, x, t_ms, gain):
    i = int(round(t_ms * SR / 1000))
    if i < 0:
        x = x[-i:]
        i = 0
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[:j - i] * gain


# ---------------------------------------------------------------- keysounds

def layered_drum(body, kn, click, plus=False):
    body = cut(hpf(body, 40), 220)
    n = max(len(body), len(kn))
    out = np.zeros(n + 2000)
    out[:len(body)] += body
    out[:len(kn)] += kn * 0.8
    c = hpf(click, 2000) * db(1 + (3 if plus else 0))
    out[:len(c)] += c[:len(out)] if len(c) <= len(out) else c[:len(out)]
    if plus:
        out = out * db(2) + hpf(out, 6000) * db(2)  # +2 dB and a 6 kHz air shelf
    return ceiling(fades(out[:int(SR * 0.26)], 1, 30), -1.5)


def build_keysounds():
    bass = load_takes('rh_bass_drum', (1, 3), hp=40)
    sticks = load_takes('rh_sticks')
    rims = load_takes('rh_rim')
    cym = load_takes('rh_cymbal')
    pop = master(decode(os.path.join(CHRIS, 'firework_pop.mp3')), 40)
    kn = knock(7)
    drum = layered_drum(bass[0], kn, sticks[0])
    drum_plus = layered_drum(bass[0], kn, sticks[0], plus=True)
    rim_buf = np.zeros(int(SR * 0.22))
    place(rim_buf, cut(rims[0], 200), 0, 1.0)
    place(rim_buf, hpf(sticks[1], 2000), 0, db(-8))
    rim = ceiling(fades(rim_buf, 1, 25), -1.5)
    rim_plus = ceiling(rim * db(2) + hpf(rim, 6000) * db(2), -1.5)
    crash = cut(cym[0], 900)
    flam = np.zeros(int(SR * 1.0))
    place(flam, drum, 0, db(-6))
    place(flam, drum, 25, 1.0)
    place(flam, crash, 25, db(-3))
    low = lpf1(cut(pop, 900), 220)
    place(flam, low, 25, db(-2))
    big = ceiling(fades(flam, 1, 120), -1.5)
    out = {
        'rh_drum_hit': drum, 'rh_drum_hit_plus': drum_plus, 'rh_rim_hit': rim, 'rh_rim_hit_plus': rim_plus,
        'rh_big_crash': big,
    }
    os.makedirs(SFX, exist_ok=True)
    report = {}
    for k, x in out.items():
        write_wav(os.path.join(SFX, f'{k}.wav'), x)
        report[k] = dict(ms=round(len(x) / SR * 1000), dbtp=round(true_peak(x), 2),
                         e150_300=round(float(band_energy(x, 150, 300)), 3), e2_5k=round(float(band_energy(x, 2000, 5000)), 3))
    return out, report


# ---------------------------------------------------------------- stems

def render(stage_id, fmt, keys):
    st = json.load(open(os.path.join(STAGES, f'{stage_id}.json')))
    f = st['formats'][fmt]
    beats = [u / 1000 for u in f['beatUs']]
    pre = f['preRollBars']
    nplay = f['playableBars']
    energy = f.get('barEnergy') or []
    d1 = f['charts']['1']
    d_all = f['charts'].get('2', d1)
    bed = decode(os.path.join(AUDIO, f['audio']), mono=False)
    n = len(bed) + SR
    acc = np.zeros(n)
    guide = np.zeros(n)
    fever = np.zeros(n)
    rng = np.random.default_rng(abs(hash(stage_id + fmt)) % (2 ** 32))

    bass = RoundRobin(load_takes('rh_bass_drum', (1, 3), hp=40), 1)
    snare = RoundRobin(load_takes('rh_snare'), 2)
    ghost = RoundRobin(load_takes('rh_snare_tap'), 3)
    sticks = RoundRobin(load_takes('rh_sticks'), 4)
    cym = RoundRobin(load_takes('rh_cymbal'), 5)
    tamb = RoundRobin(load_takes('rh_tamb'), 6)
    clap_src = os.path.expanduser('~/apps/tps-prime-time-audit/studio/audio/for-dustin/shared')
    claps = RoundRobin([master(decode(os.path.join(clap_src, f'sh_clap__v{v}.m4a'))) for v in (1, 2, 3)
                        if os.path.exists(os.path.join(clap_src, f'sh_clap__v{v}.m4a'))], 7)

    def bt(beat):
        """Time (ms) of a fractional beat index."""
        i = int(np.floor(beat))
        fr = beat - i
        if i + 1 >= len(beats):
            return beats[-1]
        return beats[i] + (beats[i + 1] - beats[i]) * fr

    def vel(bar):
        k = bar - pre
        e = energy[k] if 0 <= k < len(energy) else 0.6
        return db(-4 + 4 * e)

    def jitter():
        return float(rng.uniform(-3, 3))

    charted = {(r[1], r[2]) for r in d_all}
    drops = [pre + b for b in range(4, nplay, 4)]
    last_beat = (pre + nplay) * 4

    # Count-in: 4 stick clicks on the beats of pre-roll bar 2.
    for k in range(4):
        b = (pre - 1) * 4 + k
        place(acc, sticks.next(), bt(b) + jitter(), db(0 if k == 0 else -2))
    # Accompaniment over the playable bars.
    for b in range(pre * 4, last_beat):
        bar = b // 4
        pos = b % 4
        v = vel(bar)
        rest = any(b == d * 4 - 1 for d in drops)
        if rest:
            # Tenor fill into the drop line: four 16th snare taps, rising.
            for s in range(4):
                place(acc, ghost.next(), bt(b + s / 4) + jitter(), v * db(-9 + s * 2))
            continue
        if (b, 0) not in charted:
            place(acc, bass.next(), bt(b) + jitter(), v * (db(3) if pos == 0 else db(0)))
        # Snare backbeat on 2 and 4 when no note sits there; ghost 8ths elsewhere.
        if pos in (1, 3) and (b, 0) not in charted:
            place(acc, snare.next(), bt(b) + jitter(), v * db(-3))
        if (b, 2) not in charted:
            place(acc, ghost.next(), bt(b + 0.5) + jitter(), v * db(-9))
    for d in drops:
        place(acc, cym.next(), bt(d * 4), db(0))
    place(acc, cym.next(), bt(last_beat - 4), db(0))  # Finale BIG bar

    # Guide: every d1 note, exactly on time (no jitter).
    hits = RoundRobin([keys['rh_drum_hit']], 8)
    for r in d1:
        t = r[0]
        kind = r[3]
        if kind == BIG:
            place(guide, keys['rh_drum_hit'], t - 25, db(-6))
            place(guide, keys['rh_drum_hit'], t, 1.0)
        elif kind == RIM:
            place(guide, keys['rh_rim_hit'], t, 1.0)
        else:
            accent = db(3) if r[2] == 0 and r[1] % 4 == 0 else (db(-3) if r[2] else 1.0)
            place(guide, hits.next(), t, accent)

    # Fever layer: claps on 2 and 4, tambourine 8ths.
    for b in range(pre * 4, last_beat):
        if b % 4 in (1, 3):
            place(fever, claps.next(), bt(b), db(0))
        place(fever, tamb.next(), bt(b), db(-4))
        place(fever, tamb.next(), bt(b + 0.5), db(-8))

    bed_l = lufs(bed)
    out = {}
    for name, x, under in (('acc', acc, 4), ('guide', guide, 12), ('fever', fever, 6)):
        x = x[:len(bed)]
        # Two passes: match loudness, limit the transients, match again.
        for _ in range(2):
            l = lufs(x)
            if l is not None and bed_l is not None:
                x = x * db((bed_l - under) - l)
            x = limit(x, -3.5)
        out[name] = ceiling(x, -3.0)
    base = f'{stage_id}_{fmt}'
    encode_mp3(os.path.join(AUDIO, f'{base}_bed.mp3'), bed, 128)
    for name, x in out.items():
        encode_mp3(os.path.join(AUDIO, f'{base}_{name}.mp3'), x, 64)
    rep = dict(bed_lufs=bed_l)
    for name in out:
        dec = decode(os.path.join(AUDIO, f'{base}_{name}.mp3'))
        rep[name] = dict(lufs=lufs(dec), dbtp=round(true_peak(dec), 2), ms=round(len(dec) / SR * 1000))
    bd = decode(os.path.join(AUDIO, f'{base}_bed.mp3'), mono=False)
    rep['bed_ms'] = round(len(bd) / SR * 1000)
    rep['src_ms'] = round(len(bed) / SR * 1000)
    return rep


def main(ids):
    keys, krep = build_keysounds()
    report = {'keysounds': krep, 'stems': {}}
    for sid, fmt in LAUNCH:
        if ids and sid not in ids:
            continue
        report['stems'][f'{sid}_{fmt}'] = render(sid, fmt, keys)
        print(sid, fmt, json.dumps(report['stems'][f'{sid}_{fmt}']))
    print(json.dumps(krep, indent=1))
    with open(os.path.join(HERE, 'drumline_report.json'), 'w') as fh:
        json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
