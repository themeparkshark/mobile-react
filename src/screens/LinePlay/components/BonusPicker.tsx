/**
 * BonusPicker: the bonus branch of the Queue Arcade (queue-bonus.md 7.4).
 *
 * Up to 3 big tiles for server-verified games (Current Quest, Codebreaker),
 * each with a gold BONUS ribbon when a win can claim a slot and one badge
 * line saying what a win pays right now. Client-scored games sit below under
 * "Just for fun" with no badge: they never pay Parts. Walking never pauses
 * any of them.
 */
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../../ui';
import type { LineBonusSummary, CrewPuzzleSummary } from '../../../api/endpoints/me/inline-timer/types';
import { formatClock, pickerBadge, pickerOrder, type BonusGameId } from '../../../services/lineplay/bonusRounds';
import type { QueueArcadeChoice } from './QueueArcadeSheet';

const QUEST_ART = require('../../../../assets/images/screens/lineplay/arcade/quest.png');

export interface BonusPickerProps {
  readonly visible: boolean;
  readonly bonus: LineBonusSummary;
  readonly secondsToNext: number | null;
  /** Current Quest's choice in the playlist (null when it is not on this wait). */
  readonly questChoice: QueueArcadeChoice | null;
  /** Codebreaker state; null when the crew round is not open. */
  readonly crew: CrewPuzzleSummary | null;
  readonly funChoices: readonly QueueArcadeChoice[];
  readonly onChoose: (index: number) => void;
  readonly onOpenCodebreaker: () => void;
  readonly onClose: () => void;
  readonly onHidden: () => void;
}

/** "2 sharks cracking", or Captain Fin when nobody else is here. Echo seats never count. */
export function crewTileLine(crew: CrewPuzzleSummary): string {
  const live = Math.max(0, crew.live_players ?? crew.participants ?? 0);
  return live > 0 ? `${live} shark${live === 1 ? '' : 's'} cracking` : 'Crack it with Captain Fin';
}

export function crewStageLine(crew: CrewPuzzleSummary, now = Date.now()): string {
  if (crew.completed) {
    const at = crew.next_code_at ? Date.parse(crew.next_code_at) : NaN;
    return Number.isFinite(at) ? `NEXT CODE IN ${formatClock(Math.max(0, (at - now) / 1000))}` : 'Code cracked';
  }
  return `Stage ${crew.stage} of ${crew.total_stages}`;
}

