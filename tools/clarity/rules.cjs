/**
 * The clarity rules every player-facing line is held to.
 *
 * Bar: a 10-year-old reads it once and knows what happened and what to tap.
 * About a 2nd to 4th grade reading level, short sentences, everyday words.
 *
 * GLOSSARY: one name per thing. `use` is the only name; `never` lists the
 * other spellings that must not appear in player copy.
 * JARGON: words a kid would not know. Banned in player copy.
 * PRESSURE: hurry and guilt lines. Banned in player copy.
 */

const GLOSSARY = [
  { key: 'coins', use: 'coins', what: 'What you spend in the Shark Shop. Gold coin icon.',
    never: [/\bShark Coins?\b/, /\bShark Bucks\b/i, /\bgold coins?\b/i, /\bgems?\b/i] },
  { key: 'ride_coins', use: 'ride coins', what: 'The coin you win at a ride and keep on your shelf. Not money.',
    never: [/\bpark coins?\b/i, /\btask coins?\b/i] },
  { key: 'tickets', use: 'tickets', what: 'One ticket plays one ride challenge. Ticket icon.',
    never: [/\bPark Tickets?\b/] },
  { key: 'energy', use: 'energy', what: 'Powers boss raids and coin level-ups. Lightning icon.',
    never: [/\bstamina\b/i] },
  { key: 'xp', use: 'XP', what: 'Points that raise your shark level. Star icon.',
    never: [/\bEXP\b/, /\bexperience points?\b/i] },
  { key: 'ride_parts', use: 'Ride Parts', what: 'Belong to one ride. Level up that ride coin.', never: [/\bLinePlay Parts\b/i] },
  { key: 'vip', use: 'VIP', what: 'The monthly grown-up purchase that boosts rewards. A VIP member is a player who has it.',
    never: [/\bVIP Membership\b/, /\bmembership\b/i, /\bPremium\b/, /\bShark Club\b/i, /(^|[^P] )\bMembers? (only|can|get)\b/] },
  { key: 'supplies', use: 'Supplies', what: 'Packs a grown-up buys with real money. Always say "real money".', never: [/\bIAPs?\b/, /\bin-app purchases?\b/i, /\bconsumables?\b/i] },
  { key: 'secret_shop', use: 'Secret Shop', what: 'The VIP-only corner of the Shark Shop.', never: [/\bSecret Store\b/i] },
  { key: 'closet', use: 'closet', what: 'Where every item you own lives.', never: [/\binventory\b/i, /\bwardrobe\b/i, /\bdressing room\b/i] },
  { key: 'grown_up', use: 'grown-up', what: 'The adult who checks real-money buys.', never: [/\bguardian\b/i, /\bparents?\b/i, /\bparental\b/i, /\bgrownup\b/i, /\bgrown up\b/i] },
  { key: 'wishlist', use: 'Favorites', what: 'Items you saved for later (claude/secret-shop-app renames Wishlist to Favorites).', never: [/\bwish list\b/i, /\bwatchlist\b/i] },
];

const JARGON = [
  /\brotations?\b/i, /\bcatalog edition\b/i, /\bfx\b/i, /\ballocations?\b/i, /\bcurrency\b/i, /\bcurrencies\b/i,
  /\bredeemables?\b/i, /\bentitlements?\b/i, /\bSKUs?\b/, /\btransactions?\b/i, /\bsynced?\b/i, /\bsyncing\b/i,
  /\bserver\b/i, /\bAPI\b/, /\bendpoint\b/i, /\bpayload\b/i, /\bcooldown\b/i, /\bRNG\b/, /\bdrop rate\b/i,
  /\bmultiplier\b/i, /\btiers?\b/i, /\berror code\b/i, /\bstatus code\b/i, /\bnull\b/, /\bundefined\b/,
  /\bparameters?\b/i, /\bauthenticat/i, /\bauthoriz/i, /\binstance\b/i, /\bmetadata\b/i, /\blapsed?\b/i,
  /\bunequip/i, /\bprorat/i, /\binvalid\b/i, /\bexceeded\b/i, /\binsufficient\b/i, /\beligib/i, /\butiliz/i,
  /\bensure\b/i, /\bproceed\b/i, /\bacquired?\b/i, /\bobtain/i, /\bcommence/i, /\bterminat/i, /\bconnectivity\b/i,
  /\binitializ/i, /\bconfigur/i, /\bvalidat/i, /\bmoderators?\b/i, /\binappropriate\b/i, /\bnotable\b/i,
  /\bverified\b/i, /\bunderdog\b/i, /\breactioned\b/i, /\bsubsequent/i, /\bperk\b/i, /\bapprox/i, /\bvia\b/i, /\betc\b/i,
  /\bi\.e\.|\be\.g\./i, /\bpurchas/i, /\bmonetiz/i, /\boffline mode\b/i, /\bre-?mint/i, /\bcanonical\b/i, /\bslug\b/i,
];

