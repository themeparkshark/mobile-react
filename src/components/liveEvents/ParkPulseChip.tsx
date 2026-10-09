import { memo, useCallback, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import client from '../../api/client';
import { TEAMS, isTeam } from '../../constants/teams';
import useLivePoll from '../../hooks/useLivePoll';
import { BRAND, GameIcon } from '../../ui';

export type Pulse = { readonly bucket: '5+' | '10+' | '25+' | null; readonly team_leader: string | null };

/** GET /parks/{id}/pulse every 10 minutes while the map is focused (the server only changes it that often). */
export function useParkPulse(parkId: number | null, focused: boolean): Pulse | null {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const load = useCallback(() => {
    if (!parkId) return Promise.resolve();
    return client.get<{ data: Pulse }>(`/parks/${parkId}/pulse`, { timeout: 8000 })
      .then(r => setPulse(r.data?.data ?? null)).catch(() => setPulse(null));
  }, [parkId]);
  useLivePoll(load, 10 * 60_000, { enabled: !!parkId, focused, key: parkId });
  return parkId ? pulse : null;
}

/**
 * Park Pulse: "10+ sharks here" and the team in the lead today. Counts only,
 * never names or places (the server hides anything under 5). Not tappable.
 */
function ParkPulseChip({ pulse }: { readonly pulse: Pulse | null }) {
  if (!pulse?.bucket) return null;
  const leader = pulse.team_leader && isTeam(pulse.team_leader) ? TEAMS[pulse.team_leader] : null;
  return (
    <View style={styles.chip} accessible accessibilityLabel={`${pulse.bucket} sharks playing here${leader ? `. ${leader.name} leads today` : ''}`}>
      <GameIcon name="shark" size={22} />
      <Text style={styles.text}>{pulse.bucket} here</Text>
      {leader && <Image source={leader.badge} style={styles.crest} contentFit="contain" />}
    </View>
  );
}

export default memo(ParkPulseChip);

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 8, borderRadius: 17, backgroundColor: BRAND.white,
    borderWidth: 2.5, borderColor: BRAND.navy, alignSelf: 'flex-start' },
  text: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  crest: { width: 22, height: 22 },
});
