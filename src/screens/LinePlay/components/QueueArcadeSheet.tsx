/**
 * Queue Arcade: every queue game one tap away. Each tile shows your best stars
 * this wait, or a NEW pill for a game you have not played, and the tiles pop
 * in with a short stagger when the sheet opens (reduced motion: no pop).
 */
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { ZoomIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../../ui';

export interface QueueArcadeChoice {
  readonly id: string;
  readonly title: string;
  readonly gameId?: string;
  readonly index: number;
  readonly completed: boolean;
  /** Best stars this wait (0-3); undefined when the game has not been played. */
  readonly bestStars?: number;
}

const ICONS: Record<string, number> = {
  tap: require('../../../../assets/images/screens/lineplay/arcade/whack.png'),
  timing: require('../../../../assets/images/screens/lineplay/arcade/rhythm.png'),
  memory: require('../../../../assets/images/screens/lineplay/arcade/memory.png'),
  trivia: require('../../../../assets/images/screens/lineplay/arcade/trivia.png'),
  shark: require('../../../../assets/images/screens/lineplay/arcade/sharky.png'),
  banana: require('../../../../assets/images/screens/lineplay/arcade/banana.png'),
  current: require('../../../../assets/images/screens/lineplay/arcade/quest.png'),
  showdown: require('../../../../assets/images/screens/lineplay/arcade/showdown.png'),
};

export default function QueueArcadeSheet({ visible, choices, onChoose, onClose, onHidden }: {
  readonly visible: boolean;
  readonly choices: readonly QueueArcadeChoice[];
  readonly onChoose: (index: number) => void;
  readonly onClose: () => void;
  readonly onHidden: () => void;
}) {
  const reducedMotion = useReducedGameMotion();
  return <Modal isVisible={visible} style={styles.modal} hasBackdrop={false}
    animationIn={reducedMotion ? 'fadeIn' : 'slideInUp'}
    animationOut={reducedMotion ? 'fadeOut' : 'slideOutDown'}
    animationInTiming={reducedMotion ? 120 : 260} animationOutTiming={reducedMotion ? 120 : 180}
    onBackButtonPress={onClose} onModalHide={onHidden}>
    <View style={styles.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close queue arcade"
        onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <Image source={require('../../../../assets/images/screens/social/arcade.png')}
            style={styles.arcadeIcon} contentFit="contain" />
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>LINEPLAY</Text>
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>QUEUE ARCADE</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close queue arcade"
            onPress={onClose} style={styles.close} hitSlop={8}>
            <GameIcon name="close" size={40} />
          </Pressable>
        </View>
        <Text style={styles.intro}>Pick a quick game while you wait.</Text>
        <ScrollView contentContainerStyle={styles.games}>
          {choices.map((choice, order) => <Animated.View key={choice.id} style={styles.gameCell}
            entering={visible && !reducedMotion ? ZoomIn.delay(90 + order * 60).springify().damping(12) : undefined}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`${choice.completed ? 'Replay' : 'Play'} ${choice.title}. ${choice.bestStars == null
                ? 'New this wait.' : `Best ${choice.bestStars} of 3 stars.`}`}
              onPress={() => onChoose(choice.index)}
              style={({ pressed }) => [styles.game, pressed && { backgroundColor: '#FFF3C7',
                borderColor: '#E4B238', transform: [{ scale: reducedMotion ? 1 : 0.96 }] }]}>
              {choice.bestStars == null && <View style={styles.newPill}><Text style={styles.newPillText}>NEW</Text></View>}
              {!!choice.gameId && ICONS[choice.gameId] != null &&
                <Image source={ICONS[choice.gameId]} style={styles.gameIcon} contentFit="contain" />}
              <Text style={styles.gameTitle} numberOfLines={2}>{choice.title}</Text>
              {choice.bestStars != null && <View style={styles.stars}>
                {[1, 2, 3].map(slot => <GameIcon key={slot} name="star" size={20}
                  mono={slot <= (choice.bestStars ?? 0) ? undefined : '#c3d6e6'} />)}
              </View>}
            </Pressable>
          </Animated.View>)}
        </ScrollView>
        <Text style={styles.note}>Your wait still counts while you play.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  gameIcon: { width: 72, height: 72, alignSelf: 'center', marginBottom: 4 },
  gameCell: { width: '48%' },
  newPill: { position: 'absolute', top: 6, right: 6, zIndex: 1, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy },
  newPillText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 12 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 3 },
  modal: { margin: 0 },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: BRAND.scrim },
  panel: { width: '90%', maxHeight: '78%', backgroundColor: '#e7f7ff',
    borderWidth: 4, borderColor: '#fff', borderRadius: 23,
    shadowColor: '#001f51', shadowOpacity: 0.4, shadowRadius: 16, elevation: 15,
    overflow: 'hidden' },
  header: { minHeight: 91, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, backgroundColor: '#0879ca', borderBottomWidth: 4,
    borderBottomColor: '#ffca30' },
  arcadeIcon: { width: 61, height: 61, marginRight: 9 },
  headerCopy: { flex: 1 },
  kicker: { fontFamily: 'Knockout', fontSize: 13, color: '#ffe17b', letterSpacing: 1.2 },
  title: { fontFamily: 'Shark', fontSize: 25, color: '#fff' },
  close: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  intro: { color: '#164f85', fontFamily: 'Knockout', fontSize: 17,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    paddingHorizontal: 14, paddingBottom: 12 },
  game: { width: '100%', minHeight: 83, justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 13, borderWidth: 2, borderColor: '#89cafa',
    paddingHorizontal: 12, paddingVertical: 9, shadowColor: '#063a75',
    shadowOpacity: 0.13, shadowOffset: { width: 0, height: 2 }, shadowRadius: 2,
    elevation: 2 },
  gameTitle: { color: '#083f7c', fontFamily: 'Shark', fontSize: 17, textAlign: 'center' },
  note: { color: '#416b8f', fontFamily: 'Knockout', fontSize: 13,
    textAlign: 'center', paddingHorizontal: 15, paddingTop: 3, paddingBottom: 16 },
});
