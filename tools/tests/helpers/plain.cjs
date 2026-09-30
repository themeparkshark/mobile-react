'use strict';
/**
 * plain(value): copy a value produced inside a `vm` context (or any other realm)
 * into plain objects of THIS realm, so `assert.deepStrictEqual` compares shape
 * and values instead of failing on foreign Object/Array prototypes.
 *
 * Unlike `JSON.parse(JSON.stringify(value))` it keeps `undefined`, `NaN`,
 * `-0`, Dates, Maps and Sets, and it refuses functions and cycles loudly, so a
 * test never passes because a field was silently dropped.
 */
function plain(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') throw new TypeError('plain(): functions cannot be compared as data');
    return value;
  }
  if (seen.has(value)) throw new TypeError('plain(): cyclic value');
  seen.add(value);
  try {
    const tag = Object.prototype.toString.call(value);
    if (tag === '[object Date]') return new Date(value.getTime());
    if (tag === '[object Map]') return new Map([...value].map(([k, v]) => [plain(k, seen), plain(v, seen)]));
    if (tag === '[object Set]') return new Set([...value].map(v => plain(v, seen)));
    if (Array.isArray(value)) return Array.from(value, item => plain(item, seen));
    const out = {};
    for (const key of Object.keys(value)) out[key] = plain(value[key], seen);
    return out;
  } finally {
    seen.delete(value);
  }
}

module.exports = { plain };
