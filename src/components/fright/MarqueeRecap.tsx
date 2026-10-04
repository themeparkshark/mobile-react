/**
 * The Marquee recap sheet: loads GET /fright/recap/{slug}/{night_on} and shows
 * the marquee card. Share goes through Share Studio (shareFlex 'fright_night',
 * recapFlex). Inside an RN Modal the button stays hidden while SHARE_IN_MODALS
 * is false; the Deep Lantern route carries the recap share instead.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getFrightRecap, type FrightRecap } from '../../api/endpoints/fright';
import { FlexShareButton, SHARE_IN_MODALS } from '../../share';
import { frightArt } from '../../services/fright/art';
import { recapFlex } from '../../services/fright/share';
import { withTimeout } from '../../services/fright/timeout';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon, gameAlert } from '../../ui';
import FrightRecapCard from './FrightRecapCard';
import { NightButton } from './ui';

export function MarqueeBody({ eventSlug, nightOn, playerId, background, inModal = false, onClose }: {
  readonly eventSlug: string;
  /** art.recap_bg; defaults to the art learned this session. */
  readonly background?: string | null;
  readonly nightOn: string;
  readonly playerId?: number | null;
  /** Rendered inside an RN Modal: the Share button stays hidden unless SHARE_IN_MODALS (Share Studio rule). */
  readonly inModal?: boolean;
  readonly onClose: () => void;
}) {
  const [recap, setRecap] = useState<FrightRecap | null>(null);
  const [failed, setFailed] = useState(false);
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
        {recap && !playerId && (!inModal || SHARE_IN_MODALS) && (
          <FlexShareButton kind="fright_night" payload={recapFlex(recap)} surface="fright_recap" size="md"
            style={{ marginTop: 14, alignSelf: 'center' }} />
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
        <MarqueeBody eventSlug={target.slug} nightOn={target.nightOn} inModal onClose={onClose} />
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