export default function BonusPicker({ visible, bonus, secondsToNext, questChoice, crew, funChoices,
  onChoose, onOpenCodebreaker, onClose, onHidden }: BonusPickerProps) {
  const reducedMotion = useReducedGameMotion();
  const badge = pickerBadge(bonus, secondsToNext);
  const available: BonusGameId[] = [
    ...(questChoice && bonus.sources.current_quest ? ['current_quest' as const] : []),
    ...(crew && bonus.sources.crew_puzzle ? ['crew_puzzle' as const] : []),
  ];
  const order = pickerOrder(bonus, available);
  const ribbon = badge.kind === 'bonus' || badge.kind === 'pays_later';

  const tile = (id: BonusGameId) => {
    const isQuest = id === 'current_quest';
    const title = isQuest ? 'Current Quest' : 'Codebreaker';
    const line = isQuest ? (questChoice?.bestStars != null ? `Best ${questChoice.bestStars} of 3 stars` : 'Clear every voyage')
      : crew ? `${crewTileLine(crew)}  ·  ${crewStageLine(crew)}` : '';
    return <Pressable key={id} accessibilityRole="button"
      accessibilityLabel={`${title}. ${badge.text}. ${line}`}
      onPress={() => isQuest ? questChoice && onChoose(questChoice.index) : onOpenCodebreaker()}
      style={({ pressed }) => [styles.tile, pressed && !reducedMotion && styles.tilePressed]}>
      {ribbon && <View style={styles.ribbon}><Text style={styles.ribbonText}>BONUS</Text></View>}
      <View style={styles.tileArt}>
        {isQuest ? <Image source={QUEST_ART} style={styles.questArt} contentFit="contain" />
          : <GameIcon name="fin" size={56} />}
      </View>
      <View style={styles.tileCopy}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileBadge} numberOfLines={1}>{badge.text}</Text>
        {!!line && <Text style={styles.tileLine} numberOfLines={1}>{line}</Text>}
        {badge.reward && badge.kind !== 'bonus' && <Text style={styles.tileReward}>{badge.reward}</Text>}
      </View>
    </Pressable>;
  };

  return <Modal isVisible={visible} style={styles.modal} onBackdropPress={onClose} onBackButtonPress={onClose}
    onSwipeComplete={onClose} swipeDirection="down" onModalHide={onHidden}
    animationIn={reducedMotion ? 'fadeIn' : 'slideInUp'} animationOut={reducedMotion ? 'fadeOut' : 'slideOutDown'}>
    <View style={styles.sheet}>
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Text style={styles.title}>PLAY FOR BONUS</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close bonus games" onPress={onClose}
          style={styles.close} hitSlop={8}>
          <GameIcon name="close" size={36} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {order.length > 0 ? order.map(tile)
          : <Text style={styles.empty}>Bonus games open as you wait. Have fun meanwhile.</Text>}
        {funChoices.length > 0 && <>
          <Text style={styles.section}>Just for fun</Text>
          <View style={styles.funGrid}>
            {funChoices.map(choice => <Pressable key={choice.id} accessibilityRole="button"
              accessibilityLabel={`Play ${choice.title}, just for fun`} onPress={() => onChoose(choice.index)}
              style={styles.funTile}>
              <Text style={styles.funTitle} numberOfLines={2}>{choice.title}</Text>
            </Pressable>)}
          </View>
        </>}
      </ScrollView>
      <Text style={styles.footer}>Your wait still counts while you play.</Text>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modal: { margin: 0, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#e7f7ff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 3, borderColor: '#fff', maxHeight: '80%', paddingBottom: 18 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#9cc8e6', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  title: { flex: 1, fontFamily: 'Shark', fontSize: 24, color: '#083f7c' },
  close: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  body: { paddingHorizontal: 14, gap: 10, paddingBottom: 8 },
  tile: { flexDirection: 'row', alignItems: 'center', minHeight: 96, backgroundColor: '#fff',
    borderRadius: 16, borderWidth: 3, borderColor: '#fec90e', padding: 10, overflow: 'hidden' },
  tilePressed: { transform: [{ scale: 0.97 }] },
  ribbon: { position: 'absolute', top: 10, right: -26, width: 100, paddingVertical: 2,
    backgroundColor: '#fec90e', transform: [{ rotate: '35deg' }], alignItems: 'center', zIndex: 1 },
  ribbonText: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navy, letterSpacing: 1 },
  tileArt: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  questArt: { width: 72, height: 72 },
  tileCopy: { flex: 1, minWidth: 0 },
  tileTitle: { fontFamily: 'Shark', fontSize: 20, color: '#083f7c' },
  tileBadge: { fontFamily: 'Knockout', fontSize: 15, color: '#b07800', marginTop: 2 },
  tileLine: { fontFamily: 'Knockout', fontSize: 13, color: '#416b8f', marginTop: 2 },
  tileReward: { fontFamily: 'Knockout', fontSize: 13, color: '#0a7f4f', marginTop: 2 },
  empty: { fontFamily: 'Knockout', fontSize: 15, color: '#416b8f', textAlign: 'center', paddingVertical: 12 },
  section: { fontFamily: 'Knockout', fontSize: 14, color: '#416b8f', letterSpacing: 1, marginTop: 6 },
  funGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  funTile: { width: '48%', minHeight: 54, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2,
    borderColor: '#89cafa', justifyContent: 'center', paddingHorizontal: 10 },
  funTitle: { fontFamily: 'Shark', fontSize: 15, color: '#083f7c', textAlign: 'center' },
  footer: { fontFamily: 'Knockout', fontSize: 13, color: '#416b8f', textAlign: 'center', paddingTop: 6 },
});
