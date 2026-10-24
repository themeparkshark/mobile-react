/**
 * Dev-only capture of the Shark Pass wear-first reward card (route SharkPassRevealPreview, or
 * EXPO_PUBLIC_SHARKPASS_REVEAL_PREVIEW=1). The card is the real WearFirstReward the Shark Pass
 * screen uses; only the wear call is a stub that works, fails or hangs. Never routed in release.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import WearFirstReward from '../components/money/WearFirstReward';
import { FlexShareButton } from '../share';
import { useModalHandoff } from '../share/handoff';

type Mode = 'works' | 'fails' | 'hangs';
const ART = require('../../assets/images/sharkpass/snowflake-beanie.webp');
const STUB_MS = 3000;

export default function SharkPassRevealPreviewScreen({ route }: { route?: { params?: { mode?: Mode } } }) {
  const [mode, setMode] = useState<Mode>(route?.params?.mode ?? 'works');
  const [open, setOpen] = useState(1);
  // The same handoff as the Shark Pass screen: the card closes, then the Share Studio sheet opens.
  const handoff = useModalHandoff(useCallback(() => setOpen(0), []));
  const wear = {
    label: 'Wear it now',
    run: () => new Promise<void>((resolve, reject) => {
      if (mode === 'hangs') return;
      setTimeout(() => (mode === 'works' ? resolve() : reject(new Error('stub'))), STUB_MS);
    }),
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#0a4f96', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {open === 0 && <Text style={{ color: '#fff', fontSize: 18 }}>DEV: Shark Pass reward card</Text>}
      {/* The dev buttons hide while the card is up, so captures show only the card. */}
      {open === 0 && (['works', 'fails', 'hangs'] as const).map(m => (
        <Pressable key={m} accessibilityRole="button" accessibilityLabel={`Open, wear ${m}`} onPress={() => { setMode(m); setOpen(n => n + 1); }}
          style={{ backgroundColor: m === mode ? '#ffcf3b' : '#ffffff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 18 }}>
          <Text style={{ color: '#05346e', fontSize: 16 }}>{`Open (wear ${m})`}</Text>
        </Pressable>
      ))}
      {open > 0 && (
        <WearFirstReward key={`${open}:${mode}`} title="New season pin!" caption="Snowflake Beanie"
          picture={<Image source={ART} style={{ width: 180, height: 180 }} contentFit="contain" />}
          wear={wear}
          share={<FlexShareButton kind="find" surface="sharkpass" size="reveal" handoff={handoff.handoff}
            payload={{ itemName: 'Snowflake Beanie', artUrl: ART, rarity: 4, sourceLine: 'Shark Pass · Step 12', sourceSub: 'Frosty Fun Winter Wonderland' }} />}
          onDone={() => setOpen(0)} />
      )}
    </View>
  );
}
