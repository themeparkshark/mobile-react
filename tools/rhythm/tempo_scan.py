import sys, numpy as np
from analyze import *
from grid import comb_score
x = decode(sys.argv[1]); dur = len(x)/SR
fl = band_flux(stft_mag(x)); f = fl['kick'] + fl['snare']
fps = SR/HOP
res=[]
for bpm in np.arange(80, 150, 0.05):
    P = fps*60/bpm; n=int(dur*bpm/60)+1
    best=max((comb_score(f,P,ph,n),ph) for ph in np.arange(0,P,1.0))
    res.append((best[0],bpm,best[1]/fps))
res.sort(reverse=True)
seen=[]
for s,b,p in res:
    if all(abs(b-q)>1.0 for q in seen):
        seen.append(b); print(round(b,2), round(s,3), round(p*1000,1))
    if len(seen)>=8: break
