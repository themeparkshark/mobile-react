#!/usr/bin/env node
/**
 * Native fix for @maplibre/maplibre-react-native 10.4.2 on iOS: map markers
 * (MarkerView is an MLRNPointAnnotation on iOS) blink to the map's top-left
 * corner.
 *
 * MapLibre owns a marker once it is on the map: it moves the view into its
 * annotation container and places it by `center` on every map frame. Under the
 * new architecture's legacy interop, React still holds the same view as the
 * content view of its component and, on every layout pass that touches it
 * (RCTViewComponentView updateLayoutMetrics / setContentView), writes
 * `frame = (0, 0, w, h)`. Inside MapLibre's container that origin is the map's
 * top-left corner, so the shark (and any marker whose content changed size)
 * sat there until the next map frame put it back: the "hop" players saw.
 *
 * The patch gives MLRNPointAnnotation a setFrame: that, while MapLibre owns the
 * view, takes only the new size from React, recomputes the anchor offset for
 * that size and keeps the view exactly where MapLibre put it. Before the view
 * is on the map (and in the Paper reactSetFrame path, which removes it first)
 * the frame applies as before.
 *
 * Idempotent. Runs from postinstall, before `pod install` / a native build.
 *
 *   node tools/maplibre/patch-marker-frame.mjs            # patch
 *   node tools/maplibre/patch-marker-frame.mjs --check    # exit 1 if unpatched
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'node_modules/@maplibre/maplibre-react-native/ios/MLRN/MLRNPointAnnotation.m');
if (!fs.existsSync(file)) {
  console.log('maplibre-react-native not installed; nothing to patch');
  process.exit(0);
}
const MARK = 'TPS marker-frame patch';
const src = fs.readFileSync(file, 'utf8');
const patched = src.includes(MARK);

if (process.argv.includes('--check')) {
  console.log(patched ? 'maplibre marker frame: patched' : 'maplibre marker frame: UNPATCHED');
  process.exit(patched ? 0 : 1);
}
if (patched) {
  console.log('maplibre marker frame: already patched');
  process.exit(0);
}

const anchor = '- (void)reactSetFrame:(CGRect)frame {';
if (!src.includes(anchor)) {
  console.error('maplibre marker frame: MLRNPointAnnotation.m changed upstream, patch not applied');
  process.exit(1);
}

const method = `// ${MARK} (tools/maplibre/patch-marker-frame.mjs): once MapLibre owns this
// view it places it by center each map frame. A React layout pass writes the
// Yoga frame (origin 0,0 = the map's top-left corner); take only its size and
// keep the view where MapLibre put it, so markers never blink to the corner.
// Ownership is a flag set where this class adds and removes itself (no scan of
// the map's annotation list on every layout pass).
- (void)setFrame:(CGRect)frame {
  if (!_tpsOnMap || self.superview == nil || _map == nil) {
    [super setFrame:frame];
    return;
  }
  CGRect bounds = self.bounds;
  if (CGSizeEqualToSize(bounds.size, frame.size)) {
    return;
  }
  CGPoint position = self.layer.position;
  CGVector oldOffset = self.centerOffset;
  bounds.size = frame.size;
  [super setBounds:bounds];
  [self _setCenterOffset:CGRectMake(0, 0, frame.size.width, frame.size.height)];
  CGVector newOffset = self.centerOffset;
  self.layer.position = CGPointMake(position.x - oldOffset.dx + newOffset.dx,
                                    position.y - oldOffset.dy + newOffset.dy);
}

`;
const edits = [
  // the ownership flag
  ['  UITapGestureRecognizer *customViewTap;\n}', '  UITapGestureRecognizer *customViewTap;\n  BOOL _tpsOnMap;\n}'],
  // removed before React re-applies a frame (Paper path)
  ['  if ([_map.annotations containsObject:self]) {\n    [_map removeAnnotation:self];\n  }\n  [super reactSetFrame:frame];',
   '  if ([_map.annotations containsObject:self]) {\n    [_map removeAnnotation:self];\n  }\n  _tpsOnMap = NO;\n  [super reactSetFrame:frame];'],
  // removed when the map goes away
  ['  if (map == nil) {\n    [_map removeAnnotation:self];', '  if (map == nil) {\n    _tpsOnMap = NO;\n    [_map removeAnnotation:self];'],
  // added
  ['  [_map addAnnotation:self];\n', '  [_map addAnnotation:self];\n  _tpsOnMap = YES;\n'],
];
let out = src.replace(anchor, method + anchor);
for (const [from, to] of edits) {
  if (!out.includes(from)) {
    console.error('maplibre marker frame: MLRNPointAnnotation.m changed upstream (' + from.split('\n')[0].trim() + '), patch not applied');
    process.exit(1);
  }
  out = out.replace(from, to);
}
fs.writeFileSync(file, out);
console.log('maplibre marker frame: patched (rebuild the native app)');
