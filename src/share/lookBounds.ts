/**
 * How far a dressed shark's paint reaches across its 1353x1530 paper, so a share card can keep the
 * prize readable when a costume is wider than the shark (a ghost sheet, a blaster, a tall hat).
 *
 * The bare shark's body runs from about 0.18 to 0.82 of the paper's width. WIDE_PAPERS lists every
 * outfit paper in the catalog whose paint goes past that (measured from the alpha channel of each
 * production paper, 346 papers, Oct 24 2026), keyed by the paper's file name, as [left, right].
 * NARROW_PAPERS lists the first 10 letters of every other catalog paper (they stay inside the body box).
 * A paper in neither list is new to the catalog: it counts as UNKNOWN_EXTENT (as wide as a ghost sheet
 * and a tall hat together) until tools/share-studio/measure-look-bounds.py measures it, so a new wide
 * costume can never silently cover the prize. Re-run that script (with --check) after a catalog drop.
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
  'JmO2NMbED939ryF7SsTNUjffRyej1iggXPgEzPjT': [0.0, 1.0], // head 296 (a 561x419 paper, stretched over the whole canvas)
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

/** First 10 letters of every catalog outfit paper that stays inside the body box (298 papers). */
export const NARROW_PAPERS = '02M7eLopeG 0GZfeWrAdS 0JDVDDHFYk 0KIERSKr5y 17XaYqxcdu 1NGMkB6Fu1 1QldiU3IG9 1iKsS9NHtH 2RzwlhwBTF 3A7cVVcZ4N 3dAzSo6J9b 3y8ZAMPCaP 44Poy7dgZe 4DMzauONap 4TBuLfwS6m 4WE52PZr84 4syfINLxED 560eroyWJZ 5AbgHNPZGi 5B1SDzvmJc 5BcEjefCn6 5QHkgGY4Wt 5cRzFIMxDV 5dspA50WQM 63Z80KzmnL 65wIGu7G0j 6CSoSJGgGA 6ErVLEBSDk 6YcJfDjWFa 6jQQcfjTNn 76219T64UV 7GK9qIpRrT 7IkvqsAXqH 7ZlmsGteHR 7x9vkii2MK 88emoJzxTQ 8H0zAoGKPV 8QfZilhV7Q 8Z7O6Di8N1 8tXDVGUSPJ 9C9bWZqT4X 9FccxYRFQf 9gH8dwqpRG 9jynVMxgIV 9o6kXTmsya 9wWBkEzSbK A1ZgKghSxO AE9MqlmuXK AF9Fkaf53Y AfM1o3qWCn AlGcYG1MUu B4wqt2mu3I BEXlN4aDff BOWkKAK8Tf BSYfMamDrs BaAMFd8iuw BdXA3vG9ay BiIdip13Ez C562jtV0eD CEM4RU37zo CiHruUqmL1 CoqvmQx5cd D1vn138CGQ D3L6lPWC9i DG3Cf1IJWS DTUjlsnYhv Ds4oTmH9Mm DseczUPgwO E3HzJsZkAs E8yCX5Opg6 EIbKxOUH3i EQSETOcFaU Ef7dDSQkvH Fd0k5Diwke FiqQx9zfC7 FmdUCKlxMs FqDfPGb1kk Fr4cJTaV3a Fx4TUggEk0 GVVgd7yFL7 GfIG8n08Oe GgF11ICmW0 HB7hv1HC4U HIK6Z7NW8p HiV5nNJn7g HlUvKnTou3 HmtU4D7ZBe HrsT39QuYW HtbCTpU4ov I0Dml7a3Sa I6GBkPF126 I9mMjJ12gk IOsd2BuSdw IejYbiXAUk IhH9iYgdN8 JDY68BrZb8 JEEG5Kr7lT JKztegwAvp JTzrnYyyvO JXfYqoSuPy Jmsx4xLIfp K3qS7gcnvm KJqrsdCgKA KN1NQYD3lD KZPdIYPGNZ Kh7X9DzmCZ KiPYyWBzTr KmXhs1CyTj KsrjNAE5o1 LAQ0lY2HSP LAjBRZnnK7 LF4O35bm2F LMrBUIjM2j LW5v5oOWEB LiFB2FwDca LijD0m44v6 LjTW2W3ocR LrC7gyRFlo M2YMMblrVH M3hcMIpXV7 MaHtih6x4Q NDepsGj8V7 NN3cOpqPYX NTQUr2UhxW NXZwnanFtD NgmTVyreKU O7yZ6pei47 OOuG9SWQ7v OgqdgjjHRg OsdnkEMVz7 PlfgfnUdek PvOtv8CQ5c QQa5waFKyL QWNBT1qkdp QWqZ87Rqq7 QjaKpFzxel R1mWiRGkAs RBqEsUEkQb RLF7VBMrua RSNXKv8RtL Rbzs5og54k Rpisl5mgRv S57plFxAvL SDNcrrx3Ql SGemmVvyk1 SOnt5Yzdlq SWqpYHhtdJ SegdxbHOYQ SnhMR2AtFM TACgZTMx2i TF3QrzneDv TQw7EXAlMx ThTh7D8CA8 TmZ4U0xqC8 U04mjTdF10 U4ZV9vYq30 UDuGv3kSGR UF5CPzg7fQ UVVJZ7U5vi UYjLrFddiH UbolQrf6G1 Ubx93v6qES UtFDSJY5pp UzdEJ9CnV1 V63sUUZXVN VaNhvW1fIf VjcsAsCwL7 VuvXkyumLf WpKt3KoXGy WrOlOam3vu WwCOXJ7rMp XrYZlKgMHX YZPmaFHaW8 YimcxTJsCH ZHmbiOUVwP ZKLU7XaoMj Za3y2NIAi4 ZbZAn1GIcQ ZdTpTbdHOt a25nkUPb6A a5HnDR3JHX aAjccSKPEf aDjJXsxdh3 aMEvkfokQE aPldv2sUfT aXDUNP9oaR aXoGiNMebu bUl86DlR20 bumNgkPl62 bwVAMGoVfO byzjyUvqbw c3zbLg6JvT cINn2xScwN cLXRTUzz0R cOchcVY0HB cTqAdgzo3G ceoKslZbDI dB5pBUcRDC dGAnwk1XX6 dLclumjehN dOI7ORCZtY dQpFYNGM2X e7BUvAVu8p f5eendQpU2 f9UOTuK25r fSbGr7niVF fUZgHhf6CM fahflAuUbR fgM8FNngZC fiuLQDvYTB fl8KhGKSxy fmSAUWCt6I fz41UpSwas g3xjJJiliP gC0l7SWAtk gS74j6nxoZ gbVYuRSBVf gv0WZpFWiY hAGYDyFkO7 hIRFdHxEN7 hLJKeKF4Fr hahztVq6ye i3Y72pA6mq iAravqkZGi iBreLgCGw7 iSBHnwM03G isDx0QNKZn itvtlYeMfR j0mY5LWuvl jo7AK9grps joYpZyhGy4 k9jxQLLpRI kHfHjHTsBn krAts1nsAK l0Ps7XzH2t lbGOW8z2mc lqF2ztc0vK lyxWptR5x3 mLYkUAQSMt mfGLqvG0Vo moHhRVmykX myUFgQWS8r nAq1Qf0SlX nXKg0K89fR nxZ2vbR6uU o3EaxfPnuE oQi4oC4uE8 oT8G3pdWZV oayPsxQ47H oqY6lAwXQL pwE3FJ75xv pyqaHLHBbW q0ySOQRUlV q5vSK0EgcE qAgerViSk0 qLM3r7It0G qqBIwDHIXP qr9agWOTtM qy46w6AkKU r2BR7ofr74 rXH6FSEo55 rcDwx0v3Bo rzxockcYPl s3LHYcR1Hp sHPcAC3YIO shiYksAQCO tFaTvqnaki tKaO6By2ZV tRb5qFGv3N tc9RmV6pYu tf7uJFihNA tgfOJJMTop tlpozFFfNF tvoKPWPCpe uJys5pBBvC uz88ygnTyy vBPohGwDbW vd28gpqGJE vmTypRzZ06 wHw2QLCc0z wV3BWUvMb5 wfD8ILlkWa wp4eyS67JQ x3n9TlsEHE xExUHXYATx xO2ZzP6bT1 xPLkCqGyyR xbx34xH6eN xj1k4vSGkC xlBwxmlSR0 xvpE3Ogi1B y5wPGEQuCx yodKkKLYuw z82ieMoYky zVnImUOQpo zgHBTIRmfB zuUBTYHe3w zv05cEZHlG';
const NARROW = new Set(NARROW_PAPERS.split(' '));
const NARROW_PREFIX = 10;

