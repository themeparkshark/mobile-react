/**
 * Pulls player-facing strings out of one .ts/.tsx/.json file with the
 * TypeScript AST. Shared by the inventory script and the clarity test.
 *
 * What counts as player-facing:
 *  - JSX text children
 *  - string/template literals passed as a JSX prop whose name says copy
 *    (title, message, label, body, hint, placeholder, accessibilityLabel...)
 *  - literals inside {...} JSX children (ternaries, ||)
 *  - arguments to Alert.alert, showToast, gameAlert, showGameDialog,
 *    confirmGame, askGrownUp, toast.show
 *  - object properties whose key says copy (title:, message:, body:...)
 *  - every string value in src/api/defaults/crumbs.json
 * Template literals keep their text with ${...} shown as {x}.
 */
const fs = require('fs');
const ts = require('typescript');

const COPY_KEY = /^(title|subtitle|subTitle|heading|header|eyebrow|kicker|label|labels|text|message|messages|body|copy|line|lines|hint|tip|tips|note|caption|description|desc|blurb|tagline|placeholder|cta|ctaLabel|ctaText|button|buttonLabel|buttonText|confirmLabel|cancelLabel|primaryLabel|secondaryLabel|confirmText|cancelText|okLabel|actionLabel|accessibilityLabel|accessibilityHint|emptyText|emptyTitle|emptyBody|errorText|errorMessage|toast|toastText|reason|prompt|question|answer|what|earn|why|how|detail|details|summary|headline|sub|subline|footer|footnote|warning|banner|chip|pill|badge|status|statusText|helper|helperText|intro|outro|teaser|bubble|say|says|speech|finnLine|price|priceLabel|costLabel|rewardLabel|name)$/i;
const CALLS = /^(Alert\.alert|showToast|gameAlert|showGameDialog|confirmGame|askGrownUp|toast\.show|toast|notify|pushToast|enqueueToast|showBanner|setError|setMessage|setToast|setStatus|setNotice|setHint|setLine|announceForAccessibility|AccessibilityInfo\.announceForAccessibility)$/;

const DEV = /(^|\/)(dev|demo|__tests__|__mocks__)\/|src\/gamekit\/audio\/|Preview|Gym\.tsx$|Tester|devRoutes|DevJoystick|Demo\.tsx$|EvidenceScreen|\.test\.|\.d\.ts$|\/fixtures?\//;
function isDevFile(rel) { return DEV.test(rel); }

function areaOf(file) {
  const f = file.toLowerCase();
  const tests = [
    ['purchase:supplies', /supplies|storekit|iap|purchas/],
    ['purchase:vip', /membership|vip|paywall|subscri/],
    ['purchase:secret-shop', /secret/],
    ['purchase:shop', /storescreen|shop|store|wishlist|wardrobe|catalog|closet|inventory|usepurchaseitem|redeemmodal|item\.tsx/],
    ['purchase:pins', /pin/],
    ['purchase:ride-photo', /ridephoto|ride-photo|photo/],
    ['gate', /grownup|grown-up|parent/],
    ['onboarding', /welcome|onboard|tutorial|howtoplay|help\/|intro|splash|auth|signin|login|permission|push|location/],
    ['social', /social|thread|forum|friend|comment|composer|compose|chat|report|block|notif/],
    ['rewards', /reward|reveal|chest|gift|celebrat|levelup|level-up|stamp|set|collection|shelf|coin/],
    ['crumbs', /crumbs\.json/],
    ['map', /explore|map|park|ride|lineplay|queue|boss|fright|home/],
    ['games', /games?\/|minigame|gamekit/],
  ];
  for (const [a, re] of tests) if (re.test(f)) return a;
  return 'other';
}

