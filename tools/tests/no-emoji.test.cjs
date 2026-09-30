'use strict';
/**
 * No-emoji and no-em-dash gate for player-visible copy (owned by WS0).
 *
 * REPORT MODE (today): prints offender counts per file and never fails.
 * STRICT MODE: flip STRICT to true (WS0 does this at integration, before any
 * external build) or run with UI_COPY_STRICT=1 to preview it. Strict fails on
 * emoji, em dashes and dingbat glyph icons (star, check, X, arrows, notes) in
 * shipped files; each owning stream swaps its glyphs to <GameIcon> first.
 * Third-party phrases stay report-only. Dev-only preview and tester screens are
 * listed but never fail the gate.
 *
 * SERVER STRINGS: set UI_COPY_BACKEND=<backend checkout> to also scan the
 * backend's app/ PHP string literals (read only). Strict mode fails on emoji
 * and em dashes there too. A clean backend scan is a precondition for flipping
 * STRICT to true.
 *
 * Fix an offender by using <GameIcon>, <GameRichText> '[icon:name]' tokens, or
 * a comma. For a real exception (a storage key that is never rendered), put
 *   // ui-copy-allow(emoji): why
 * on the line above. There is no shared allowlist file on purpose.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { scanSource, scanApp, scanPhpSource, scanBackend, STRICT_KINDS } = require('./helpers/ui-copy-rules.cjs');
const { plain } = require('./helpers/plain.cjs');

const STRICT = false || process.env.UI_COPY_STRICT === '1';

test('emoji in strings, templates and JSX text are found; comments and imports are not', () => {
  const source = [
    "import shark from './shark\u{1F988}.png';",
    '// a comment with \u{1F988} is fine',
    "const a = 'Energy ⚡';",
    'const b = `Streak ${n} \u{1F525}`;',
    'const c = <Text>Nice \u{1F389} work</Text>;',
    "console.log('debug \u{1F41B}');",
  ].join('\n');
  const found = scanSource(source, 'x.tsx');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[3, 'emoji'], [4, 'emoji'], [5, 'emoji']]);
});

test('escaped emoji count, and the copyright and trademark signs do not', () => {
  const found = scanSource("const a = '\\u{1F988} shark';\nconst b = 'TPS™ © 2026';", 'x.ts');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[1, 'emoji']]);
});

test('em dashes in copy are flagged, glyph icons and third-party phrases are reported separately', () => {
  const found = scanSource([
    "const a = 'Ride again — soon';",
    "const b = 'Close ✕';",
    "const c = 'Gotta catch them';",
  ].join('\n'), 'x.ts');
  assert.deepEqual(found.map(f => f.kind), ['emdash', 'glyph', 'phrase']);
});

test('an inline ui-copy-allow pragma exempts only the named kind on that line', () => {
  const found = scanSource([
    '// ui-copy-allow(emoji): saved reaction codes are storage keys',
    "const codes = ['\u{1F92F}', '\u{1F602}'];",
    "const shown = 'Wow \u{1F92F} — nice';",
  ].join('\n'), 'x.ts');
  assert.deepEqual(plain(found.map(f => ({ line: f.line, kind: f.kind }))),
    [{ line: 3, kind: 'emoji' }, { line: 3, kind: 'emdash' }]);
});

test('dingbat glyphs that are not Unicode emoji are caught and are strict', () => {
  const found = scanSource([
    "const a = 'Rated \u2605\u2605\u2606';",
    "const b = 'Done \u2713';",
    "const c = <Text>Next \u2192</Text>;",
    "const d = 'Music \u266A';",
    "const e = 'Close \u2717';",
  ].join('\n'), 'x.tsx');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[1, 'glyph'], [2, 'glyph'], [3, 'glyph'], [4, 'glyph'], [5, 'glyph']]);
  assert.ok(STRICT_KINDS.includes('glyph'));
});

test('a pragma above a function or component never covers its body', () => {
  const found = scanSource([
    '// ui-copy-allow(emoji, emdash): not a lookup table',
    'export default function Screen() {',
    "  const label = 'Nice \u{1F389}';",
    '  return <Text>Ride again \u2014 soon</Text>;',
    '}',
    '// ui-copy-allow(emoji)',
    'export const View = () => (',
    '  <Text>Hi \u{1F988}</Text>',
    ');',
  ].join('\n'), 'x.tsx');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[3, 'emoji'], [4, 'emdash'], [8, 'emoji']]);
});

test('server PHP strings: emoji and em dashes are found, comments and log lines are not', () => {
  const found = scanPhpSource([
    '<?php',
    '// streak \u{1F525} comment',
    "$message = 'Streak \u{1F525} 3 days';",
    "Log::info('debug \u{1F41B}');",
    '$b = "Ride \u2014 again";',
    "$c = 'plain';",
  ].join('\n'));
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[3, 'emoji'], [5, 'emdash']]);
});

test('a pragma on a declaration covers the whole lookup table, and nothing after it', () => {
  const found = scanSource([
    '// ui-copy-allow(emoji): legacy lookup, never rendered',
    'const TABLE = {',
    "  a: '\u{1F988}',",
    "  b: '\u{1F525}',",
    '};',
    "const shown = '\u{1F525}';",
  ].join('\n'), 'x.ts');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[6, 'emoji']]);
});

test('JSON string values are scanned', () => {
  const found = scanSource('{\n  "title": "Park day \u{1F3A2}",\n  "ok": "plain"\n}', 'x.json');
  assert.deepEqual(found.map(f => [f.line, f.kind]), [[2, 'emoji']]);
});

test('player-visible copy report (report mode until integration)', t => {
  const { files, totals } = scanApp();
  const shipped = files.filter(file => !file.devOnly);
  t.diagnostic(`UI copy report: ${totals.emoji} emoji, ${totals.emdash} em dash, ${totals.glyph} glyph, ${totals.phrase} phrase in ${shipped.length} shipped files${STRICT ? ' (STRICT)' : ' (report mode)'}`);
  for (const file of files) {
    const counts = {};
    for (const finding of file.findings) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
    const summary = Object.entries(counts).map(([kind, count]) => `${kind} ${count}`).join(', ');
    const first = file.findings.find(finding => STRICT_KINDS.includes(finding.kind)) ?? file.findings[0];
    t.diagnostic(`${file.devOnly ? '[dev] ' : ''}${file.file}: ${summary} (first: line ${first.line} "${first.text}")`);
  }
  if (STRICT) {
    const offenders = shipped.flatMap(file => file.findings
      .filter(finding => STRICT_KINDS.includes(finding.kind))
      .map(finding => `${file.file}:${finding.line} ${finding.kind} "${finding.text}"`));
    assert.deepEqual(offenders, [], 'player-visible copy has emoji, em dashes or glyph icons');
  }
});

test('server-sent display strings report (set UI_COPY_BACKEND to a backend checkout)', t => {
  const backend = process.env.UI_COPY_BACKEND;
  if (!backend) {
    t.diagnostic('Server strings not scanned: set UI_COPY_BACKEND=<backend checkout>. A clean scan is required before STRICT flips.');
    return;
  }
  const { files, totals } = scanBackend(backend);
  t.diagnostic(`Server strings: ${totals.emoji} emoji, ${totals.emdash} em dash in ${files.length} backend files${STRICT ? ' (STRICT)' : ' (report mode)'}`);
  for (const file of files) {
    t.diagnostic(`${file.file}: ${file.findings.length} (first: line ${file.findings[0].line} "${file.findings[0].text}")`);
  }
  if (STRICT) {
    const offenders = files.flatMap(file => file.findings.map(finding => `${file.file}:${finding.line} ${finding.kind} "${finding.text}"`));
    assert.deepEqual(offenders, [], 'server-sent display strings have emoji or em dashes');
  }
});
