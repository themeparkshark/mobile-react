#!/usr/bin/env node
/**
 * QR codes for share pictures outside the Share Studio kinds (crew card, ride log card,
 * mini-game results, the Closet look, the Friends invite). Same look as build-qr.py
 * (navy on white, error level M, 10 px modules, 1 module border), no Python needed:
 * the encoder is the one bundled with qrcode-terminal, the PNG is written by hand.
 *
 * usage: node tools/share-studio/build-campaign-qr.cjs
 * Each code encodes https://themeparkshark.com/app?c=flex_<campaign> (src/share/link.ts).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const QRCode = require('qrcode-terminal/vendor/QRCode');
const Level = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

const root = path.resolve(__dirname, '../..');
const CAMPAIGNS = ['invite', 'crew', 'ride_log', 'whack', 'memory', 'look', 'game'];
const out = path.join(root, 'assets/images/share/qr');
const NAVY = [5, 52, 110];
const WHITE = [255, 255, 255];
const BOX = 10;
const BORDER = 1;

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return buf => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}
function png(matrix) {
  const n = matrix.length + BORDER * 2;
  const size = n * BOX;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    const my = Math.floor(y / BOX) - BORDER;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / BOX) - BORDER;
      const dark = my >= 0 && mx >= 0 && my < matrix.length && mx < matrix.length && matrix[my][mx];
      const [r, g, b] = dark ? NAVY : WHITE;
      raw[row + 1 + x * 3] = r; raw[row + 2 + x * 3] = g; raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(out, { recursive: true });
const lines = [];
for (const campaign of CAMPAIGNS) {
  const q = new QRCode(-1, Level.M);
  q.addData(`https://themeparkshark.com/app?c=flex_${campaign}`);
  q.make();
  const count = q.getModuleCount();
  const matrix = Array.from({ length: count }, (_, r) => Array.from({ length: count }, (_, c) => q.isDark(r, c)));
  fs.writeFileSync(path.join(out, `campaign-${campaign}.png`), png(matrix));
  lines.push(`  ${campaign}: require('../../assets/images/share/qr/campaign-${campaign}.png'),`);
}
fs.writeFileSync(path.join(root, 'src/share/campaignQr.ts'),
  '/** QR codes for share pictures outside the Share Studio kinds (tools/share-studio/build-campaign-qr.cjs). Do not edit by hand. */\n' +
  `export type ShareCampaign = ${CAMPAIGNS.map(c => `'${c}'`).join(' | ')};\n\n` +
  'export const QR_BY_CAMPAIGN: Readonly<Record<ShareCampaign, number>> = {\n' + lines.join('\n') + '\n};\n');
console.log(`${CAMPAIGNS.length} codes`);
