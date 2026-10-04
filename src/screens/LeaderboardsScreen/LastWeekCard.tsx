/**
 * The Monday results card (PROPOSAL weekly payoff): the first Standings open
 * after the reset shows where you finished last week, the title and Tickets
 * the top three earned, then rolls into the new week. Shown once per week.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useContext, useEffect } from 'react';
import { AccessibilityInfo, Modal, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, textPreset } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { CROWN_ART } from './PodiumSpot';
import StandingsShark from './StandingsShark';
import { lastWeekCopy, type LastWeekResult, type StandingsRowModel } from './standingsV2Model';

const rewardSound = require('../../../assets/sounds/reward.mp3');

export default function LastWeekCard({ result, me, onClose }: {
  readonly result: LastWeekResult | null;
  readonly me: StandingsRowModel | null;
  readonly onClose: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const copy = result ? lastWeekCopy(result) : null;
  useEffect(() => {
    if (!result || !copy) return;
    if (result.tickets > 0) {
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    AccessibilityInfo.announceForAccessibility(`${copy.headline}. ${copy.line}.${copy.reward ? ` You earned ${copy.reward}.` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.weekStart]);
  // Crowns and winner words only for a paid top-three result.
  // A deeper scrim and a lower card (below): the board's own crown never reads as this card's.
  const crown = result && result.tickets > 0 && result.rank <= 3 ? CROWN_ART[result.rank as 1 | 2 | 3] : null;
  return (
    <Modal visible={!!result} transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      {result && copy && (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} style={{ flex: 1, backgroundColor: 'rgba(8,56,128,0.68)', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(12).stiffness(200)} style={{
            width: 300, marginTop: 80, alignItems: 'center', padding: 22, borderRadius: RADIUS.xl, backgroundColor: BRAND.cream,
            borderWidth: 4, borderBottomWidth: 8, borderColor: BRAND.gold, ...SHADOW.lifted,
          }}>
            <Text maxFontSizeMultiplier={1.25} style={[textPreset('label'), { color: BRAND.goldLip }]}>LAST WEEK</Text>
            {crown && <Image source={crown} style={{ width: 54, height: 54, marginBottom: -10, marginTop: 4, zIndex: 2 }} contentFit="contain" />}
            {me && <StandingsShark avatar={me.avatar} size={104} ring={BRAND.gold} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <GameIcon name="ride" size={30} />
              <Text maxFontSizeMultiplier={1.25} style={[textPreset('title'), { textAlign: 'center' }]}>{copy.headline}</Text>
            </View>
            <Text maxFontSizeMultiplier={1.25} style={[textPreset('bodySmall'), { color: BRAND.navySoft, textAlign: 'center', marginTop: 2 }]}>{copy.line}</Text>
            {copy.reward && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 14, height: 40,
                borderRadius: RADIUS.pill, backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 4, borderColor: BRAND.goldLip }}>
                <GameIcon name="ticket" size={24} />
                <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Shark', fontSize: 17, color: BRAND.navy }}>{copy.reward}</Text>
              </View>
            )}
            <GameButton label="New week, go!" icon="ride" onPress={onClose} style={{ marginTop: 16 }} />
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}
