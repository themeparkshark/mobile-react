import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';

export interface QueueArcadeChoice {
  readonly id: string;
  readonly title: string;
  readonly index: number;
  readonly completed: boolean;
}

export default function QueueArcadeSheet({ visible, choices, onChoose, onClose, onHidden }: {
  readonly visible: boolean;
  readonly choices: readonly QueueArcadeChoice[];
  readonly onChoose: (index: number) => void;
  readonly onClose: () => void;
  readonly onHidden: () => void;
}) {
  return <Modal isVisible={visible} style={styles.modal} hasBackdrop={false}
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
            <Text style={styles.title}>QUEUE ARCADE</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close queue arcade"
            onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.intro}>Pick a quick game while you wait.</Text>
        <ScrollView contentContainerStyle={styles.games}>
          {choices.map(choice => <Pressable key={choice.id} accessibilityRole="button"
            accessibilityLabel={`${choice.completed ? 'Replay' : 'Play'} ${choice.title}`}
            onPress={() => onChoose(choice.index)} style={styles.game}>
            <Text style={styles.gameTitle} numberOfLines={2}>{choice.title}</Text>
            <Text style={styles.gameAction}>{choice.completed ? 'PLAY AGAIN' : 'PLAY NOW'}  →</Text>
          </Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Your queue time keeps counting. Games are for fun.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modal: { margin: 0 },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(3, 23, 60, 0.68)' },
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
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#064b91',
    borderWidth: 2, borderColor: '#bcecff', justifyContent: 'center', alignItems: 'center' },
  closeText: { color: '#fff', fontSize: 31, lineHeight: 34, marginTop: -3 },
  intro: { color: '#164f85', fontFamily: 'Knockout', fontSize: 17,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    paddingHorizontal: 14, paddingBottom: 12 },
  game: { width: '48%', minHeight: 83, justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 13, borderWidth: 2, borderColor: '#89cafa',
    paddingHorizontal: 12, paddingVertical: 9, shadowColor: '#063a75',
    shadowOpacity: 0.13, shadowOffset: { width: 0, height: 2 }, shadowRadius: 2,
    elevation: 2 },
  gameTitle: { color: '#083f7c', fontFamily: 'Shark', fontSize: 17 },
  gameAction: { color: '#0879ca', fontFamily: 'Knockout', fontSize: 12 },
  note: { color: '#416b8f', fontFamily: 'Knockout', fontSize: 13,
    textAlign: 'center', paddingHorizontal: 15, paddingTop: 3, paddingBottom: 16 },
});
