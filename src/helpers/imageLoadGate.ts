/**
 * The one way into expo-image's Image.loadAsync (w5 cold-launch crash, Nov 19).
 *
 * expo-image 2.0 on iOS keeps the SDWebImageManager behind loadAsync in a
 * Swift `lazy var` on one shared ImageLoader, made on first use with no lock,
 * and runs every loadAsync on its own Swift task. When the first loads after a
 * launch start together (the Standings warm-up decodes several face layers at
 * once), two tasks can both make and store that manager, and the extra store
 * frees the one another task is still calling: EXC_BAD_ACCESS in objc_msgSend
 * from `closure #1 in ImageLoader.load(_:maxSize:)`, a few seconds after a
 * cold launch.
 *
 * So loads run one at a time until one has succeeded. A success means the
 * native side has made and stored its manager, and from then on it is only
 * read, so loads go straight through and callers keep their own limits
 * (faceLayers runs 4 at once). A failed load proves nothing (it can fail
 * before it reaches the manager), so the line stays single file until a load
 * works. Native code cannot change in an OTA: nothing else in src/ may call
 * loadAsync or expo-image's useImage (tools/tests/image-load-gate.test.cjs).
 */
import { Image as ExpoImage, type ImageLoadOptions, type ImageRef, type ImageSource } from 'expo-image';

let warm = false;
let busy = false;
const waiting: (() => void)[] = [];

function call(source: ImageSource | string, options?: ImageLoadOptions): Promise<ImageRef> {
  // A sync throw becomes a rejection, so the line always moves on.
  return new Promise<ImageRef>(resolve => resolve(ExpoImage.loadAsync(source, options)));
}

function moveOn(): void {
  busy = false;
  if (warm) waiting.splice(0).forEach(go => go());
  else waiting.shift()?.();
}

/** Image.loadAsync, safe from the first call after a cold launch. */
export function loadImageRef(source: ImageSource | string, options?: ImageLoadOptions): Promise<ImageRef> {
  if (warm) return call(source, options);
  return new Promise<ImageRef>((resolve, reject) => {
    const go = (): void => {
      if (warm) { call(source, options).then(resolve, reject); return; }
      busy = true;
      call(source, options).then(
        ref => { warm = true; resolve(ref); moveOn(); },
        error => { reject(error); moveOn(); },
      );
    };
    if (busy) waiting.push(go); else go();
  });
}