const PRESSURE = [
  /\bhurry\b/i, /\blast chance\b/i, /\bdon'?t miss\b/i, /\bmiss out\b/i, /\bbefore it'?s gone\b/i, /\bact now\b/i,
  /\bonly \d+ left\b/i, /\blimited time\b/i, /\byou'?ll lose\b/i, /\bare you sure you want to leave\b/i,
  /\bdon'?t you want\b/i, /\bfriends are waiting\b/i, /\bwhile (supplies|stocks?) last\b/i, /\bselling fast\b/i,
  /\bbuy now\b/i, /\bgoing fast\b/i, /\bno thanks, I\b/i, /\bI don'?t want\b/i, /\bat risk\b/i,
];

// Lines that may keep a banned word because a store or the law says so.
const ALLOW = [
  /Apple ID/i,                      // App Store subscription terms
  /^Restore purchases$/i,           // Apple's own name for the restore button
  /Terms of Service|Privacy Policy/i,
  /988|Childhelp|Crisis|crisis/i,   // safety lines stay exactly as is
];

const COMMON_HARD = /\b(\w{13,})\b/;

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/** Flesch-Kincaid grade. Short UI labels score low by nature. */
function grade(text) {
  const clean = text.replace(/\{[^}]*\}/g, 'it').replace(/%s/g, 'it');
  const sentences = clean.split(/[.!?]+\s|[.!?]+$/).filter(s => /[A-Za-z]/.test(s));
  const words = clean.match(/[A-Za-z']+/g) || [];
  if (!words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const sc = Math.max(1, sentences.length);
  return 0.39 * (words.length / sc) + 11.8 * (syl / words.length) - 15.59;
}

function longestSentence(text) {
  return Math.max(0, ...text.split(/[.!?]+(\s|$)/).map(s => (s.match(/[A-Za-z']+/g) || []).length));
}

/** Returns { score 1..5, flags[] }. 5 = a 10-year-old reads it once. */
function score(text) {
  const flags = [];
  const allowed = ALLOW.some(re => re.test(text));
  for (const re of JARGON) if (re.test(text) && !allowed) flags.push('jargon:' + (text.match(re) || [''])[0].toLowerCase());
  for (const g of GLOSSARY) for (const re of g.never) if (re.test(text) && !allowed) flags.push('term:' + g.key + '=' + (text.match(re) || [''])[0]);
  for (const re of PRESSURE) if (re.test(text)) flags.push('pressure:' + (text.match(re) || [''])[0].toLowerCase());
  if (/—/.test(text)) flags.push('emdash');
  const words = (text.match(/[A-Za-z']+/g) || []).length;
  const g = grade(text);
  const longS = longestSentence(text);
  if (words >= 6 && g > 6) flags.push('grade:' + g.toFixed(1));
  if (longS > 16 && !allowed) flags.push('long-sentence:' + longS);
  if (/\b(Whoops|Oops)! Something went wrong\.?$/i.test(text) || /^Something went wrong\.?$/i.test(text)) flags.push('error-no-next-step');
  if (/please try again or contact support/i.test(text)) flags.push('error-no-next-step');
  if (/^Are you sure/i.test(text)) flags.push('are-you-sure');
  if (COMMON_HARD.test(text) && !allowed) flags.push('long-word:' + text.match(COMMON_HARD)[1]);
  let s = 5;
  const hard = flags.filter(f => /^(jargon|term|pressure|emdash|error-no-next-step)/.test(f)).length;
  const soft = flags.length - hard;
  s -= hard * 1.5 + soft * 0.75;
  return { score: Math.max(1, Math.round(s)), flags, grade: g };
}

/** Hard failures the test enforces (soft readability flags are audit-only). */
function hardViolations(text) {
  return score(text).flags.filter(f => /^(jargon|term|pressure|emdash)/.test(f));
}

module.exports = { GLOSSARY, JARGON, PRESSURE, ALLOW, score, grade, hardViolations };
