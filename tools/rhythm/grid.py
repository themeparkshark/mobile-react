import sys, numpy as np
from analyze import *

def comb_score(f, period_frames, phase_frames, n_beats):
    t = phase_frames + period_frames * np.arange(n_beats)
    t = t[t < len(f) - 2]
    i = np.floor(t).astype(int); fr = t - i
    # take max in +/-1 frame to tolerate small jitter
    v = np.maximum.reduce([f[np.clip(i + d, 0, len(f) - 1)] for d in (-1, 0, 1, 2)])
    return v.mean()

def best_grid(f, dur, bpm_lo, bpm_hi):
    fps = SR / HOP
    best = (0, 0, 0)
    for bpm in np.arange(bpm_lo, bpm_hi, 0.02):
        P = fps * 60 / bpm
        n = int(dur * bpm / 60) + 1
        for ph in np.arange(0, P, 0.5):
            s = comb_score(f, P, ph, n)
            if s > best[0]:
                best = (s, bpm, ph / fps)
    return best

if __name__ == '__main__':
    x = decode(sys.argv[1]); dur = len(x) / SR
    fl = band_flux(stft_mag(x))
    f = fl['kick'] + fl['snare']
    lo, hi = float(sys.argv[2]), float(sys.argv[3])
    s, bpm, ph = best_grid(f, dur, lo, hi)
    print('dur', dur, 'best bpm', round(bpm, 3), 'phase', round(ph * 1000, 1), 'score', round(s, 3), 'beats in file', dur * bpm / 60)
