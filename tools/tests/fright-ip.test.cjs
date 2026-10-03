/**
 * Kid-safe parody copy only: no real event, house or icon name, no em dash,
 * no banned phrases in any Fin-ister app file or bundled content. Server
 * strings are codenames (FrightPayloadIpTest on the backend).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const DIRS = ['src/services/fright', 'src/components/fright', 'src/api/endpoints/fright'];
const FILES = ['src/hooks/useFrightNight.ts'];

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

const BANNED = [/halloween horror/i, /\bHHN\b/, /horror nights/i, /Fright Nights/, /jack the clown/i, /oddfellow/i,
  /stranger things/i, /hellraiser/i, /evil dead/i, /\bozzy\b/i, /bloodengutz/i, /madlands/i, /cybergoria/i,
  /never go alone/i, /\bcaretaker\b/i, /bloody mary/i, /lady luck\b/i, /pumpkin lord/i, /sinist3r/i, /surr3al/i,
  /carey, ohio/i, /sideshow of decay/i, /clowntown/i, /legendary truth/i, /fear's lantern/i, /tribute store/i,
  /scream early/i, /\bsinners\b/i, /overrated/i, /\bthe worst\b/i, /buckle up/i, /next level/i,
  /\bblood\b/i, /\bgore\b/i, /chainsaw/i, /\bkill/i, /\bdead\b/i];

const files = [...DIRS.flatMap(walk), ...FILES].filter(file => /\.(tsx?|json)$/.test(file));

test('no real event, house or icon names, banned phrases or em dashes in Fin-ister files', () => {
  assert.ok(files.length > 15);
  const hits = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(root, file), 'utf8');
    // Copy only: comments are documentation (e.g. "the next level" of the Lantern), not UI.
    const text = file.endsWith('.json') ? raw : raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const re of BANNED) if (re.test(text)) hits.push(`${file}: ${re}`);
    if (raw.includes('\u2014')) hits.push(`${file}: em dash`);
  }
  assert.deepEqual(hits, []);
});

test('the mode name is hard-coded in ONE place (config.ts); everything else reads frightModeName / event.title', () => {
  const owners = files.filter(file => !file.endsWith('.json'))
    .filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes("'Fin-ister Nights'"));
  assert.deepEqual(owners, ['src/services/fright/config.ts']);
});

test('no free text input anywhere in the mode', () => {
  for (const file of files.filter(f => f.endsWith('.tsx'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /TextInput/, file);
  }
});
