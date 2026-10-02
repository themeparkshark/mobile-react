import sys, numpy as np
from PIL import Image, ImageDraw
from analyze import *
path, t0, t1, bpm, ph, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
x = decode(path); fl = band_flux(stft_mag(x)); fps = SR/HOP
W, H = 1800, 700
im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
bands = ['kick', 'snare', 'crash', 'all']
cols = [(200,40,40),(40,120,200),(200,150,0),(60,60,60)]
for bi,(b,c) in enumerate(zip(bands,cols)):
    y0 = bi*H/4 + H/4 - 10
    f = fl[b]
    for i in range(int(t0*fps), int(t1*fps)):
        xx = (i/fps - t0)/(t1-t0)*W
        v = min(1.5, f[i])/1.5*(H/4-20)
        d.line([(xx,y0),(xx,y0-v)], fill=c)
    d.text((5, bi*H/4+2), b, fill=c)
P = 60/bpm; k = 0
t = ph
while t < t1:
    if t >= t0:
        xx = (t-t0)/(t1-t0)*W
        d.line([(xx,0),(xx,H)], fill=(0,180,0) if k%4==0 else (170,230,170), width=2 if k%4==0 else 1)
        d.text((xx+2, H-12), str(k), fill=(0,120,0))
    t += P; k += 1
im.save(out)
