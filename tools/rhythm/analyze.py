"""Band onset analysis for Parade Beat stages (numpy only).

decode(path) -> mono float32 @ 44.1k
flux(x) -> dict of band onset-strength curves at hop 128 (2.9 ms)
"""
import json, subprocess, sys
import numpy as np

SR = 44100
HOP = 128
NFFT = 2048

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

def stft_mag(x):
    win = np.hanning(NFFT).astype(np.float32)
    pad = np.concatenate([np.zeros(NFFT // 2, np.float32), x, np.zeros(NFFT, np.float32)])
    n = (len(pad) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    frames = pad[idx] * win
    return np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)

BANDS = {
    'kick': (35, 150),
    'snare': (180, 2500),
    'hat': (6000, 16000),
    'crash': (4000, 12000),
    'all': (35, 16000),
}

def band_flux(mag):
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    lm = np.log1p(mag * 50)
    d = np.diff(lm, axis=0, prepend=lm[:1])
    d[d < 0] = 0
    out = {}
    for name, (lo, hi) in BANDS.items():
        sel = (freqs >= lo) & (freqs < hi)
        f = d[:, sel].sum(axis=1)
        # local mean subtraction (adaptive threshold)
        k = 31
        ker = np.ones(k) / k
        base = np.convolve(f, ker, mode='same')
        f = np.maximum(0, f - base)
        out[name] = f / (np.percentile(f, 99.5) + 1e-9)
    # crash sustain: high band energy (not flux), for decay detection
    sel = (freqs >= 4000) & (freqs < 12000)
    e = np.log1p(mag[:, sel].sum(axis=1))
    out['hi_energy'] = e
    return out

def frame_time(i):
    return i * HOP / SR

def peaks(f, thr=0.25, min_gap_s=0.06):
    n = len(f)
    res = []
    last = -1e9
    for i in range(1, n - 1):
        if f[i] >= thr and f[i] >= f[i - 1] and f[i] > f[i + 1]:
            t = frame_time(i)
            # parabolic refinement
            a, b, c = f[i - 1], f[i], f[i + 1]
            den = a - 2 * b + c
            off = 0.5 * (a - c) / den if den != 0 else 0.0
            t = frame_time(i + off)
            if t - last >= min_gap_s:
                res.append((t, float(b)))
                last = t
            elif b > res[-1][1]:
                res[-1] = (t, float(b))
                last = t
    return res

if __name__ == '__main__':
    x = decode(sys.argv[1])
    fl = band_flux(stft_mag(x))
    for k in ('kick', 'snare', 'crash'):
        p = peaks(fl[k], 0.3)
        print(k, len(p), [round(t, 3) for t, _ in p[:24]])
