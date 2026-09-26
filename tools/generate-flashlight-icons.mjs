// Needs sharp (not an app dependency): npm i --no-save sharp
/**
 * Deterministic code-native art for the Night Lights collection.
 * Eight decorated shark-world torches in five colorways yield 40 distinct
 * bundled icons without generic emoji or a network dependency at play time.
 * Run: node tools/generate-flashlight-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const output = join(process.cwd(), 'assets/images/prep-items/flashlights');
mkdirSync(output, { recursive: true });

const colors = [
  { name: 'Aqua', main: '#2fd6ef', light: '#bdfcff', shadow: '#0782ba' },
  { name: 'Coral', main: '#ff6f82', light: '#ffe1a5', shadow: '#b92e73' },
  { name: 'Violet', main: '#9b8cff', light: '#f2ceff', shadow: '#584fbf' },
  { name: 'Lime', main: '#8ee472', light: '#e7ffc7', shadow: '#269967' },
  { name: 'Gold', main: '#ffcc42', light: '#fff4b2', shadow: '#d27823' },
];

const themes = [
  { name: 'Scout', mark: '<path d="M-28 16 Q0-21 28 16 M-16 18 Q0 1 16 18" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/><circle cy="21" r="6" fill="#fff"/>' },
  { name: 'Starfinder', mark: '<path d="M0-31 8-9 31-9 13 5 20 28 0 14-20 28-13 5-31-9-8-9Z" fill="#fff"/>' },
  { name: 'Moonbeam', mark: '<path d="M20-27 A30 30 0 1 0 27 20 A24 24 0 1 1 20-27Z" fill="#fff"/><circle cx="-23" cy="-22" r="4" fill="#fff"/>' },
  { name: 'Wave Rider', mark: '<path d="M-33-6 Q-16-25 0-6 T33-6 M-33 13 Q-16-6 0 13 T33 13" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>' },
  { name: 'Compass', mark: '<path d="M0-32 10-10 32 0 10 10 0 32-10 10-32 0-10-10Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><circle r="9" fill="#fff"/>' },
  { name: 'Shark Fin', mark: '<path d="M-27 23 Q-7 8 11-29 Q24-9 19 18 Q27 17 33 12 L30 28Z" fill="#fff"/><circle cx="15" cy="4" r="3" fill="#0a3a79"/>' },
  { name: 'Movie Magic', mark: '<path d="M-27-20 H27 V24 H-27Z M-27-31 H27 V-20 H-27Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M-17-30-8-21 M1-30 10-21 M19-30 27-22" stroke="#fff" stroke-width="6"/>' },
  { name: 'Royal Glow', mark: '<path d="M-31-13-20 15 H20 L31-13 13 0 0-25-13 0Z M-22 23 H22" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><circle cy="-10" r="5" fill="#fff"/>' },
];

function svg(theme, color, index) {
  const special = index >= 36;
  const legendary = index === 40;
  const beam = index % 2 === 0 ? 'M213 136 112 34 399 34 299 136Z' : 'M215 135 153 25 359 25 299 135Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sea"><stop stop-color="#219ce3"/><stop offset=".7" stop-color="#0653a0"/><stop offset="1" stop-color="#08265f"/></radialGradient>
    <radialGradient id="beam"><stop stop-color="${color.light}" stop-opacity=".85"/><stop offset="1" stop-color="${color.light}" stop-opacity="0"/></radialGradient>
    <linearGradient id="body" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${color.light}"/><stop offset=".42" stop-color="${color.main}"/><stop offset="1" stop-color="${color.shadow}"/></linearGradient>
    <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#fff5b2"/><stop offset=".45" stop-color="#ffc632"/><stop offset="1" stop-color="#cc751b"/></linearGradient>
    <radialGradient id="lens"><stop stop-color="#fff"/><stop offset=".52" stop-color="${color.light}"/><stop offset="1" stop-color="${color.main}"/></radialGradient>
  </defs>
  <circle cx="256" cy="255" r="236" fill="#fff"/>
  <circle cx="256" cy="255" r="224" fill="url(#gold)" stroke="#092b65" stroke-width="12"/>
  <circle cx="256" cy="255" r="204" fill="url(#sea)" stroke="#fff2a0" stroke-width="5"/>
  <path d="M77 353 Q150 314 221 359 T434 347 V413 Q262 473 80 407Z" fill="#0c5fab" opacity=".75"/>
  <path d="M68 381 Q146 339 223 391 T444 375" fill="none" stroke="#6de6f7" stroke-opacity=".55" stroke-width="9"/>
  <g fill="none" stroke="#a8f7ff" stroke-opacity=".78" stroke-width="5"><circle cx="112" cy="137" r="13"/><circle cx="398" cy="167" r="9"/><circle cx="94" cy="301" r="7"/><circle cx="394" cy="345" r="16"/></g>
  <path d="M125 89 131 105 147 111 131 117 125 133 119 117 103 111 119 105Z M396 102 400 113 411 117 400 121 396 132 392 121 381 117 392 113Z" fill="#fff6b8"/>
  ${special ? '<path d="M345 69 352 88 371 95 352 102 345 121 338 102 319 95 338 88Z" fill="#fff" stroke="#ffc53e" stroke-width="4"/>' : ''}
  <path d="${beam}" fill="url(#beam)"/>
  <g transform="rotate(-24 256 256)">
    <path d="M192 195 Q192 179 208 179 H304 Q320 179 320 195 L315 362 Q313 381 294 385 H218 Q199 381 197 362Z" fill="#fff" stroke="#082f6c" stroke-width="14"/>
    <path d="M205 198 Q205 191 214 191 H298 Q307 191 307 198 L302 355 Q301 369 289 371 H223 Q211 369 210 355Z" fill="url(#body)" stroke="#ffd354" stroke-width="7"/>
    <path d="M218 205 Q222 197 234 197 L232 353 Q222 348 221 339Z" fill="#fff" opacity=".52"/>
    <path d="M204 335 H307 L304 366 Q300 379 287 379 H223 Q210 379 207 366Z" fill="#082d68" stroke="#ffd554" stroke-width="7"/>
    <path d="M218 349 H296" stroke="#79ceea" stroke-width="8" stroke-linecap="round"/>
    <path d="M203 225 H308 M205 243 H307" stroke="#0b3974" stroke-width="6" opacity=".65"/>
    <path d="M187 171 Q181 156 194 145 H318 Q331 156 325 171 L317 202 H195Z" fill="url(#gold)" stroke="#082e6b" stroke-width="12"/>
    <ellipse cx="256" cy="144" rx="76" ry="29" fill="#fff" stroke="#082e6b" stroke-width="13"/>
    <ellipse cx="256" cy="144" rx="61" ry="19" fill="url(#lens)" stroke="#e9ae2b" stroke-width="5"/>
    <ellipse cx="238" cy="139" rx="15" ry="5" fill="#fff" opacity=".92"/>
    <circle cx="256" cy="291" r="51" fill="#083b7b" stroke="#fff" stroke-width="8"/>
    <circle cx="256" cy="291" r="43" fill="${color.shadow}" stroke="#ffc63d" stroke-width="6"/>
    <g transform="translate(256 291)">${theme.mark}</g>
    <path d="M208 258 215 260 M298 258 305 260" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
  </g>
  <path d="M169 415 174 428 187 433 174 438 169 451 164 438 151 433 164 428Z" fill="#fff"/>
  ${legendary ? '<circle cx="256" cy="255" r="211" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="7" stroke-dasharray="15 15"/>' : ''}
</svg>`;
}

for (let form = 0; form < themes.length; form++) {
  for (let hue = 0; hue < colors.length; hue++) {
    const index = form * colors.length + hue + 1;
    const slug = `flashlight_${String(index).padStart(2, '0')}`;
    const source = join(output, `${slug}.svg`);
    const target = join(output, `${slug}.png`);
    writeFileSync(source, svg(themes[form], colors[hue], index));
    await sharp(source).resize(256, 256).png().toFile(target);
  }
}
