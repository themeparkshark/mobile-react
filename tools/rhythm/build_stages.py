"""Parade Beat stage builder (design rhythm.md 7.3-7.5).

For every stage:
  1. Beat map of Chris's full source track: a global constant-tempo comb fit,
     then a per-beat local phase correction (sliding 4-beat comb, median
     smoothed) so the map follows the real recording.
  2. Cut a window on beat-map bar lines: 2 pre-roll bars, N playable bars,
     2 outro bars. Count-in sticks are mixed onto pre-roll bar 2. 30 ms fade
     in, outro fade, one gain to -16 LUFS with a -1.5 dBTP limiter.
  3. A Fever mix of the same window (song + claps on 2 and 4, tambourine
     8ths, crash every 4 bars, 6 LU under), sample-locked by construction,
     so the game can crossfade between the two files on a bar line.
  4. Re-decode the exported m4a and measure band onsets on it (so AAC
     priming and the edit list are already in the timeline).
  5. Write stage JSON: beatTimesUs, barEnergy, sections, per-band onset
     candidates on the 16th grid (each with its exact onset time). Charts are
     authored from those candidates by author_charts.py.

Run:  python3 tools/rhythm/build_stages.py [stage ...]
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from analyze import SR, HOP, decode, stft_mag, band_flux, peaks
from grid import comb_score

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
AUDIO_LIB = '/Users/dustinsparage/apps/tps-mg/audio'
OUT_AUDIO = os.path.join(ROOT, 'src/games/rhythm/audio')
OUT_STAGES = os.path.join(ROOT, 'src/games/rhythm/stages')
FPS = SR / HOP

# key: file id; track: Chris source; bpm search range; downbeat phase override;
# windows: format -> first pre-roll bar (in source bars) and playable bar count.
STAGES = {
    'opening_day_a': dict(title='Opening Day', track='track-1.mp3', bpm=(127, 133), key='C major',
                          windows={'queue': (12, 24), 'ride': (24, 12)}),
    'waiting_room_a': dict(title='Waiting Room', track='track-2.mp3', bpm=(134, 138), key='C major',
                           windows={'queue': (17, 24), 'ride': (27, 12)}),
    'shark_shop_a': dict(title='Shark Shop', track='track-3.mp3', bpm=(134, 138), key='E minor',
                         windows={'queue': (16, 24)}),
    'backpack_bounce_a': dict(title='Backpack Bounce', track='inventory.mp3', bpm=(114, 120), key='F major',
                              windows={'queue': (30, 24)}),
}


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def global_grid(f, dur, lo, hi):
    best = (0, 0, 0)
    for bpm in np.arange(lo, hi, 0.01):
        P = FPS * 60 / bpm
        n = int(dur * bpm / 60) + 1
        for ph in np.arange(0, P, 0.5):
            s = comb_score(f, P, ph, n)
            if s > best[0]:
                best = (s, bpm, ph)
    return best[1], best[2] / FPS


def local_beats(f, bpm, t0, dur):
    """Per-beat times: global grid + smoothed local phase (max +/-12 ms)."""
    P = 60 / bpm
    n = int((dur - t0) / P)
    grid = t0 + P * np.arange(n)
    shifts = np.zeros(n)
    for k in range(n):
        best = (-1, 0.0)
        for d in np.arange(-0.012, 0.0121, 0.0005):
            s = 0.0
            for j in range(max(0, k - 4), min(n, k + 5)):
                i = (grid[j] + d) * FPS
                i0 = int(i)
                if i0 + 1 >= len(f):
                    continue
                s += max(f[i0], f[i0 + 1])
            if s > best[0]:
                best = (s, d)
        shifts[k] = best[1]
    sm = np.array([np.median(shifts[max(0, k - 4):k + 5]) for k in range(n)])
    return grid + sm


def downbeat_phase(fl, beats):
    acc = np.zeros(4)
    for k, b in enumerate(beats):
        i = int(b * FPS)
        acc[k % 4] += fl['crash'][max(0, i - 2):i + 3].max() + fl['kick'][max(0, i - 2):i + 3].max() + fl['all'][max(0, i - 2):i + 3].max()
    return int(np.argmax(acc))


def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    for line in reversed(r.splitlines()):
        if line.strip().startswith('I:'):
            return float(line.split()[1])
    raise RuntimeError('no lufs')


def load_shot(rel):
    return decode(os.path.join(AUDIO_LIB, rel))


def place(buf, shot, t, gain):
    i = int(round(t * SR))
    if i < 0 or i >= len(buf):
        return
    e = min(len(buf), i + len(shot))
    buf[i:e] += shot[:e - i] * gain


def write_m4a(mono_or_stereo, path, bitrate='128k'):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav = tmp.name
    data = mono_or_stereo.astype(np.float32)
    ch = 1 if data.ndim == 1 else data.shape[1]
    raw = data.tobytes()
    p = subprocess.run(['ffmpeg', '-y', '-v', 'quiet', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-', wav],
                       input=raw, check=True)
    run(['ffmpeg', '-y', '-v', 'quiet', '-i', wav, '-af', 'alimiter=limit=0.84:level=false',
         '-c:a', 'aac', '-b:a', bitrate, '-ar', str(SR), path])
    os.unlink(wav)


def decode_stereo(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def build(stage_id, cfg):
    src = os.path.join(ROOT, 'assets/music', cfg['track'])
    x = decode(src)
    dur = len(x) / SR
    fl = band_flux(stft_mag(x))
    f = fl['kick'] + fl['snare'] + fl['crash']
    bpm, t0 = global_grid(f, dur, *cfg['bpm'])
    beats = local_beats(f, bpm, t0, dur)
    dp = downbeat_phase(fl, beats)
    print(f'{stage_id}: bpm {bpm:.3f} t0 {t0*1000:.1f}ms downbeat phase {dp} beats {len(beats)}')
    stereo = decode_stereo(src)
    sticks = load_shot('rhythm/rh_sticks.m4a')
    clap = load_shot('shared/sh_clap.m4a')
    tamb = load_shot('rhythm/rh_tamb.m4a')
    crash = load_shot('rhythm/rh_cymbal.m4a')
    out = {}
    for fmt, (bar0, nplay) in cfg['windows'].items():
        nbars = 2 + nplay + 2
        b0 = dp + 4 * bar0
        b_end = b0 + 4 * nbars
        if b_end + 1 >= len(beats):
            raise RuntimeError(f'{stage_id}/{fmt}: window past the end')
        lead = 0.060
        start = beats[b0] - lead
        end = beats[b_end] + 0.25
        a, e = int(round(start * SR)), int(round(end * SR))
        song = stereo[a:e].copy()
        win_beats = beats[b0:b_end + 1] - start  # file time of each beat
        # count-in sticks on the 4 beats of pre-roll bar 2
        stick_track = np.zeros(len(song), np.float32)
        for k in range(4, 8):
            place(stick_track, sticks, win_beats[k], 0.9 if k == 4 else 0.7)
        song += stick_track[:, None]
        # fades
        fi = int(0.03 * SR)
        song[:fi] *= np.linspace(0, 1, fi)[:, None]
        fo_start = int((win_beats[4 * (2 + nplay)] + 0.05) * SR)  # after the last playable bar's end
        fo = len(song) - fo_start
        if fo > 0:
            song[fo_start:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
        # fever layer on the playable bars only
        layer = np.zeros(len(song), np.float32)
        for k in range(8, 4 * (2 + nplay)):
            beat_in_bar = k % 4
            t = win_beats[k]
            if beat_in_bar in (1, 3):
                place(layer, clap, t, 1.0)
            place(layer, tamb, t, 0.45)
            place(layer, tamb, (t + win_beats[k + 1]) / 2, 0.3)
            if beat_in_bar == 0 and ((k // 4) - 2) % 4 == 0:
                place(layer, crash, t, 0.6)
        base = os.path.join(OUT_AUDIO, f'{stage_id}_{fmt}')
        os.makedirs(OUT_AUDIO, exist_ok=True)
        # loudness: measure song once, apply the same gain to both mixes
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            probe = tmp.name
        subprocess.run(['ffmpeg', '-y', '-v', 'quiet', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', probe],
                       input=song.astype(np.float32).tobytes(), check=True)
        L = lufs(probe)
        os.unlink(probe)
        g = 10 ** ((-16.0 - L) / 20)
        # Fever layer sits about 6 LU under the song
        lay_rms = np.sqrt(np.mean(layer ** 2)) + 1e-9
        song_rms = np.sqrt(np.mean(song ** 2)) + 1e-9
        lay_gain = song_rms / lay_rms * 10 ** (-6 / 20)
        write_m4a(song * g, base + '.m4a')
        write_m4a((song + layer[:, None] * lay_gain) * g, base + '_fever.m4a')
        # measure on the exported file
        y = decode(base + '.m4a')
        yfl = band_flux(stft_mag(y))
        # align: exported beats = window beats + lag (AAC priming normally 0 after edit list)
        lag = find_lag(song.mean(axis=1) * g, y)
        wb = win_beats + lag
        cands = candidates(yfl, wb)
        energy = []
        for bi in range(nbars):
            s0, s1 = int(wb[4 * bi] * SR), int(wb[4 * bi + 4] * SR)
            energy.append(float(20 * np.log10(np.sqrt(np.mean(y[s0:s1] ** 2)) + 1e-9)))
        emin, emax = min(energy[2:2 + nplay]), max(energy[2:2 + nplay])
        bar_energy = [round((e_ - emin) / max(1e-6, emax - emin), 3) for e_ in energy]
        # residual of beat map to strong percussive onsets (design gate: 5 ms)
        onset_all = peaks(yfl['kick'] + yfl['snare'], 0.6)
        res = []
        for t in wb:
            near = [abs(ot - t) for ot, _ in onset_all if abs(ot - t) <= 0.015]
            if near:
                res.append(min(near) * 1000)
        out[fmt] = dict(
            audio=f'{stage_id}_{fmt}.m4a', fever=f'{stage_id}_{fmt}_fever.m4a',
            source=cfg['track'], sourceStartS=round(start, 4), aacLagMs=round(lag * 1000, 2),
            preRollBars=2, playableBars=nplay, outroBars=2,
            beatTimesUs=[int(round(t * 1e6)) for t in wb],
            barEnergy=bar_energy,
            durationMs=int(len(y) / SR * 1000),
            residualMs=dict(n=len(res), p50=round(float(np.median(res)), 2) if res else None,
                            p95=round(float(np.percentile(res, 95)), 2) if res else None,
                            max=round(float(max(res)), 2) if res else None),
            candidates=cands,
        )
        print(f'  {fmt}: {nbars} bars, {len(y)/SR:.2f}s, lufs {L:.1f} -> -16, lag {lag*1000:.2f}ms, '
              f'residual p50 {out[fmt]["residualMs"]["p50"]} p95 {out[fmt]["residualMs"]["p95"]} n {len(res)}')
    return dict(id=stage_id, title=cfg['title'], key=cfg['key'], bpm=round(bpm, 3), formats=out)


def find_lag(ref, y):
    n = min(len(ref), len(y), SR * 6)
    a = ref[SR:SR + n // 2]
    best = (-1e9, 0)
    for lag in range(-3000, 3001, 1):
        s0 = SR + lag
        if s0 < 0:
            continue
        b = y[s0:s0 + len(a)]
        if len(b) < len(a):
            continue
        c = float(np.dot(a, b))
        if c > best[0]:
            best = (c, lag)
    return best[1] / SR


def strength_near(fcurve, t, win=0.015):
    i0, i1 = int((t - win) * FPS), int((t + win) * FPS) + 1
    i0 = max(0, i0)
    seg = fcurve[i0:i1]
    if len(seg) == 0:
        return 0.0, t
    j = int(np.argmax(seg))
    return float(seg[j]), (i0 + j) / FPS


def candidates(fl, wb):
    """16th-grid slots with band strengths and the exact onset time (ms)."""
    out = []
    comb = fl['kick'] + fl['snare'] + fl['crash']
    for k in range(len(wb) - 1):
        for s in range(4):
            t = wb[k] + (wb[k + 1] - wb[k]) * s / 4
            a, ta = strength_near(fl['all'], t)
            kk, _ = strength_near(fl['kick'], t)
            sn, _ = strength_near(fl['snare'], t)
            cr, _ = strength_near(fl['crash'], t)
            c, tc = strength_near(comb, t)
            # crash sustain: high-band energy 150 ms after vs before
            i = int(t * FPS)
            he = fl['hi_energy']
            sus = float(np.mean(he[i + 5:i + 50]) - np.mean(he[max(0, i - 30):max(1, i - 3)])) if i > 30 and i + 50 < len(he) else 0.0
            if max(a, c) < 0.12:
                continue
            onset = tc if c >= a else ta
            out.append([k, s, int(round(onset * 1000)), round(a, 3), round(kk, 3), round(sn, 3), round(cr, 3), round(sus, 3)])
    return out


if __name__ == '__main__':
    ids = sys.argv[1:] or list(STAGES)
    os.makedirs(OUT_STAGES, exist_ok=True)
    for sid in ids:
        data = build(sid, STAGES[sid])
        os.makedirs(os.path.join(HERE, 'analysis'), exist_ok=True)
        with open(os.path.join(HERE, 'analysis', f'{sid}.json'), 'w') as fh:
            json.dump(data, fh, separators=(',', ':'))
