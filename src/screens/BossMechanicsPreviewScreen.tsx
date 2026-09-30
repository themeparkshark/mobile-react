import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BOSS_NAMES, type BossId } from '../api/endpoints/parks/raid';
import { BOSS_ART, BossBrawl } from '../games/boss/BossBrawl';

/** Read-only arena QA. There is deliberately no raid submission or reward API. */
export default function BossMechanicsPreviewScreen() {
  const [boss, setBoss] = useState<BossId>('kraken'), [visible, setVisible] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  return <View style={{ flex: 1, backgroundColor: '#075083', padding: 22, justifyContent: 'center' }}>
    <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#FFD34B', textAlign: 'center' }}>Boss practice</Text>
    <Text style={{ fontFamily: 'Knockout', color: '#DFF6FF', fontSize: 15, textAlign: 'center', marginVertical: 12 }}>
      Development arena · no Energy, raid damage or rewards are submitted
    </Text>
    {(['kraken', 'robo_shark', 'ghost_squid'] as const).map(id => <Pressable key={id} accessibilityRole="button"
      accessibilityLabel={`Practice ${BOSS_NAMES[id]}`} onPress={() => { setBoss(id); setReceipt(null); setVisible(true); }}
      style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 7, padding: 12, borderRadius: 18,
        borderWidth: 2, borderColor: '#A6DFF5', backgroundColor: '#163B6D' }}>
      <Image source={BOSS_ART[id]} contentFit="contain" style={{ width: 74, height: 74, marginRight: 15 }} />
      <Text style={{ fontFamily: 'Shark', color: '#FFF', fontSize: 22 }}>{BOSS_NAMES[id]}</Text>
    </Pressable>)}
    {receipt && <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#FFE37B', marginTop: 16, textAlign: 'center' }}>{receipt}</Text>}
    {__DEV__ && <BossBrawl visible={visible} boss={boss} bossName={BOSS_NAMES[boss]} hpLeft={5000} hpMax={5000}
      onClose={() => setVisible(false)} onComplete={(_, meta) => { setVisible(false);
        const hits = Number(meta?.hits ?? 0), critical = Number(meta?.weak_hits ?? 0);
        setReceipt(`Practice finished · ${hits} ${hits === 1 ? 'hit' : 'hits'} · ${critical} critical ${critical === 1 ? 'hit' : 'hits'}`); }} />}
  </View>;
}