/** A paper new to the catalog (in neither list): as wide as the widest looks, until it is measured. */
export const UNKNOWN_EXTENT: LookExtent = { left: 0, right: 0.95 };

/** The paper's file name without folder or extension ("sOub...TQO"). Exported for tests. */
export function paperKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /([^/?#]+?)(?:\.[A-Za-z0-9]+)?(?:[?#].*)?$/.exec(url);
  return m ? m[1] : null;
}

/**
 * The painted reach of a dressed shark: the body box, widened by any wide outfit paper it wears. A
 * paper the tables do not know yet counts as UNKNOWN_EXTENT. Local art (no URL) keeps the body box.
 */
export function lookExtent(inventory: InventoryType | null | undefined): LookExtent {
  let { left, right } = BODY_EXTENT;
  if (!inventory) return BODY_EXTENT;
  for (const slot of OUTFIT_SLOTS) {
    const key = paperKey(inventory[slot]?.paper_url);
    if (!key) continue;
    const wide = WIDE_PAPERS[key] ?? (NARROW.has(key.slice(0, NARROW_PREFIX)) ? undefined : [UNKNOWN_EXTENT.left, UNKNOWN_EXTENT.right]);
    if (wide) { left = Math.min(left, wide[0]); right = Math.max(right, wide[1]); }
  }
  return left === BODY_EXTENT.left && right === BODY_EXTENT.right ? BODY_EXTENT : { left, right };
}
