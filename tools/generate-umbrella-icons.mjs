/**
 * Theme Park Shark Rain Parade collectible art. Deterministic source SVGs and
 * bundled PNGs keep every variant available offline at map and book size.
 * Run: node tools/generate-umbrella-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const output = join(process.cwd(), 'assets/images/prep-items/umbrellas');
mkdirSync(output, { recursive: true });

const colors = [
  { main: '#30d5ef', light: '#d5ffff', shadow: '#0584b5' },
  { main: '#ff7796', light: '#ffe5ce', shadow: '#bd3470' },
  { main: '#aa92ff', light: '#f4e5ff', shadow: '#604dc3' },
  { main: '#a1e77a', light: '#edffce', shadow: '#2e9a6a' },
  { main: '#ffd15c', light: '#fff6c0', shadow: '#c77e24' },
];

const designs = [
  '<circle r="19" fill="none" stroke="#fff" stroke-width="8"/><circle cx="-21" cy="-18" r="7" fill="#fff"/><circle cx="22" cy="17" r="5" fill="#fff"/>',
  '<path d="M0-29 7-8 29-8 12 5 18 26 0 13-18 26-12 5-29-8-7-8Z" fill="#fff"/>',
  '<path d="M-30 11 Q-28-7-12-6 Q-9-28 11-24 Q29-23 28-4 Q38 6 26 15 H-24Z" fill="#fff"/>',
  '<path d="M-35-7 Q-18-27 0-7 T35-7 M-35 14 Q-18-6 0 14 T35 14" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
  '<path d="M0-30 9-9 30 0 9 9 0 30-9 9-30 0-9-9Z" fill="none" stroke="#fff" stroke-width="8"/><circle r="7" fill="#fff"/>',
  '<path d="M-30 23 Q-9 4 10-28 Q26-10 19 17 Q29 17 33 11 L30 28Z" fill="#fff"/><circle cx="17" cy="3" r="3" fill="#0a3d78"/>',
  '<path d="M-30 26 V-3 L-16-13-3-3 10-17 28-4 V26Z M-33-15 0-35 33-15" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M-7 26 V9 H7 V26" fill="none" stroke="#fff" stroke-width="7"/>',
  '<path d="M-30 17 Q-27-18 0-18 Q27-18 30 17" fill="none" stroke="#fff" stroke-width="9"/><path d="M-22 15 Q-20-9 0-9 Q20-9 22 15" fill="none" stroke="#fff" stroke-width="8"/><circle cx="0" cy="19" r="5" fill="#fff"/>',
];

function svg(mark, color, number) {
  const special = number >= 37;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sea"><stop stop-color="#37baf2"/><stop offset=".7" stop-color="#0872bd"/><stop offset="1" stop-color="#0b357a"/></radialGradient>
    <linearGradient id="canopy" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${color.light}"/><stop offset=".46" stop-color="${color.main}"/><stop offset="1" stop-color="${color.shadow}"/></linearGradient>
    <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#fff6b9"/><stop offset=".48" stop-color="#ffd04a"/><stop offset="1" stop-color="#c78122"/></linearGradient>
  </defs>
  <circle cx="256" cy="255" r="236" fill="#fff"/>
  <circle cx="256" cy="255" r="224" fill="url(#gold)" stroke="#093468" stroke-width="12"/>
  <circle cx="256" cy="255" r="204" fill="url(#sea)" stroke="#fff0ac" stroke-width="5"/>
  <path d="M68 345 Q140 314 214 349 T444 338 V422 Q270 467 68 405Z" fill="#0c5ba8" opacity=".62"/>
  <path d="M75 385 Q153 348 229 386 T438 379" fill="none" stroke="#99f1ff" stroke-opacity=".7" stroke-width="8"/>
  <g fill="none" stroke="#c5f7ff" stroke-width="6" opacity=".9"><path d="M117 122 Q110 134 117 140 Q126 141 124 132Z"/><path d="M390 128 Q380 145 390 152 Q402 152 400 141Z"/><path d="M92 275 Q84 291 94 300 Q105 300 103 287Z"/><path d="M411 296 Q405 310 413 317 Q423 316 421 305Z"/></g>
  <path d="M253 244 V364 Q253 404 284 404 Q306 404 309 381" fill="none" stroke="#fff" stroke-width="29" stroke-linecap="round"/>
  <path d="M253 244 V364 Q253 404 284 404 Q306 404 309 381" fill="none" stroke="#113e78" stroke-width="17" stroke-linecap="round"/>
  <path d="M253 246 V358" fill="none" stroke="url(#gold)" stroke-width="9" stroke-linecap="round"/>
  <path d="M102 250 Q139 131 254 122 Q373 131 410 250 Q375 232 335 251 Q294 230 255 250 Q215 230 174 251 Q135 232 102 250Z" fill="#fff" stroke="#0b3575" stroke-width="15" stroke-linejoin="round"/>
  <path d="M112 237 Q146 142 255 135 Q365 143 399 237 Q370 225 334 242 Q293 222 255 240 Q213 222 173 242 Q142 225 112 237Z" fill="${color.main}" stroke="#ffd255" stroke-width="7"/>
  <path d="M253 136 Q204 175 173 242 M256 136 Q306 174 335 242 M255 137 V239" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="8"/>
  <path d="M135 213 Q164 163 224 151" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="10" stroke-linecap="round"/>
  <ellipse cx="255" cy="194" rx="48" ry="43" fill="#0b468b" stroke="#fff" stroke-width="7"/>
  <ellipse cx="255" cy="194" rx="40" ry="35" fill="${color.shadow}" stroke="#ffd450" stroke-width="5"/>
  <g transform="translate(255 194) scale(.7)">${mark}</g>
  <path d="M251 113 258 113 267 132 243 132Z" fill="url(#gold)" stroke="#0d3c75" stroke-width="5"/>
  <path d="M142 87 148 101 162 107 148 113 142 127 136 113 122 107 136 101Z M374 83 378 93 388 97 378 101 374 111 370 101 360 97 370 93Z" fill="#fff6c2"/>
  ${special ? '<path d="M348 342 354 356 368 362 354 368 348 382 342 368 328 362 342 356Z" fill="#fff" stroke="#f7c84b" stroke-width="4"/>' : ''}
  ${number === 40 ? '<circle cx="256" cy="255" r="211" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="7" stroke-dasharray="15 15"/>' : ''}
</svg>`;
}

for (let design = 0; design < designs.length; design++) {
  for (let hue = 0; hue < colors.length; hue++) {
    const number = design * colors.length + hue + 1;
    const slug = `umbrella_${String(number).padStart(2, '0')}`;
    const source = join(output, `${slug}.svg`);
    writeFileSync(source, svg(designs[design], colors[hue], number));
    await sharp(source).resize(256, 256).png().toFile(join(output, `${slug}.png`));
  }
}
