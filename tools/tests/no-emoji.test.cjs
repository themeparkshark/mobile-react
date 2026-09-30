'use strict';
/**
 * No-emoji and no-em-dash gate for player-visible copy (owned by WS0).
 *
 * REPORT MODE (today): prints offender counts per file and never fails.
 * STRICT MODE: flip STRICT to true (WS0 does this at integration, before any
 * external build) or run with UI_COPY_STRICT=1 to preview it. Strict fails on
 * emoji and em dashes in shipped files; glyph icons and third-party phrases
 * stay report-only. Dev-only preview and tester screens are listed but never
 * fail the gate.
 *
 * Fix an offender by using <GameIcon>, <GameRichText> '[icon:name]' tokens, or
 * a comma. For a real exception (a storage key that is never rendered), put
 *   // ui-copy-allow(emoji): why
 * on the line above. There is no shared allowlist file on purpose.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { scanSource, scanApp, STRICT_KINDS } = require('./helpers/ui-copy-rules.cjs');
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
    assert.deepEqual(offenders, [], 'player-visible copy has emoji or em dashes');
  }
});