function looksLikeCopy(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (/^[a-z0-9]+([_.\-\/:][a-z0-9]+)+$/i.test(t) && !/\s/.test(t)) return false; // keys, paths
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;                                 // identifiers
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (/^(https?:|mailto:|tel:|data:|rgba?\()/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 1 && /_/.test(t)) return false;           // CONSTANTS
  if (/^(flex|row|column|center|absolute|relative|bold|normal|none|auto|cover|contain|stretch|hidden|visible|transparent|ios|android|web|light|dark|default|primary|secondary|small|medium|large|left|right|top|bottom|middle|space-between|space-around|wrap|nowrap|italic|uppercase|lowercase|sentences|words|characters|done|next|go|send|search|numeric|email-address|phone-pad|decimal-pad|number-pad|ease|linear|spring|timing|button|header|text|image|link|none|adjustable|summary|alert|menu|tab|tablist|progressbar|switch|checkbox|radio|imagebutton|keyboardkey|togglebutton)$/i.test(t)) return false;
  return true;
}

function litText(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      const expr = span.expression.getText(sf).replace(/\s+/g, ' ');
      const short = expr.length > 24 ? 'x' : expr.replace(/^.*\./, '');
      s += '{' + short + '}' + span.literal.text;
    }
    return s;
  }
  return null;
}

function nameOf(n) {
  if (!n) return '';
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) return '';
  return '';
}

function calleeName(expr, sf) {
  return expr.getText(sf).replace(/\s+/g, '');
}

/** Collect literals reachable through ?:, ||, ??, +, parens, arrays. */
function literalsIn(node, sf, out) {
  if (!node) return out;
  const t = litText(node, sf);
  if (t != null) { out.push({ node, text: t }); return out; }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return literalsIn(node.expression, sf, out);
  if (ts.isConditionalExpression(node)) { literalsIn(node.whenTrue, sf, out); literalsIn(node.whenFalse, sf, out); return out; }
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
    literalsIn(node.right, sf, out); if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) literalsIn(node.left, sf, out); return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    // Join a string concat into one line.
    const parts = [];
    (function flat(n) {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(n.left); flat(n.right); return; }
      const lt = litText(n, sf); parts.push(lt != null ? lt : '{x}');
    })(node);
    const joined = parts.join('');
    if (/[A-Za-z]{2,}/.test(joined.replace(/\{x\}/g, ''))) out.push({ node, text: joined });
    return out;
  }
  if (ts.isArrayLiteralExpression(node)) { node.elements.forEach(e => literalsIn(e, sf, out)); return out; }
  return out;
}

