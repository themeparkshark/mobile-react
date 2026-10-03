/**
 * Blocked players, with Unblock. A mistaken tap on Block used to be
 * permanent from the kid's side. Reached from Shark Social help and the
 * Social "More" sheet.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { fetchBlocked, unblockPlayer } from '../../api/endpoints/social';
import Avatar from '../../components/Avatar';
import { useToast } from '../../components/Toast';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import type { PlayerType } from '../../models/player-type';
import { BRAND, SharkLoader } from '../../ui';
import { PressScale, WATER, card } from './socialLook';
import { emitSocial } from './socialEvents';

export default function BlockedPlayersScreen() {
  const [players, setPlayers] = useState<PlayerType[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setError(false);
    try {
      setPlayers(await fetchBlocked());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (player: PlayerType) => {
    if (busy) return;
    setBusy(player.id);
    try {
      await unblockPlayer(player.id);
      setPlayers((list) => (list ?? []).filter((p) => p.id !== player.id));
      emitSocial({ type: 'player-unblocked', playerId: player.id });
      showToast({ type: 'success', message: `${player.screen_name} is unblocked.`, icon: 'check' });
    } catch {
      showToast({ type: 'error', message: "That didn't work. Try again in a moment." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Blocked</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <View style={{ flex: 1 }}>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" />
        {players === null ? (
          <SharkLoader state={error ? 'error' : 'loading'} tone="onBlue" onRetry={load} style={{ marginTop: 80 }} />
        ) : players.length === 0 ? (
          <SharkLoader state="empty" tone="onBlue" title="Nobody is blocked" message="If someone is mean, tap the dots on their post, then Block." style={{ marginTop: 80, paddingHorizontal: 24 }} />
        ) : (
          <FlatList
            data={players}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{ padding: 14, gap: 12 }}
            ListHeaderComponent={<Text style={styles.lead}>You can't see their posts, and they can't reply to you.</Text>}
            renderItem={({ item }) => (
              <View style={[card.shell, styles.row]}>
                <Avatar player={item} size="sm" />
                <Text style={styles.name} numberOfLines={1}>{item.screen_name}</Text>
                <PressScale
                  onPress={() => void unblock(item)}
                  disabled={busy === item.id}
                  style={styles.unblock}
                  accessibilityLabel={`Unblock ${item.screen_name}`}
                >
                  <Text style={styles.unblockText}>Unblock</Text>
                </PressScale>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.blue },
  lead: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.white, textAlign: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  name: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 3 },
  unblock: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: BRAND.gold, borderWidth: 3, borderBottomWidth: 5, borderColor: '#7a3d00',
  },
  unblockText: { fontFamily: 'Shark', fontSize: 16, color: '#7a3d00', marginTop: 3 },
});
