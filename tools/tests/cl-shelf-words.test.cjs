'use strict';
/**
 * Core loop wave, shelf-words lane (BLUEPRINT 4.4, 4.5, 5.4, 5.10, 5.11, 7, must-fix 4, 32, 35).
 * Runtime checks where the component runs under the reward-hook runtime, source
 * checks where a screen needs the whole app around it.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const coinTiers = loadTs('src/constants/coinTiers.ts');
const progressionModel = loadTs('src/components/coin/progressionModel.ts');
const progressionStubs = {
  '../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
  './coin/progressionModel': progressionModel,
  '../gamekit/Haptics': { queueHaptic() {} },
  '../audio/sfxLimiter': { playLimited: (_name, _request, play) => { play(); return true; }, SFX_PRIORITY: { whoosh: 1, tap: 2, land: 3 } },
  '../hooks/usePresentationQueue': { usePresentationSlot: () => ({ visible: false, done() {} }) },
};

function levelSheet(props) {
  const closes = [];
  const view = runtime('src/components/CoinLevelingModal.tsx', {
    '../share/devDrive': { useDevAutoPress() {} }, '../share/handoff': { useModalHandoff: () => ({ handoff: async () => {}, onDismiss() {} }) },
    '../context/AuthProvider': { AuthContext: { value: { refreshPlayer: async () => {} } } },
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound() {} } } },
    '../hooks/useReducedGameMotion': { default: () => true },
    '../helpers/haptics': { impactAsync() {}, notificationAsync() {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    '../constants/coinTiers': coinTiers,
    ...progressionStubs,
  }, { visible: true, rideCoin: { id: 13, ride_name: 'Jungle Cruise', current_level: 1, max_level: 5,
    is_unlocked: true, parts_to_next_level: 3, energy_to_next_level: 10, next_level_perks: [], current_perks: [] },
  playerEnergy: 160, playerParts: 1, onClose() { closes.push(1); }, onLevelUp: async () => false, ...props });
  const partsButton = () => view.find(node => node.type === './YellowButton' && /Ride Part/.test(node.props.text ?? ''));
  const modal = () => view.find(node => node.type === 'react-native-modal');
  return { view, partsButton, modal, closes };
}

test('GET RIDE PARTS at the park points the guide at the ride and opens the map after the sheet hides (must-fix 4)', () => {
  let sent = 0;
  const sheet = levelSheet({ onGetParts() { sent++; } });
  assert.equal(sheet.partsButton().props.text, 'Get 2 Ride Parts');
  sheet.partsButton().props.onPress();
  assert.equal(sheet.closes.length, 1, 'the sheet closes');
  assert.equal(sent, 0, 'nothing navigates under a closing sheet');
  sheet.modal().props.onModalHide();
  assert.equal(sent, 1, 'the guide and map step runs once the sheet is gone');
  sheet.modal().props.onModalHide();
  assert.equal(sent, 1, 'only once');
});

test('GET RIDE PARTS away from the park opens a picture card in place (never a dead tap)', () => {
  const sheet = levelSheet({});
  const before = JSON.stringify(sheet.view.tree);
  sheet.partsButton().props.onPress();
  sheet.view.render();
  const card = sheet.view.find(node => typeof node.props?.accessibilityLabel === 'string' && /stand in its line/i.test(node.props.accessibilityLabel));
  assert.ok(card, 'a visible card says where Parts come from');
  assert.notEqual(JSON.stringify(sheet.view.tree), before, 'the screen changed');
  assert.equal(sheet.closes.length, 0);
});

test('the coin card wires GET RIDE PARTS to guide.setTarget and the map path, and LinePlay never wears the pocket watch', () => {
  const card = read('src/components/TaskCoinModal.tsx');
  assert.match(card, /guide\.setTarget\(task\.id, 'coin_parts'\)/);
  assert.match(card, /onGetParts=\{onShowOnMap \?/);
  assert.doesNotMatch(card, /name="queue"/, 'the pocket watch means Wait Times only');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /onShowOnMap=\{\(section === 'normal' \|\| section === 'limited'\) && canChooseGoal && inThisPark/);
  assert.doesNotMatch(read('src/components/CoinLevelingModal.tsx'), /name="queue"/);
});