function extractSource(text, rel, kindHint, loose = false) {
  const rows = [];
  if (rel.endsWith('.json')) {
    if (!/crumbs\.json$|copy|strings|i18n|locale/i.test(rel)) return rows;
    const json = JSON.parse(text);
    const lines = text.split('\n');
    (function w(v, keyPath) {
      if (typeof v === 'string') {
        if (!looksLikeCopy(v) || /^https?:/.test(v)) return;
        const ln = lines.findIndex(l => l.includes(JSON.stringify(v).slice(1, 30))) + 1;
        rows.push({ file: rel, line: ln, kind: 'crumb:' + keyPath, text: v });
      } else if (Array.isArray(v)) v.forEach((x, i) => w(x, keyPath + '[' + i + ']'));
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) w(v[k], keyPath ? keyPath + '.' + k : k);
    })(json, '');
    return rows;
  }
  // `// clarity-allow: why` on the literal's line, or the line just above it, skips the loose sweep.
  const lines = text.split('\n');
  const allowed = node => {
    const ln = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
    return /clarity-allow/.test(lines[end] || '') || /clarity-allow/.test(lines[ln - 1] || '') || /clarity-allow/.test(lines[ln] || '');
  };
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seen = new Set();
  const push = (node, txt, kind) => {
    const key = node.pos + ':' + txt;
    if (seen.has(key)) return;
    seen.add(key);
    const clean = txt.replace(/\s+/g, ' ').trim();
    if (!looksLikeCopy(clean)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    rows.push({ file: rel, line, kind, text: clean });
  };
  function visit(node) {
    if (ts.isJsxText(node)) {
      const t = node.getText(sf).replace(/\s+/g, ' ').trim();
      if (t) push(node, t, 'jsx');
    } else if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const l of literalsIn(node.expression, sf, [])) push(l.node, l.text, 'jsx');
    } else if (ts.isJsxAttribute(node)) {
      const nm = nameOf(node.name);
      // A JSX `name` is a route (<Stack.Screen name>) or an icon (<GameIcon name>), never copy.
      if (nm !== 'name' && (COPY_KEY.test(nm) || /(Label|Text|Title|Message|Copy|Hint|Line|Body)$/.test(nm))) {
        const init = node.initializer;
        if (init && ts.isStringLiteral(init)) push(init, init.text, 'prop:' + nm);
        else if (init && ts.isJsxExpression(init) && init.expression) for (const l of literalsIn(init.expression, sf, [])) push(l.node, l.text, 'prop:' + nm);
      }
    } else if (ts.isCallExpression(node)) {
      const cn = calleeName(node.expression, sf);
      if (CALLS.test(cn) || /(^|\.)(alert|confirm|toast|notify|announce)$/i.test(cn)) {
        for (const a of node.arguments) for (const l of literalsIn(a, sf, [])) push(l.node, l.text, 'call:' + cn);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const nm = nameOf(node.name);
      if (COPY_KEY.test(nm) || /(Label|Text|Title|Message|Copy|Hint|Line|Body|Lines)$/.test(nm)) {
        for (const l of literalsIn(node.initializer, sf, [])) push(l.node, l.text, 'prop:' + nm);
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      const nm = nameOf(node.name);
      if (/(COPY|LINES?|TEXT|MESSAGES?|TITLES?|LABELS?|HINTS?|TIPS|FACTS|STRINGS|_BODY|_TITLE)$/i.test(nm) || /(Copy|Lines|Text|Message|Title|Label|Hint|Tips|Body)$/.test(nm)) {
        for (const l of literalsIn(node.initializer, sf, [])) push(l.node, l.text, 'var:' + nm);
      }
    } else if (ts.isReturnStatement(node) && node.expression) {
      // Copy helpers: functions named *Copy/*Line/*Label/*Message/*Title that return text.
      let fn = node.parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const fnName = fn && fn.name ? nameOf(fn.name) : (fn && fn.parent && ts.isVariableDeclaration(fn.parent) ? nameOf(fn.parent.name) : '');
      if (/(copy|line|label|message|title|text|hint|caption|body|toast|reason|prompt|subtitle|headline|blurb|explain|describe|why)/i.test(fnName)) {
        for (const l of literalsIn(node.expression, sf, [])) push(l.node, l.text, 'ret:' + fnName);
      }
    }
    else if (loose && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
      // Loose sweep: any sentence-like literal not caught above (.push() lines, lookup tables,
      // rich-text children). Skips imports, property names, console/log/require/Error calls.
      const p = node.parent;
      const skip = !p || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)
        || (ts.isPropertyAssignment(p) && p.name === node) || ts.isLiteralTypeNode(p) || ts.isElementAccessExpression(p)
        || (ts.isCallExpression(p) && /^(console\.|require$|log$|logger|Sentry|captureException|track|telemetry|new Error)/.test(calleeName(p.expression, sf)))
        || ts.isNewExpression(p) || allowed(node);
      const t = litText(node, sf);
      if (!skip && t && /[A-Za-z]{2,}[ ,.!?'’][^]*[A-Za-z]{2,}/.test(t) && /\s/.test(t)) push(node, t, 'loose');
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return rows;
}

function extractFile(file, rel, loose = false) {
  return extractSource(fs.readFileSync(file, 'utf8'), rel, undefined, loose);
}

module.exports = { extractFile, extractSource, isDevFile, areaOf, looksLikeCopy };
