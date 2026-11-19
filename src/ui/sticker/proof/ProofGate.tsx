/**
 * Proof screen (dev gallery only): the grown-up gate as board/pick/6-gate. A Dialog (the kit's
 * floating page with the title label and Alex's upright lock) over the Shark Shop's title bar:
 * one card, one line, the answer box as spots, 12 cream keys, one gold OK, and the wave foot
 * holding "Not now". Calm and bright, the same family as Rewards.
 * Built from kit parts only; sample question, not wired to any real purchase.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Row, Stack } from '../Arrange';
import Card from '../Card';
import Dialog from '../Dialog';
import Glyph from '../Glyph';
import Screen from '../Screen';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import { Body, Caps, Heading, Name } from '../Text';
import { GATE, SPACE } from '../tokens';
import { gatePress, gateSpots } from './proofData';

const ANSWER = '297';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;
const noop = () => undefined;

export default function ProofGate() {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const press = useCallback((key: string) => {
    if (key === 'ok') {
      if (typed !== ANSWER) { setTyped(''); return; }
      setBusy(true);
      setTimeout(() => { setBusy(false); setTyped(''); }, 1400);
      return;
    }
    setTyped(t => gatePress(t, key, ANSWER.length));
  }, [typed]);
  const spots = gateSpots(typed, ANSWER.length);
  return (
    <Screen header={{ title: 'SHARK SHOP', onBack: noop, onHelp: noop }} testID="proof-gate">
      <Dialog visible label={{ text: 'Ask a grown-up', large: true, art: 'lock' }} wayOut={{ label: 'Not now', onPress: noop }} testID="proof-gate-dialog">
        <Card padding="snug">
          <Row gap="card">
            <Glyph kind="money" size={27} />
            <View style={{ flex: 1 }}>
              <Name fit lines={1}>This costs real money.</Name>
              <Body size="small" soft align="left">A grown-up sees the details next.</Body>
            </View>
          </Row>
        </Card>
        <Body style={{ marginTop: SPACE.cardGapLoose }}>Hand the phone to a grown-up.</Body>
        <Caps align="center" style={{ marginTop: SPACE.base * 2 }}>Grown-up question</Caps>
        <Heading style={{ marginTop: SPACE.base }}>thirty-three times nine</Heading>
        <View accessible accessibilityRole="text" accessibilityLabel={`Answer, ${typed.length} of ${ANSWER.length} digits`}
          style={{ marginTop: SPACE.base * 2, marginBottom: SPACE.cardGap }}>
          <Row justify="center" gap="card">
            {spots.map((s, i) => <Spot key={i} state={s.state} glyph={s.glyph ?? undefined} size={GATE.spot} />)}
          </Row>
        </View>
        <Stack gap="tight">
          {[0, 1, 2, 3].map(row => (
            <Row key={row} gap="loose">
              {KEYS.slice(row * 3, row * 3 + 3).map(key => key === 'ok'
                ? <StickerButton key={key} label="OK" accessibilityLabel="OK, check the answer" variant="primary" size="key" busy={busy} style={{ flex: 1 }} onPress={() => press(key)} />
                : key === 'del'
                  ? <StickerButton key={key} label="Delete" variant="key" size="key" glyph={<Glyph kind="delete" size={22} />} style={{ flex: 1 }} onPress={() => press(key)} />
                  : <StickerButton key={key} label={key} variant="key" size="key" style={{ flex: 1 }} onPress={() => press(key)} />)}
            </Row>
          ))}
        </Stack>
      </Dialog>
    </Screen>
  );
}
