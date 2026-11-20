// T1 (arcade plan, Nov 20 2026): a ride's price drawn as 1 to 3 Ticket pictures,
// filled for Tickets held and outlined for Tickets short.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const model = loadTs('src/components/tickets/ticketPipsModel.ts');
const RN = { Image: 'Image', View: 'View', Text: 'Text', StyleSheet: { create: s => s } };
const pips = loadTs('src/components/tickets/TicketPips.tsx', {
  'react-native': RN,
  '../../ui/tokens': { BRAND: { navy: '#05346e', cream: '#fff8e4', white: '#ffffff' }, FONT: { display: 'Shark' } },
  './ticketPipsModel': model,
  '../../../assets/images/ticket-icon.png': 1,
});
const TicketPips = pips.default;

function walk(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(n => walk(n, out)); return out; }
  out.push(node);
  walk(node.props && node.props.children, out);
  return out;
}
const pipViews = tree => tree.props.children[0];
const isOutline = pip => Array.isArray(pip.props.children.props?.children)
  || (pip.props.children.type === 'Fragment');

for (const price of [1, 2, 3]) {
  for (let held = 0; held <= 4; held += 1) {
    test(`price ${price} with ${held} held draws ${price} pips, ${Math.min(price, held)} filled`, () => {
      const m = model.ticketPipsModel(price, held);
      assert.equal(m.pips.length, price);
      assert.equal(m.filled, Math.min(price, held));
      assert.equal(m.short, Math.max(0, price - held));
      assert.equal(m.canPay, held >= price);
      assert.equal(m.label, `${price} Ticket${price === 1 ? '' : 's'}, you have ${held}`);
      for (const size of ['island', 'card', 'button']) {
        const tree = TicketPips({ price, held, size });
        assert.equal(tree.props.accessibilityLabel, m.label);
        const views = pipViews(tree);
        assert.equal(views.length, price);
        const outlined = views.filter(isOutline).length;
        assert.equal(outlined, Math.max(0, price - Math.min(price, held)), `${size} outlines`);
        // Every pip is the same size at every price: no growth or glow for a bigger ride.
        const widths = new Set(views.map(v => v.props.style.width));
        assert.equal(widths.size, 1);
        assert.equal([...widths][0], model.TICKET_PIP_WIDTH[size]);
      }
    });
  }
}

test('a missing or broken price hides the pips (no guessed 1)', () => {
  for (const bad of [undefined, null, 0, -1, 'x', NaN, '']) {
    assert.equal(model.ticketPipsModel(bad, 2), null);
    assert.equal(TicketPips({ price: bad, held: 2 }), null);
  }
});

test('an unknown wallet draws the price filled with a plain label', () => {
  const m = model.ticketPipsModel(3);
  assert.equal(m.filled, 3);
  assert.equal(m.label, '3 Tickets');
});

test('the number beside the pictures reads "1 of 3" when short and the price when covered', () => {
  const short = walk(TicketPips({ price: 3, held: 1, showNumber: true })).find(n => n.type === 'Text');
  assert.equal(short.props.children, '1 of 3');
  const covered = walk(TicketPips({ price: 2, held: 5, showNumber: true })).find(n => n.type === 'Text');
  assert.equal(covered.props.children, '2');
});

test('the pips never glow, sparkle or change color by price', () => {
  const src = read('src/components/tickets/TicketPips.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /glow|sparkle|shimmer|Reanimated|withRepeat/i);
  assert.doesNotMatch(src, /price\s*===?\s*3|price\s*>=?\s*3/);
});
