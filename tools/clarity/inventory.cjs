#!/usr/bin/env node
/**
 * Clarity inventory: every player-facing string in src/, plus the server's
 * player-facing message lines when a backend checkout path is given.
 *
 *   node tools/clarity/inventory.cjs [--be <laravel checkout>] [--out <dir>]
 *
 * Writes strings.tsv (file, line, kind, area, score, flags, text) and a
 * summary on stdout. The scorer is the same one tools/tests/clarity-copy
 * uses (tools/clarity/rules.cjs), so the audit and the test agree.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const rules = require('./rules.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = opt('--out', path.join(ROOT, 'tools', 'clarity', 'out'));
const BE = opt('--be', null);

const { extractFile, isDevFile, areaOf } = require('./extract.cjs');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

const rows = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file);
  if (isDevFile(rel)) continue;
  for (const r of extractFile(file, rel)) rows.push(r);
}

if (BE) {
  // Server lines: PHP string literals in the places that speak to players.
  const phpDirs = ['app/Http/Controllers', 'app/Http/Requests', 'app/Domains', 'app/Services', 'app/Support', 'app/Exceptions', 'app/Rules', 'app/Models', 'lang', 'config'];
  const keyish = /(message|error|title|body|label|line|copy|reason|text|what|earn|hint|toast|cta|button|description|subtitle|prompt|summary|note)/i;
  for (const d of phpDirs) {
    const abs = path.join(BE, d);
    if (!fs.existsSync(abs)) continue;
    const files = [];
    (function w(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) w(q); else if (e.name.endsWith('.php')) files.push(q); } })(abs);
    for (const f of files) {
      const rel = 'BE:' + path.relative(BE, f);
      if (/^BE:lang\/(?!en\/)/.test(rel) || /^BE:lang\/en\/(validation|passwords|pagination)\.php$/.test(rel)) continue;
      const src = fs.readFileSync(f, 'utf8').split('\n');
      src.forEach((line, i) => {
        const lits = [...line.matchAll(/(['"])((?:\\.|(?!\1).){6,}?)\1/g)].map(m => m[2]);
        for (const lit of lits) {
          if (!/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(lit)) continue; // needs two words
          if (/^[a-z0-9_.:\/-]+$/i.test(lit.replace(/\s/g, ''))) {/* keep */}
          if (/(SELECT|INSERT|UPDATE|WHERE|->|::|\$this|App\\|https?:)/.test(lit)) continue;
          const playerish = /abort\(|abort_if|abort_unless|ValidationException|'message'|"message"|=>\s*['"]|response\(\)->json|messages\(\)|withMessage|__\(|trans\(/.test(line) || keyish.test(line);
          if (!playerish) continue;
          if (/(Log::|logger\(|->info\(|->warn|->error\(|->line\(|->comment\(|->table\(|->option|->argument|\$signature|\$description|Telegram|alert\(|->warn\()/.test(line)) continue;
          rows.push({ file: rel, line: i + 1, kind: 'server', text: lit.replace(/\\'/g, "'"), area: 'server' });
        }
      });
    }
  }
}

for (const r of rows) {
  if (!r.area) r.area = areaOf(r.file);
  const s = rules.score(r.text);
  r.score = s.score;
  r.flags = s.flags.join(',');
}

fs.mkdirSync(OUT, { recursive: true });
const tsv = ['file\tline\tkind\tarea\tscore\tflags\ttext']
  .concat(rows.map(r => [r.file, r.line, r.kind, r.area, r.score, r.flags, r.text.replace(/\s+/g, ' ')].join('\t')));
fs.writeFileSync(path.join(OUT, 'strings.tsv'), tsv.join('\n') + '\n');

const byArea = {};
for (const r of rows) {
  const a = (byArea[r.area] ||= { n: 0, low: 0, flagged: 0 });
  a.n++; if (r.score <= 2) a.low++; if (r.flags) a.flagged++;
}
const flagCount = {};
for (const r of rows) for (const f of r.flags ? r.flags.split(',') : []) { const k = f.split(':')[0]; flagCount[k] = (flagCount[k] || 0) + 1; }
console.log(JSON.stringify({ total: rows.length, byArea, flagCount }, null, 1));
