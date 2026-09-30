'use strict';
/**
 * UI copy rules for the no-emoji gate (tools/tests/no-emoji.test.cjs).
 *
 * Only text a player can see is checked: string literals, template literal
 * chunks, JSX text and JSON string values. Comments, import paths, require()
 * paths and console.* arguments are ignored. Escapes are decoded first, so
 * '\u{1F988}' counts as the emoji it renders.
 *
 * Kinds:
 *   emoji  - any pictographic emoji, flag or keycap (strict gate)
 *   emdash - U+2014 in copy (strict gate)
 *   glyph  - dingbats used as icons, like an X, a check or a star (report only;
 *            use <GameIcon> instead)
 *   phrase - third-party phrases the plan removes from copy (report only)
 *
 * A deliberate exception lives next to the code, never in a shared list:
 *   // ui-copy-allow(emoji): saved reaction codes are storage keys, never rendered
 * on the same line as the string or on the line directly above it.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

const NOT_EMOJI = new Set(['©', '®', '™']);
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}⃣️]/gu;
const GLYPH_RE = /[✓✔✕✖✗✘★☆✦✧♪♫◆◇●○■□▲△▼▽↻⟳⟲➔➜→←]/gu;
const PHRASES = [
  /gotta catch/i,
  /\bjaws\b/i,
  /hogwarts/i,
  /gringotts/i,
  /harry potter/i,
];
const DEV_ONLY = [
  /PreviewScreen\.tsx$/,
  /MiniGameTesterScreen\.tsx$/,
  /GameKitGymScreen\.tsx$/,
  /src\/ui\/UiKitGym\.tsx$/,
  /src\/devRoutes\.tsx$/,
  /src\/utils\/standalonePreview\.ts$/,
];
const ALLOW_RE = /ui-copy-allow\(([a-z,\s]+)\)/;

function emojiIn(text) {
  const found = [];
  for (const match of text.matchAll(EMOJI_RE)) if (!NOT_EMOJI.has(match[0])) found.push(match[0]);
  return found;
}

/** Findings for one piece of visible text. */
function classify(text) {
  const kinds = [];
  if (emojiIn(text).length) kinds.push('emoji');
  if (text.includes('—')) kinds.push('emdash');
  if (GLYPH_RE.test(text)) kinds.push('glyph');
  GLYPH_RE.lastIndex = 0;
  if (PHRASES.some(re => re.test(text))) kinds.push('phrase');
  return kinds;
}

function isConsoleArgument(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'console') return true;
      if (ts.isIdentifier(callee) && callee.text === 'require') return true;
      return false;
    }
    if (ts.isStatement(parent)) return false;
  }
  return false;
}

function isModulePath(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent) && parent.parent && ts.isImportTypeNode(parent.parent)) return true;
  return ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function addKinds(kinds, text) {
  const match = text && ALLOW_RE.exec(text);
  if (match) match[1].split(',').map(kind => kind.trim()).filter(Boolean).forEach(kind => kinds.add(kind));
}

/**
 * Kinds allowed for a node: a pragma on its line or the line above, or a
 * pragma in the leading comment of any enclosing declaration (so one comment
 * covers a whole lookup table).
 */
function allowedKinds(node, sourceFile, lines, lineIndex) {
  const kinds = new Set();
  addKinds(kinds, lines[lineIndex]);
  addKinds(kinds, lines[lineIndex - 1]);
  const text = sourceFile.text;
  for (let current = node.parent; current && current !== sourceFile; current = current.parent) {
    for (const range of ts.getLeadingCommentRanges(text, current.getFullStart()) ?? []) {
      addKinds(kinds, text.slice(range.pos, range.end));
    }
  }
  return kinds;
}

/**
 * Scan source text. Returns [{ line, kind, text }], one entry per kind per
 * visible string, with the text trimmed to 60 characters for the report.
 */
function scanSource(source, fileName = 'file.tsx') {
  const isJson = fileName.endsWith('.json');
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX
    : fileName.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS;
  const sourceFile = isJson
    ? ts.parseJsonText(fileName, source)
    : ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  const findings = [];
  function report(node, text) {
    const kinds = classify(text);
    if (!kinds.length) return;
    const start = node.getStart(sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(start).line;
    const allowed = allowedKinds(node, sourceFile, lines, line);
    for (const found of kinds) {
      if (allowed.has(found)) continue;
      findings.push({ line: line + 1, kind: found, text: text.replace(/\s+/g, ' ').trim().slice(0, 60) });
    }
  }
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isModulePath(node) && !isConsoleArgument(node)) report(node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (!isConsoleArgument(node)) report(node, node.text);
    } else if (ts.isJsxText(node)) {
      report(node, node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      listFiles(full, out);
    } else if (/\.(tsx?|json)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan the app's src tree. Returns { files: [{ file, devOnly, findings }], totals }.
 */
function scanApp(root = ROOT) {
  const files = [];
  const totals = { emoji: 0, emdash: 0, glyph: 0, phrase: 0 };
  for (const full of listFiles(path.join(root, 'src')).sort()) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    const findings = scanSource(fs.readFileSync(full, 'utf8'), rel);
    if (!findings.length) continue;
    const devOnly = DEV_ONLY.some(re => re.test(rel));
    if (!devOnly) findings.forEach(finding => { totals[finding.kind] += 1; });
    files.push({ file: rel, devOnly, findings });
  }
  return { files, totals };
}

module.exports = { scanSource, scanApp, classify, emojiIn, STRICT_KINDS: ['emoji', 'emdash'] };
