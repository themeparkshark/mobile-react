import { useContext, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getTaskAttempt } from '../api/endpoints/me/task-attempts';
import { AuthContext } from '../context/AuthProvider';
import { createEarnedShelfArrival } from '../services/collection/earnedShelf';
import * as RootNavigation from '../RootNavigation';

/** Read-only native QA using an existing confirmed local-player win. */
export default function ShelfArrivalPreviewScreen() {
  const { player } = useContext(AuthContext);
  const [retry, setRetry] = useState(0), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!__DEV__ || !player) return;
    let active = true;
    void (async () => {
      try {
        const id = Number(process.env.EXPO_PUBLIC_SHELF_ARRIVAL_ATTEMPT_ID);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Choose a confirmed QA attempt');
        const { attempt } = await getTaskAttempt(id);
        const earnedCoin = createEarnedShelfArrival(attempt);
        if (!earnedCoin) throw new Error('This attempt has no confirmed coin');
        if (active) RootNavigation.navigate('Park', { park: 1, player: player.id, earnedCoin });
      } catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, [player?.id, retry]);
  return <View style={{ flex: 1, backgroundColor: '#075083', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <Text style={{ fontFamily: 'Shark', fontSize: 24, color: '#fff', textAlign: 'center' }}>
      {failed ? 'Confirmed coin could not load' : 'Opening your earned coin shelf'}
    </Text>
    {failed && <Pressable accessibilityRole="button" onPress={() => { setFailed(false); setRetry(value => value + 1); }}
      style={{ marginTop: 20, padding: 16, backgroundColor: '#FFD34B', borderRadius: 12 }}>
      <Text style={{ fontFamily: 'Shark', color: '#075083' }}>Retry</Text>
    </Pressable>}
  </View>;
}
