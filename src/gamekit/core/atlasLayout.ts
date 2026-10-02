/**
 * atlasLayout: pack a list of sprite frames into a fixed-cell atlas grid.
 * Pure (no Skia) so the layout is node-tested; fx/SpriteAtlas.ts draws it.
 *
 * Every frame gets a square cell (aspect-fit inside, centred on its base or
 * its middle) so an RSXform per sprite and one <Atlas> draw call cover a whole
 * game: Whack's per-theme sheet (holes, lips, Finn poses, splats) plus the
 * shared FX atlas, about 7-9 draw calls per frame.
 */

export interface AtlasFrameSpec {
  /** Source size in px. */
  w: number;
  h: number;
  /** 'base' keeps feet on the cell floor (characters); 'center' for FX. */
  anchor?: 'base' | 'center';
}

export interface AtlasCellPlacement {
  index: number;
  /** Cell rect in the atlas. */
  cellX: number;
  cellY: number;
  /** Where the frame is drawn inside the atlas (aspect-fit). */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Scale from source px to atlas px. */
  scale: number;
}

export interface AtlasLayout {
  cell: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  cells: AtlasCellPlacement[];
  /** Bytes of the RGBA texture (memory budget checks). */
  bytes: number;
}

/**
 * Lay out `frames` on a grid of `cell` px cells, at most `maxSize` px wide.
 * Throws when the frames cannot fit inside maxSize x maxSize.
 */
export function layoutAtlas(frames: readonly AtlasFrameSpec[], cell = 256, maxSize = 2048, pad = 4): AtlasLayout {
  const cols = Math.max(1, Math.min(frames.length, Math.floor(maxSize / cell)));
  const rows = Math.max(1, Math.ceil(frames.length / cols));
  const width = cols * cell;
  const height = rows * cell;
  if (height > maxSize) throw new Error(`layoutAtlas: ${frames.length} frames of ${cell}px exceed ${maxSize}px`);
  const box = cell - pad * 2;
  const cells: AtlasCellPlacement[] = frames.map((f, index) => {
    const cellX = (index % cols) * cell;
    const cellY = Math.floor(index / cols) * cell;
    const scale = Math.min(box / Math.max(1, f.w), box / Math.max(1, f.h));
    const dw = f.w * scale;
    const dh = f.h * scale;
    const dx = cellX + (cell - dw) / 2;
    const dy = f.anchor === 'base' ? cellY + cell - pad - dh : cellY + (cell - dh) / 2;
    return { index, cellX, cellY, dx, dy, dw, dh, scale };
  });
  return { cell, cols, rows, width, height, cells, bytes: width * height * 4 };
}
