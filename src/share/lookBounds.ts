/**
 * How far a dressed shark's paint reaches across its 1353x1530 paper, so a share card can keep the
 * prize readable when a costume is wider than the shark (a ghost sheet, a blaster, a tall hat).
 *
 * The bare shark's body runs from about 0.18 to 0.82 of the paper's width. WIDE_PAPERS lists every
 * outfit paper in the catalog whose paint goes past that (measured from the alpha channel of each
 * production paper, 345 papers, Oct 24 2026), keyed by the paper's file name, as [left, right].
 * A paper not in the table stays inside the body box.
 */
import type { InventoryType } from '../models/inventory-type';

export interface LookExtent {
  /** Fraction of the paper width where the paint starts (the shark faces left, so this is its front). */
  readonly left: number;
  /** Fraction of the paper width where the paint ends (the tail side). */
  readonly right: number;
}

/** The bare shark's painted body. */
export const BODY_EXTENT: LookExtent = { left: 0.18, right: 0.82 };

const OUTFIT_SLOTS = ['head_item', 'face_item', 'neck_item', 'body_item', 'hand_item'] as const;

/** Outfit papers wider than the shark's body: file name (no extension) to [left, right]. */
export const WIDE_PAPERS: Readonly<Record<string, readonly [number, number]>> = {
  '0IUlLzo22YNsmSHGPNQNjS43YJQ56x2p4dnuRJdA': [0.366, 0.885], // neck 436
  '19FLamfxjjjRrUNSxohS3hMcOGccMekS2KKHrsWt': [0.395, 0.95], // head 244
  '1DehfWwwSTUDxawtILkt4DocWKKGtaGm7JHExVcC': [0.496, 0.857], // head 135
  '2IPHn8UVfl5hHN2wdayZWq8ZiqZTEmKwnMv5pkIn': [0.156, 0.897], // hand 434
  '2hzgzD86xy4xPlG30LY9FeDCXvvueWJ82wdxC9R6': [0.327, 0.853], // head 448
  '3vguD9GEoKqr4Dt1eVP28haKEjmVVpNWmWPzaFzp': [0.179, 0.911], // face 402
  '4sIodvlyZzuuhrKUvglAfTO3jzRT7FU1EOjizU4e': [0.356, 0.941], // neck 18
  '4xw0yG0LO76svPjl3kOltuB5XaIcvaxRTdAFRzF3': [0.161, 0.693], // face 479
  '6OTrBT6EnWPFmGm06dr3Vd8ewO2SYVKg9L33WqTE': [0.496, 0.857], // head 133
  '6QWB9apQxlcBSMOgoP442OjZ0qFIOahjC8WN9Ddf': [0.51, 0.885], // head 104
  '8iGD3CvAc2WXmXbEv9FL9HVCpyKbmGxC89KtB1H5': [0.137, 0.376], // hand 74
  'AoRACIazb9N9Rdr3waXB8ZJ7EQmJk3Kc8e2i2BIe': [0.395, 0.95], // head 423
  'CRMth7Z94OzbTM6YEOAVHgUmmvu4rPrQJdZVS8yx': [0.012, 0.542], // hand 75
  'E5dmh1RByEYNrnCVi9b52iy6iEumiV82IQJGf6s7': [0.496, 0.857], // head 137
  'GVIpbvGgBNB7ZkYgdVaQQf0pK16yM95gDAv9x1Ze': [0.588, 0.844], // head 95
  'HDGM1Sd9VkFCtdlshZs4IfDZDfxcf0khIAQwUZrg': [0.372, 0.84], // head 386
  'I6Gd94RVUs8uzrmo91aexUFypJXVpgAVJwJUSo0I': [0.496, 0.857], // head 166
  'IRJvNAUI97PgAZ7QPU5QxzBZVcnkCPu4JIYKpM5o': [0.356, 0.941], // neck 29
  'KJkDn8jk61FTzPfeHRUaXdbHT14RVtAjMB8v4wy7': [0.595, 0.886], // neck 488
  'OYZIszU1ip2sIk4nW0oIbUFwtLxUu1iJzi6WaHE5': [0.591, 0.851], // neck 195
  'Q1MGeAyk7ABhYms13CeFo4fAuFKD3xyB4hrBii5U': [0.597, 0.84], // neck 196
  'RMElpcOng7v00E812A0VzaIEno6SlbAHrX4bQEbZ': [0.141, 0.356], // hand 335
  'UODJP2zJX90amLw2lPMVMqqWrMBUxEyZJ8uqqycL': [0.227, 0.888], // hand 110
  'UPU96KLjYTfRa5ai1beJPjZX5LnTF4dWVbio02ID': [0.137, 0.376], // hand 202
  'VihndcrvrkW4wsINDWiVpgAL01NMC6F4NXaBUFCA': [0.16, 0.353], // hand 211
  'YHywBH0MroLhrwRyTksdTCwpcl67ckhawMsodhKD': [0.597, 0.84], // neck 194
  'hehnPBDoBfejfpwmiFe4T5AcMKy03hHP5E7c64G6': [0.529, 0.852], // head 169
  'jAv0aAMv5lwuuAfDsaI5M1vn1r4pxtUjGNc2eNrq': [0.597, 0.84], // neck 197
  'jcXXdKAG3v202YvzY7gZ0MO7lXaCnSGVLuHjt01C': [0.588, 0.844], // head 180
  'jsTsDVPERhc55gJxxfiSa4DkbGEnYzj1YxX2g31I': [0.496, 0.857], // head 134
  'nFlGTZSg8XmLxVMz8YWk3x6u9CFuqh12UvlIc5NR': [0.51, 0.884], // head 171
  'nGhMy5ZE6wvIxNwCRgIeWoAz2DzyzW13StFqvZH5': [0.496, 0.857], // head 136
  'nq5VUG1MmYBYoGGTCoL4tYpE8lSfOnjQwO3QOKKz': [0.496, 0.857], // head 144
  'omBnJ5M2Pfa42EzEiemBX0NIGBsn131xWywP0R3T': [0.51, 0.885], // head 118
  'ouB7kwkuXjoPCVcjZuTAi3lyxgCBjXaOrUHof2Vu': [0.51, 0.885], // head 103
  'p0m3AkaQek5ofVKN9AMcWvCeXXo9XB9SAgX6ZqxL': [0.156, 0.729], // head 388
  'qMRkHPri8hGLf5EDUqXzyOmA28pNRtPJVSy77qdM': [0.395, 0.95], // head 94
  'sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO': [0.0, 0.761], // body 219
  'tO0p0qr4ACOcB1o4CdKesDI9ftwKVyH6giZ7lByD': [0.147, 0.72], // hand 441
  'ukMvMpIazbp2bIhPX2zRko42QuYdpb3LRZzCmWIS': [0.591, 0.84], // neck 198
  'vxZLiMxOPlEj7wSCe22DBh8t9rm9cNrJJIo8BcYl': [0.597, 0.84], // neck 199
  'xqsCDNY9sy7n4KmAY9v7ZDnhOJNegmxtjzqVccJt': [0.51, 0.885], // head 163
  'yS4UFyKL79gsQqJyBsSQ5nmci3wUPEkwmZKdzmZy': [0.356, 0.941], // neck 170
  'yk94AgKnY7CwI9YXzJIlwnaSlEpbhccF3191e3Sd': [0.168, 0.731], // face 476
  'zatPTVgHoetn3CEplNiYDBzwGqhpL4zY89yBbNR2': [0.012, 0.542], // hand 201
  'zkomm0zlltvR3DR4q43r5cexrVKa2rPRD3JzbIpl': [0.13, 0.341], // hand 442
};

/** The paper's file name without folder or extension ("sOub...TQO"). Exported for tests. */
export function paperKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /([^/?#]+?)(?:\.[A-Za-z0-9]+)?(?:[?#].*)?$/.exec(url);
  return m ? m[1] : null;
}

/** The painted reach of a dressed shark: the body box, widened by any wide outfit paper it wears. */
export function lookExtent(inventory: InventoryType | null | undefined): LookExtent {
  let { left, right } = BODY_EXTENT;
  if (!inventory) return BODY_EXTENT;
  for (const slot of OUTFIT_SLOTS) {
    const key = paperKey(inventory[slot]?.paper_url);
    const wide = key ? WIDE_PAPERS[key] : undefined;
    if (wide) { left = Math.min(left, wide[0]); right = Math.max(right, wide[1]); }
  }
  return left === BODY_EXTENT.left && right === BODY_EXTENT.right ? BODY_EXTENT : { left, right };
}
