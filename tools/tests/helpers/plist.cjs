// Minimal XML property list reader so the native-config tests run on Linux CI
// (no plutil). Supports dict, array, string, integer, real, true, false, date.
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./load-ts.cjs');

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parsePlist(xml) {
  const tokens = xml
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '')
    .match(/<[^>]+>|[^<]+/g)
    .filter(t => t.trim() !== '' || false);
  let i = 0;
  const next = () => tokens[i++];
  const text = close => {
    let out = '';
    while (tokens[i] !== close) out += tokens[i++];
    i++;
    return decode(out);
  };
  function value() {
    const tag = next().trim();
    if (tag === '<dict/>') return {};
    if (tag === '<array/>') return [];
    if (tag === '<string/>') return '';
    if (tag === '<true/>') return true;
    if (tag === '<false/>') return false;
    if (tag === '<string>') return text('</string>');
    if (tag === '<date>') return text('</date>');
    if (tag === '<integer>') return Number(text('</integer>'));
    if (tag === '<real>') return Number(text('</real>'));
    if (tag === '<array>') {
      const out = [];
      while (tokens[i].trim() !== '</array>') out.push(value());
      i++;
      return out;
    }
    if (tag === '<dict>') {
      const out = {};
      while (tokens[i].trim() !== '</dict>') {
        if (next().trim() !== '<key>') throw new Error('plist: expected <key>');
        const key = text('</key>');
        out[key] = value();
      }
      i++;
      return out;
    }
    throw new Error(`plist: unsupported tag ${tag}`);
  }
  while (tokens[i] && tokens[i].trim() !== '<plist version="1.0">' && !tokens[i].startsWith('<plist')) i++;
  i++;
  return value();
}

const readPlist = file => parsePlist(fs.readFileSync(path.join(root, file), 'utf8'));

module.exports = { parsePlist, readPlist };
