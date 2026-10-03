/**
 * The Marquee recap sheet: loads GET /fright/recap/{slug}/{night_on} and shows
 * the marquee card with a Share button. No Share Studio shareFlex API exists
 * in the app yet (share-studio/CONTRACT.md not published), so Share uses the
 * existing capture path (react-native-view-shot + expo-sharing). The recap's
 * `share` block stays separable for shareFlex later.
 */
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { getFrightRecap, type FrightRecap } from '../../api/endpoints/fright';
import { frightArt } from '../../services/fright/art';
import { withTimeout } from '../../services/fright/timeout';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon, gameAlert } from '../../ui';
import FrightRecapCard from './FrightRecapCard';
import { NightButton } from './ui';

export async function shareRecapCard(view: View | null): Promise<void> {
  if (!view) return;
  try {
    if (!await Sharing.isAvailableAsync()) {
      gameAlert('Sharing unavailable', 'This device cannot open a share sheet right now.');
      return;
    }
    const uri = await captureRef(view, { format: 'jpg', quality: 0.92 });
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your night' });
  } catch {
    gameAlert('Card not made', 'Your night is saved. Try sharing again.', undefined, { icon: 'retry' });
  }
}

export function MarqueeBody({ eventSlug, nightOn, playerId, background, onClose }: {
  readonly eventSlug: string;
  /** art.recap_bg; defaults to the art learned this session. */
  readonly background?: string | null;
  readonly nightOn: string;
  readonly playerId?: number | null;
  readonly onClose: () => void;
}) {
  const [recap, setRecap] = useState<FrightRecap | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const card = useRef<View>(null);
  useEffect(() => {
    let current = true;
    setRecap(null);
    setFailed(false);
    // 12 s cap: a slow or missing recap shows an error with Retry, never an endless spinner.
    void withTimeout(getFrightRecap(eventSlug, nightOn, playerId)).then(next => {
      if (!current) return;
      if (next) setRecap(next); else setFailed(true);
    });
    return () => { current = false; };
  }, [eventSlug, nightOn, playerId, attempt]);
  return (
    <View style={styles.sheet}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
        <GameIcon name="close" size={30} />
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 52 }}>
        {recap ? <FrightRecapCard ref={card} recap={recap} background={background ?? frightArt().recapBg} />
          : <Text style={styles.wait} accessibilityLiveRegion="polite">
            {failed ? 'Couldn\'t load your night. Check your signal and try again.' : 'Lighting the marquee...'}</Text>}
        {failed && <NightButton label="Retry" icon="retry" onPress={() => setAttempt(value => value + 1)}
          style={{ marginTop: 14, alignSelf: 'center', minWidth: 160 }} />}
        {recap && !playerId && (
          <NightButton label="Share my night" icon="camera" loading={sharing} style={{ marginTop: 14 }}
            onPress={async () => { setSharing(true); await shareRecapCard(card.current); setSharing(false); }} />
        )}
      </ScrollView>
    </View>
  );
}

export default function MarqueeRecap({ target, onClose }: {
  readonly target: { slug: string; nightOn: string } | null;
  readonly onClose: () => void;
}) {
  if (!target) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <MarqueeBody eventSlug={target.slug} nightOn={target.nightOn} onClose={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', minHeight: '60%', backgroundColor: NIGHT.midnight, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 3, borderColor: NIGHT.fog },
  close: { position: 'absolute', right: 14, top: 12, zIndex: 2 },
  wait: { fontFamily: 'Knockout', fontSize: 18, color: NIGHT.fogLight, textAlign: 'center', marginTop: 40 },
});
