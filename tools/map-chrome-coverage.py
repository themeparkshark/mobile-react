"""Home map chrome budget: the share of the map area covered by map chrome in the resting state.

Capture the HomeCatchPreview harness twice on the same simulator (the map is frozen in both):
  EXPO_PUBLIC_HOME_CATCH_PREVIEW=1 EXPO_PUBLIC_HH3_EXP=still       -> full.png (+ Documents/map-chrome.json)
  EXPO_PUBLIC_HOME_CATCH_PREVIEW=1 EXPO_PUBLIC_HH3_EXP=still-bare  -> bare.png (every chrome view at opacity 0)
'still-peek' holds a tapped find's peek. The tab bar and the status HUD sit outside map-chrome.json's rect.
Usage: python3 tools/map-chrome-coverage.py full.png bare.png map-chrome.json out-mask.png  (budget: 10%)
"""
import sys, json
from PIL import Image, ImageChops, ImageFilter
full, bare, rectf, out = sys.argv[1:5]
a=Image.open(full).convert('RGB'); b=Image.open(bare).convert('RGB')
r=json.load(open(rectf)); k=a.width/r.get('screenW', 402)
box=(int(r['x']*k), int(r['y']*k), int((r['x']+r['w'])*k), int((r['y']+r['h'])*k))
d=ImageChops.difference(a.crop(box), b.crop(box)).convert('L').point(lambda v: 255 if v>18 else 0)
# Close small gaps (antialiased chrome edges), then drop isolated specks.
d=d.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
cov=sum(1 for v in d.getdata() if v)/ (d.width*d.height)
ov=a.copy(); red=Image.new('RGB',d.size,(255,40,90)); crop=ov.crop(box)
crop=Image.composite(Image.blend(crop,red,0.55),crop,d); ov.paste(crop,box)
ov.save(out); print(f'map chrome covers {cov*100:.1f}% of the map area ({d.width}x{d.height}px)')
sys.exit(0 if cov <= 0.10 else 1)
