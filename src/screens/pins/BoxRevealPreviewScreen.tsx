/**
 * Dev-only capture of the box openings (never routed in release): a regular mystery box, the Golden Box
 * and the chaser pull, so the shared gold (ui/GoldBurst) and the capped flash can be recorded on device.
 * The scratch server has no pins, so the pin face is a ride-coin picture from the CDN.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import BoxReveal, { type RevealPull } from './BoxReveal';
import type { BoxTone } from './PinArt';

const ART = 'https://assets.themeparkshark.com/mobile/production/assets/r6pPIyzacnukCvbqkMqjqEB8BczIujFYwhc4YDYB.png';
const pull = (over: Partial<RevealPull>): RevealPull => ({
  id: 1, item_id: 1, pin_id: 1, name: 'Rocket Ride Pin', icon_url: ART, is_chaser: false, by_pity: false, serial: null, duplicate: false, ...over,
});

const KINDS: Record<string, { tone: BoxTone; golden: boolean; pulls: RevealPull[] }> = {
  box: { tone: 'blue', golden: false, pulls: [pull({})] },
  golden: { tone: 'gold', golden: true, pulls: [pull({ id: 2, golden: true })] },
  chaser: { tone: 'blue', golden: false, pulls: [pull({ id: 3, is_chaser: true, serial: 3, name: 'Gold Rocket Pin' })] },
};

/** Release-like capture (EXPO_PUBLIC_MOTION_CAPTURE): the boxes open one after another on their own, over any screen. */
const CAPTURE = process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'BoxRevealPreview';
const ORDER = ['chaser', 'golden', 'box'];

export default function BoxRevealPreviewScreen() {
  const [kind, setKind] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const open = kind ? KINDS[kind] : null;
  useEffect(() => {
    if (!CAPTURE) return undefined;
    const t = setTimeout(() => { setKind(ORDER[0]); setRun(r => r + 1); }, 6000);
    return () => clearTimeout(t);
  }, []);
  const done = () => {
    const next = CAPTURE && kind ? ORDER[(ORDER.indexOf(kind) + 1) % ORDER.length] : null;
    setKind(null);
    if (next) setTimeout(() => { setKind(next); setRun(r => r + 1); }, 1500);
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#0768b9', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      {Object.keys(KINDS).map(name => (
        <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Open ${name}`}
          onPress={() => { setKind(name); setRun(r => r + 1); }}
          style={{ backgroundColor: '#ffcf3b', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 30 }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 22, color: '#05346e' }}>{name.toUpperCase()}</Text>
        </Pressable>
      ))}
      {open && <BoxReveal key={run} pulls={open.pulls} tone={open.tone} golden={open.golden} still={false}
        onDone={done} />}
    </View>
  );
}
