// Needs sharp (not an app dependency): npm i --no-save sharp
/** Camera Crew collectible badges. Run: node tools/generate-camera-icons.mjs */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const output = join(process.cwd(), 'assets/images/prep-items/cameras');
mkdirSync(output, { recursive: true });

const colors = [
  { main: '#34d8ed', light: '#c8fbff', dark: '#087fa5' },
  { main: '#ff7f95', light: '#ffe0d0', dark: '#b94272' },
  { main: '#ad91ff', light: '#efe1ff', dark: '#6552be' },
  { main: '#9ee47c', light: '#e9ffd5', dark: '#428e61' },
  { main: '#ffd160', light: '#fff5bd', dark: '#c78328' },
];

const marks = [
  '<path d="M0-22 8-8 22 0 8 8 0 22-8 8-22 0-8-8Z" fill="none" stroke="#fff" stroke-width="6"/><circle r="5" fill="#fff"/>',
  '<path d="M0-25 6-7 24-7 9 4 15 22 0 11-15 22-9 4-24-7-6-7Z" fill="#fff"/>',
  '<circle cy="7" r="10" fill="#fff"/><path d="M-25 18 Q-15 7 0 18 Q15 7 25 18" fill="none" stroke="#fff" stroke-width="6"/>',
  '<path d="M-24-7 Q-12-19 0-7 T24-7 M-24 9 Q-12-3 0 9 T24 9" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  '<path d="M-22 18 V-8 L-12-14-2-8 8-18 21-8 V18Z M-25-17 0-29 25-17" fill="none" stroke="#fff" stroke-width="6"/><path d="M-5 18 V4 H5 V18" fill="none" stroke="#fff" stroke-width="5"/>',
  '<path d="M-24 21 Q-5 4 8-23 Q20-9 16 14 Q23 15 27 9 L23 23Z" fill="#fff"/><circle cx="12" cy="2" r="3" fill="#10417c"/>',
  '<path d="M0-26 V22 M-19-14 19 11 M19-14-19 11" stroke="#fff" stroke-width="5"/><circle r="6" fill="#fff"/><circle cy="-26" r="3" fill="#fff"/><circle cx="19" cy="11" r="3" fill="#fff"/>',
  '<path d="M-25-14 H25 V14 H-25Z" fill="none" stroke="#fff" stroke-width="6"/><path d="M-20 0 H20 M-13-14 V14 M13-14 V14" stroke="#fff" stroke-width="4"/><circle r="6" fill="#fff"/>',
];

function svg(mark, color, number) {
  const rare = number >= 37;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sea"><stop stop-color="#4bc8f6"/><stop offset=".65" stop-color="#0b78c1"/><stop offset="1" stop-color="#0a3a7b"/></radialGradient>
    <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#fff8bf"/><stop offset=".52" stop-color="#ffca40"/><stop offset="1" stop-color="#bb7421"/></linearGradient>
    <linearGradient id="body" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${color.light}"/><stop offset=".48" stop-color="${color.main}"/><stop offset="1" stop-color="${color.dark}"/></linearGradient>
    <radialGradient id="lens"><stop stop-color="#b6f7ff"/><stop offset=".22" stop-color="#3bc4e8"/><stop offset=".55" stop-color="#135ca1"/><stop offset="1" stop-color="#092e67"/></radialGradient>
  </defs>
  <circle cx="256" cy="256" r="237" fill="#fff"/>
  <circle cx="256" cy="256" r="224" fill="url(#gold)" stroke="#093568" stroke-width="12"/>
  <circle cx="256" cy="256" r="204" fill="url(#sea)" stroke="#fff2b1" stroke-width="5"/>
  <path d="M70 346 Q155 312 254 349 T442 343 V419 Q259 464 70 408Z" fill="#0a579d" opacity=".55"/>
  <path d="M85 385 Q159 356 252 388 T427 379" fill="none" stroke="#b5f8ff" stroke-opacity=".65" stroke-width="7"/>
  <g fill="none" stroke="#cdf9ff" stroke-width="6"><circle cx="108" cy="139" r="9"/><circle cx="390" cy="130" r="12"/><circle cx="103" cy="303" r="7"/><circle cx="412" cy="310" r="8"/></g>
  <path d="M150 152 Q257 100 363 151" fill="none" stroke="#102f6b" stroke-width="21" stroke-linecap="round"/>
  <path d="M151 151 Q256 101 362 151" fill="none" stroke="url(#gold)" stroke-width="11" stroke-linecap="round"/>
  <rect x="125" y="155" width="266" height="203" rx="35" fill="#092c65" stroke="#fff" stroke-width="9"/>
  <rect x="136" y="166" width="244" height="181" rx="27" fill="url(#body)" stroke="url(#gold)" stroke-width="10"/>
  <path d="M157 196 Q176 178 201 181 M148 315 H366" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="8" stroke-linecap="round"/>
  <rect x="175" y="138" width="63" height="34" rx="10" fill="${color.dark}" stroke="#f9cf53" stroke-width="7"/>
  <rect x="312" y="145" width="42" height="28" rx="9" fill="#e3faff" stroke="#0b4588" stroke-width="5"/>
  <circle cx="257" cy="260" r="92" fill="#0b3979" stroke="#fff" stroke-width="9"/>
  <circle cx="257" cy="260" r="80" fill="url(#gold)" stroke="#0b3979" stroke-width="5"/>
  <circle cx="257" cy="260" r="68" fill="url(#lens)" stroke="#d6faff" stroke-width="8"/>
  <circle cx="257" cy="260" r="52" fill="#10437e" opacity=".55"/>
  <path d="M226 226 Q240 208 259 210" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="10" stroke-linecap="round"/>
  <g transform="translate(257 267)">${mark}</g>
  <circle cx="344" cy="192" r="12" fill="#fff3ab" stroke="#0b3979" stroke-width="5"/>
  <path d="M117 114 122 125 133 130 122 135 117 146 112 135 101 130 112 125Z M387 91 392 102 403 107 392 112 387 123 382 112 371 107 382 102Z" fill="#fff2ae"/>
  ${rare ? '<path d="M350 365 356 378 369 384 356 390 350 403 344 390 331 384 344 378Z" fill="#fff" stroke="#f8cd4d" stroke-width="4"/>' : ''}
  ${number === 40 ? '<circle cx="256" cy="256" r="211" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="6" stroke-dasharray="14 14"/>' : ''}
  </svg>`;
}

for (let design = 0; design < marks.length; design++) {
  for (let hue = 0; hue < colors.length; hue++) {
    const number = design * colors.length + hue + 1;
    const slug = `camera_${String(number).padStart(2, '0')}`;
    const source = join(output, `${slug}.svg`);
    writeFileSync(source, svg(marks[design], colors[hue], number));
    await sharp(source).resize(256, 256).png().toFile(join(output, `${slug}.png`));
  }
}
