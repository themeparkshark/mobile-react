import sys, numpy as np
from analyze import *
from grid import comb_score
x = decode(sys.argv[1]); dur=len(x)/SR
fl = band_flux(stft_mag(x)); f = fl['kick']+fl['snare']+fl['crash']
fps=SR/HOP
# global
best=(0,0,0)
lo,hi=float(sys.argv[2]),float(sys.argv[3])
for bpm in np.arange(lo,hi,0.01):
    P=fps*60/bpm; n=int(dur*bpm/60)+1
    for ph in np.arange(0,P,0.5):
        s=comb_score(f,P,ph,n)
        if s>best[0]: best=(s,bpm,ph)
s,bpm,ph=best; P=fps*60/bpm
print('global bpm',round(bpm,3),'phase ms',round(ph/fps*1000,1),'score',round(s,3), 'dur', round(dur,2))
# local residual per 10s window: best phase offset within +/-40ms
for w0 in np.arange(0,dur-10,10):
    i0=int(w0*fps); seg=f[i0:i0+int(10*fps)]
    k0=int(np.ceil((i0-ph)/P)); first=ph+k0*P-i0
    sc=[(comb_score(seg,P,first+d,int(10*bpm/60)),d) for d in np.arange(-14,14.5,0.5)]
    m=max(sc)
    print(f'{w0:5.0f}s shift {m[1]/fps*1000:+6.1f}ms score {m[0]:.3f}')
