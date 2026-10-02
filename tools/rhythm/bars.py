import sys, numpy as np
from analyze import *
from grid import comb_score
path=sys.argv[1]; lo,hi=float(sys.argv[2]),float(sys.argv[3])
x=decode(path); dur=len(x)/SR
fl=band_flux(stft_mag(x)); f=fl['kick']+fl['snare']+fl['crash']; fps=SR/HOP
best=(0,0,0)
for bpm in np.arange(lo,hi,0.01):
    P=fps*60/bpm; n=int(dur*bpm/60)+1
    for ph in np.arange(0,P,0.5):
        s=comb_score(f,P,ph,n)
        if s>best[0]: best=(s,bpm,ph)
s,bpm,ph=best; Pb=60/bpm; t0=ph/fps
nb=int((dur-t0)/Pb)
beats=t0+Pb*np.arange(nb)
# downbeat phase by crash+all accent
acc=np.zeros(4)
for k,b in enumerate(beats):
    i=int(b*fps); acc[k%4]+=fl['crash'][max(0,i-2):i+3].max()+fl['all'][max(0,i-2):i+3].max()
dp=int(np.argmax(acc)); print('bpm',round(bpm,3),'t0',round(t0,4),'downbeat phase',dp, acc.round(1))
bars=[]
for b in range(dp, nb-4, 4):
    a=int(beats[b]*SR); e=int(beats[b+4]*SR)
    rms=20*np.log10(np.sqrt(np.mean(x[a:e]**2))+1e-9)
    bars.append((beats[b], rms))
line=''
for i,(t,r) in enumerate(bars):
    line+=f'{i:3d}:{t:6.2f}s {r:5.1f}dB  '
    if i%6==5: print(line); line=''
print(line)
