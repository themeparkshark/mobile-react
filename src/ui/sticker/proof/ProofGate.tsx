/**
 * Proof screen 1 (dev gallery only): the grown-up gate as board/pick/6-gate. A floating page with
 * the title label and Alex's lock, one card, one line, the answer box as spots, 12 cream keys and
 * the wave foot holding "Not now". Calm and bright, the same family as Rewards.
 * Built from kit parts only; sample question, not wired to any real purchase.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../Card';
import Glyph from '../Glyph';
import GhostButton from '../GhostButton';
import Header, { headerContentTop } from '../Header';
import Overlay from '../Overlay';
import Page from '../Page';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import StickerText from '../StickerText';
import WaveFoot from '../WaveFoot';
import { ART, ART_RATIO } from '../art';
import { GATE, INK, TYPE } from '../tokens';
import { gatePress, gateSpots } from './proofData';

const ANSWER = '297';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;
const FOOT = 58;
const LOCK_H = 66;
const noop = () => undefined;

export default function ProofGate() {
  const insets = useSafeAreaInsets();
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
    <View style={{ flex: 1, backgroundColor: INK.blue }}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Header title="SHARK SHOP" onBack={noop} onHelp={noop} />
      <Overlay contentTop={headerContentTop(insets.top)}>
        <Page floating arrive
          label={{ text: 'Ask a grown-up', large: true, left: 42, width: 212, art: { source: ART.locked, width: Math.round(LOCK_H * ART_RATIO.locked), height: LOCK_H, left: -24, top: -16, rotate: -6 } }}
          foot={<WaveFoot height={FOOT}><GhostButton label="Not now" onPress={noop} /></WaveFoot>} footHeight={FOOT}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 11 }}>
              <Glyph kind="money" size={27} />
              <View style={{ flex: 1 }}>
                <View style={{ paddingTop: 2 }}>
                  <StickerText size={17} tone="navy" stroke={0} spacing={0.03} align="left" lineHeight={19} fit>This costs real money.</StickerText>
                </View>
                <StickerText size={TYPE.bodySmall} font="knockout" fill={INK.navySoft} stroke={0} align="left" lineHeight={16} fit={false} lines={2}>A grown-up sees the details next.</StickerText>
              </View>
            </View>
          </Card>
          <View style={{ height: 14 }} />
          <StickerText size={TYPE.body} font="knockout" stroke={0} lineHeight={19} lines={2} fit={false}>Hand the phone to a grown-up.</StickerText>
          <View style={{ height: 8 }} />
          <StickerText size={TYPE.caps} font="knockout" tone="gold" stroke={0} spacing={0.11} lineHeight={14} role="none">GROWN-UP QUESTION</StickerText>
          <View style={{ height: 2 }} />
          <StickerText size={TYPE.heading} stroke={2.3} spacing={0.05} lineHeight={30}>thirty-three times nine</StickerText>
          <View accessible accessibilityRole="text" accessibilityLabel={`Answer, ${typed.length} of ${ANSWER.length} digits`}
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10, marginBottom: 14 }}>
            {spots.map((s, i) => <Spot key={i} state={s.state} glyph={s.glyph} size={GATE.spot} />)}
          </View>
          <View style={{ gap: GATE.rowGap - 4 }}>
            {[0, 1, 2, 3].map(row => (
              <View key={row} style={{ flexDirection: 'row', gap: GATE.keyGap }}>
                {KEYS.slice(row * 3, row * 3 + 3).map(key => key === 'ok'
                  ? <StickerButton key={key} label="OK" accessibilityLabel="OK, check the answer" color="gold" primary size="key" busy={busy} style={{ flex: 1 }} onPress={() => press(key)} />
                  : key === 'del'
                    ? <StickerButton key={key} label="Delete" color="key" size="key" glyph={<Glyph kind="delete" size={22} />} style={{ flex: 1 }} onPress={() => press(key)} />
                    : <StickerButton key={key} label={key} color="key" size="key" style={{ flex: 1 }} onPress={() => press(key)} />)}
              </View>
            ))}
          </View>
        </Page>
      </Overlay>
    </View>
  );
}
