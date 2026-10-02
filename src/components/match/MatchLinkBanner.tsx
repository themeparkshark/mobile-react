/**
 * The connection state every battle and waiting screen shows: nothing while
 * live, a small "Reconnecting..." chip while retrying, and once the reconnect
 * window closes a plain card with "Try again" and a way out. Leaving after a
 * network drop is always free; the copy says so.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BRAND, GameButton } from '../../ui';
import { LINK_COPY, type LinkPhase } from '../../services/match/matchLink';

export default function MatchLinkBanner({ phase, onRetry, onLeave, leaveLabel = 'Leave', testID }: {
  readonly phase: LinkPhase;
  readonly onRetry: () => void;
  readonly onLeave: () => void;
  readonly leaveLabel?: string;
  readonly testID?: string;
}) {
  if (phase === 'live') return null;
  if (phase === 'reconnecting') {
    return <View style={styles.chip} accessibilityLiveRegion="polite" accessibilityRole="alert" testID={testID}>
      <ActivityIndicator size="small" color={BRAND.navy} />
      <Text style={styles.chipText}>{LINK_COPY.reconnecting}</Text>
    </View>;
  }
  return <View style={styles.card} accessibilityLiveRegion="assertive" accessibilityRole="alert" testID={testID}>
    <Text style={styles.title}>{LINK_COPY.lostTitle}</Text>
    <Text style={styles.detail}>{LINK_COPY.lostDetail}</Text>
    <View style={styles.actions}>
      <GameButton label={LINK_COPY.retry} size="compact" fullWidth={false} onPress={onRetry} />
      <GameButton label={leaveLabel} variant="ghost" fullWidth={false} onPress={onLeave} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold,
    borderRadius: 999, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 14, paddingVertical: 6, marginVertical: 8 },
  chipText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 16 },
  card: { alignSelf: 'stretch', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy,
    padding: 14, marginVertical: 10 },
  title: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 19, textAlign: 'center' },
  detail: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 15, textAlign: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 10 },
});
