/**
 * Titles, inside the Stamp Book: how a stamp becomes a title, and every stamp
 * title in one list. A 3-picture strip says the whole rule with no reading
 * (stamp, claim, wear). Rows: the title as it looks on your profile, the stamp
 * it comes from (its art), one short line, and one action: Wear, Remove,
 * Claim (opens the stamp) or the stamp's progress (opens the stamp).
 * Titles from Collection Books are worn from the profile title sheet; a worn
 * one still shows here at the top so Remove always works.
 */
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameDialog, GameIcon } from '../../ui';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import StampArt from './StampArt';
import { INK, MUTED_INK, PAPER } from './StampTile';
import { titleLine, type BookStamp, type TitleEntry } from './model';

const GOLD = '#FFCF3B';

export default function TitlesSheet({ visible, entries, worn, busy, message, onWear, onRemove, onOpenStamp, onClose }: {
  readonly visible: boolean;
  readonly entries: readonly TitleEntry[];
  /** The title on the profile now (from a stamp or a Collection Book). */
  readonly worn: string | null;
  /** The title being saved (its row shows Saving...). */
  readonly busy: string | null;
  readonly message: string | null;
  readonly onWear: (entry: TitleEntry) => void;
  readonly onRemove: () => void;
  readonly onOpenStamp: (stamp: BookStamp) => void;
  readonly onClose: () => void;
}) {
  const fromBook = !!worn && !entries.some(e => e.title === worn);
  return (
    <GameDialog visible={visible} title="Titles" buttons={[{ text: 'Close', style: 'cancel', variant: 'ghost' }]}
      onAnswer={() => onClose()} testID="stamp-titles">
      <View style={styles.steps} accessible accessibilityLabel="Earn a stamp, claim it, then wear its title on your profile.">
        <Step icon="medal1" label="Earn it" />
        <GameIcon name="arrow" size={18} />
        <Step icon="gift" label="Claim it" />
        <GameIcon name="arrow" size={18} />
        <Step icon="crown" label="Wear it" />
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listInner} showsVerticalScrollIndicator={false}>
        {fromBook && (
          <View style={styles.row}>
            <View style={styles.thumb}><GameIcon name="crown" size={34} /></View>
            <View style={styles.mid}>
              <TitlePillText title={worn as string} owned />
              <Text style={styles.line} numberOfLines={1} maxFontSizeMultiplier={1.2}>On your profile now</Text>
            </View>
            <SmallButton label={busy === '__remove' ? 'Saving...' : 'Remove'} kind="quiet" onPress={onRemove} a11y={`Remove the title ${worn}`} />
          </View>
        )}
        {entries.map(entry => {
          const owned = entry.state === 'wearing' || entry.state === 'ready';
          const open = () => onOpenStamp(entry.stamp);
          return (
            // The row (art and words) opens the stamp; the action is a sibling so VoiceOver reaches both.
            <View key={entry.title} style={[styles.row, entry.state === 'wearing' && styles.rowWearing]}>
              <Pressable style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]} onPress={open} accessibilityRole="button"
                accessibilityLabel={`${entry.title} title. ${titleLine(entry)}. Opens the ${entry.stamp.name} stamp.`}>
                <View style={styles.thumb}>
                  <StampArt stamp={entry.stamp} size="thumb" />
                </View>
                <View style={styles.mid}>
                  <TitlePillText title={entry.title} owned={owned} />
                  <Text style={styles.line} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.2}>{titleLine(entry)}</Text>
                </View>
              </Pressable>
              {entry.state === 'wearing' ? (
                <SmallButton label={busy === '__remove' ? 'Saving...' : 'Remove'} kind="quiet" onPress={onRemove} a11y={`Remove the title ${entry.title}`} />
              ) : entry.state === 'ready' ? (
                <SmallButton label={busy === entry.title ? 'Saving...' : 'Wear'} icon="crown" kind="gold" onPress={() => onWear(entry)} a11y={`Wear the title ${entry.title}`} />
              ) : entry.state === 'claim' ? (
                <SmallButton label="Claim" icon="gift" kind="red" onPress={open} a11y={`Claim the ${entry.stamp.name} stamp to unlock ${entry.title}`} />
              ) : (
                <View style={styles.lockDot} accessible={false}><GameIcon name="lock" size={16} /></View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {!!message && <Text style={styles.message} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>{message}</Text>}
    </GameDialog>
  );
}

function Step({ icon, label }: { icon: 'medal1' | 'gift' | 'crown'; label: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepDisc}><GameIcon name={icon} size={30} /></View>
      <Text style={styles.stepText} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

/** The title as it reads under your shark: the gold pill when it is yours, a pale one when it is not yet. */
function TitlePillText({ title, owned }: { title: string; owned: boolean }) {
  return (
    <View style={[styles.pill, !owned && styles.pillLocked]}>
      <GameIcon name="crown" size={16} />
      <Text style={[styles.pillText, !owned && styles.pillTextLocked]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        maxFontSizeMultiplier={1.2}>{title}</Text>
    </View>
  );
}

function SmallButton({ label, icon, kind, onPress, a11y }: {
  label: string; icon?: 'crown' | 'gift'; kind: 'gold' | 'red' | 'quiet'; onPress: () => void; a11y: string;
}) {
  return (
    <Pressable onPress={() => { haptic('tapLight'); playSfx('ui.tap', 0.6); onPress(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => [styles.btn, kind === 'gold' && styles.btnGold, kind === 'red' && styles.btnRed, kind === 'quiet' && styles.btnQuiet, pressed && styles.pressed]}>
      {!!icon && <GameIcon name={icon} size={16} />}
      <Text style={[styles.btnText, kind === 'gold' && styles.btnTextGold, kind === 'quiet' && styles.btnTextQuiet]} maxFontSizeMultiplier={1.2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch' },
  step: { alignItems: 'center', width: 70 },
  stepDisc: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: PAPER, borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#022a55', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 0,
  },
  stepText: { fontFamily: 'Shark', fontSize: 13, color: '#FFFFFF', marginTop: 3 },
  list: { alignSelf: 'stretch', maxHeight: 360 },
  listInner: { gap: 8, paddingVertical: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PAPER, borderRadius: 16, borderWidth: 2.5, borderColor: '#FFFFFF',
    paddingVertical: 6, paddingHorizontal: 8, minHeight: 64,
  },
  rowWearing: { borderColor: GOLD, borderWidth: 3 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  thumb: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, gap: 3 },
  pill: {
    alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: '#FFFFFF', borderBottomWidth: 3, borderBottomColor: '#D99A00',
  },
  pillLocked: { backgroundColor: '#E6DDC8', borderBottomColor: '#C7B998' },
  pillText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 14, color: INK },
  pillTextLocked: { color: MUTED_INK },
  line: { fontFamily: 'Knockout', fontSize: 14, color: MUTED_INK },
  lockDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(91,103,130,0.18)', alignItems: 'center', justifyContent: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, minWidth: 64, paddingHorizontal: 10, borderRadius: 14,
    borderWidth: 2.5, borderColor: '#FFFFFF', justifyContent: 'center',
  },
  btnGold: { backgroundColor: GOLD, borderBottomWidth: 4, borderBottomColor: '#C98A00' },
  btnRed: { backgroundColor: '#E3262E', borderBottomWidth: 4, borderBottomColor: '#9E1218' },
  btnQuiet: { backgroundColor: 'transparent', borderColor: 'rgba(91,103,130,0.5)', borderWidth: 2 },
  btnText: { fontFamily: 'Shark', fontSize: 15, color: '#FFFFFF' },
  btnTextGold: { color: INK },
  btnTextQuiet: { color: MUTED_INK, fontSize: 14 },
  message: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF', textAlign: 'center' },
});
