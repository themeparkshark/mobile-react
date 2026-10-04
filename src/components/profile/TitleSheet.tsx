/**
 * Tap your title on your own profile: a small sheet that says what the title
 * means and how you earned it, with "Change title" (the titles you have
 * earned) and "Remove title". Every change goes through the server and the
 * profile refreshes from it, so the pill always shows what other players see.
 * Copy and rules: titleModel.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import getPrepItemSets, { equipSetTitle } from '../../api/endpoints/me/prep-item-sets';
import { equipStampTitle, getStamps } from '../../api/endpoints/me/stamps';
import { BRAND, GameButton, GameDialog, GameIcon, GameText } from '../../ui';
import { describeTitle, earnedTitles, type EarnedTitle } from './titleModel';

type Mode = 'about' | 'change';

export default function TitleSheet({ visible, title, onClose, onChanged }: {
  readonly visible: boolean;
  /** The title worn right now (player.title). */
  readonly title: string | null | undefined;
  readonly onClose: () => void;
  /** After a change is saved: refresh the player so the pill follows the server. */
  readonly onChanged: () => Promise<unknown> | void;
}) {
  const [mode, setMode] = useState<Mode>('about');
  const [earned, setEarned] = useState<EarnedTitle[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode(__DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW_TITLE_SHEET === 'change' ? 'change' : 'about');
    setError(null);
    let live = true;
    // Dev profile preview (offline): a fixture list so the sheet can be captured. Constant-folded out of release.
    if (__DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1') {
      setEarned(earnedTitles([
        { slug: 'churro_collection', name: 'Churro Collection', total_items: 24, starter_milestone: { target: 8, rewards_claimed: true, rewards: { title: 'Churro Collection Scout' } } },
        { slug: 'pretzel_collection', name: 'Pretzel Collection', total_items: 16, rewards_claimed: true, completion_rewards: { title: 'Pretzel Pro' } },
      ], { stamps: { rides: [{ id: 4, name: 'Coaster Champ', goal: 'Ride 10 coasters' }] }, unlocked_titles: [{ stamp_id: 4, title: 'Coaster Champ' }] }));
      return () => { live = false; };
    }
    void Promise.allSettled([getPrepItemSets(), getStamps()]).then(([sets, stamps]) => {
      if (!live) return;
      setEarned(earnedTitles(sets.status === 'fulfilled' ? sets.value : [], stamps.status === 'fulfilled' ? stamps.value : null));
    });
    return () => { live = false; };
  }, [visible]);

  const save = useCallback(async (key: string, run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await run();
      await onChanged();
      onClose();
    } catch {
      setError('That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, onChanged, onClose]);

  const wear = (entry: EarnedTitle) => save(entry.key, () => (entry.equip.kind === 'set'
    ? equipSetTitle(entry.equip.slug, true, entry.equip.tier)
    : equipStampTitle(entry.equip.stampId)));
  // stamp_id null clears whatever title is worn (users.equipped_title), from a book or a stamp.
  const remove = () => save('remove', () => equipStampTitle(null));

  const worn = title?.trim() || null;
  const others = (earned ?? []).filter(entry => entry.title !== worn);

  return (
    <GameDialog visible={visible} title={mode === 'about' ? 'Your title' : 'Change title'}
      buttons={[{ text: 'Close', style: 'cancel', variant: 'ghost' }]}
      onAnswer={() => onClose()} testID="title-sheet">
      {mode === 'about' ? (
        <View style={styles.body}>
          {!!worn && (
            <View style={styles.pill} accessible accessibilityLabel={`Title: ${worn}`}>
              <GameIcon name="crown" size={22} />
              <Text style={styles.pillText} numberOfLines={2} maxFontSizeMultiplier={1.3}>{worn}</Text>
            </View>
          )}
          <GameText preset="body" tone="onBlue" align="center" style={styles.copy}>
            {worn ? describeTitle(worn, earned ?? []) : 'You are not wearing a title.'}
          </GameText>
          <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.hint}>
            Your title shows under your shark for everyone to see.
          </GameText>
          {!!error && <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.error}>{error}</GameText>}
          <View style={styles.actions}>
            <GameButton label="Change title" tone="onBlue" icon="swap" disabled={!!busy}
              onPress={() => setMode('change')} accessibilityHint="Shows the titles you have earned" />
            {!!worn && (
              <GameButton label="Remove title" variant="danger" tone="onBlue" loading={busy === 'remove'} disabled={!!busy}
                onPress={() => { void remove(); }} accessibilityHint="Takes the title off your profile" />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          {earned === null ? (
            <GameText preset="body" tone="onBlue" align="center" style={styles.copy}>Finding your titles...</GameText>
          ) : others.length === 0 ? (
            <GameText preset="body" tone="onBlue" align="center" style={styles.copy}>
              No other titles yet. Finish Collection Book steps and stamps to earn more.
            </GameText>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
              {others.map(entry => (
                <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`Wear ${entry.title}`}
                  accessibilityHint={entry.meaning} disabled={!!busy} onPress={() => { void wear(entry); }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed, busy === entry.key && styles.rowBusy]}>
                  <GameIcon name="crown" size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                      maxFontSizeMultiplier={1.3}>{entry.title}</Text>
                    <Text style={styles.rowMeaning} numberOfLines={2} maxFontSizeMultiplier={1.3}>{entry.meaning}</Text>
                  </View>
                  <View style={styles.wear}><Text style={styles.wearText} maxFontSizeMultiplier={1.2}>WEAR</Text></View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!!error && <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.error}>{error}</GameText>}
          <View style={styles.actions}>
            <GameButton label="Back" variant="secondary" tone="onBlue" icon="back" disabled={!!busy} onPress={() => setMode('about')} />
          </View>
        </View>
      )}
    </GameDialog>
  );
}

const styles = StyleSheet.create({
  body: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%', minHeight: 44, backgroundColor: '#ffcf3b',
    borderRadius: 22, borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 5, borderBottomColor: '#d99a00',
    paddingHorizontal: 16, paddingVertical: 6,
  },
  pillText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 18, flexShrink: 1, textAlign: 'center' },
  copy: { color: '#e2f6ff' },
  hint: { color: '#bfe6ff' },
  error: { color: '#ffd6d6' },
  actions: { alignSelf: 'stretch', gap: 6, marginTop: 4 },
  list: { alignSelf: 'stretch', maxHeight: 300 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, backgroundColor: '#fff8e4', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 8,
  },
  rowPressed: { transform: [{ scale: 0.98 }] },
  rowBusy: { opacity: 0.6 },
  rowTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 17 },
  wear: { backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2, borderColor: '#d99a00', paddingHorizontal: 8, paddingVertical: 3 },
  wearText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  rowMeaning: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
});
