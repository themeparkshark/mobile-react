/**
 * Tap your title on your own profile: a small sheet that says what the title
 * means and how you earned it, with "Change title" (the titles you have
 * earned, each with its book or stamp art) and a quiet "Remove title" (the
 * profile offers Undo right after). Every change goes through the server and the
 * profile refreshes from it, so the pill always shows what other players see.
 * Copy and rules: titleModel.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import getPrepItemSets, { equipSetTitle } from '../../api/endpoints/me/prep-item-sets';
import { equipStampTitle, getStamps } from '../../api/endpoints/me/stamps';
import { BRAND, GameButton, GameDialog, GameIcon, GameText } from '../../ui';
import { setBadge } from '../../screens/SetCollection/DexParts';
import { describeTitle, earnedTitles, findEarned, type EarnedTitle } from './titleModel';

const STAMP_SEAL = require('../../../assets/images/stamps/stamp-logo.png');

/** The title's own art: the book's badge (the same art as its Collection Book tab), the stamp seal, else the crown. */
function TitleArt({ entry, size }: { readonly entry: EarnedTitle | null; readonly size: number }) {
  if (entry?.equip.kind === 'set') {
    return <Image source={setBadge({ slug: entry.equip.slug, badgeUrl: entry.iconUrl })} style={{ width: size, height: size }} contentFit="contain" />;
  }
  if (entry?.equip.kind === 'stamp') return <Image source={STAMP_SEAL} style={{ width: size, height: size }} contentFit="contain" />;
  return <GameIcon name="crown" size={size - 4} />;
}

/** Wear a title through the endpoint that owns it (book step or stamp). */
export function equipEarned(entry: EarnedTitle): Promise<unknown> {
  return entry.equip.kind === 'set' ? equipSetTitle(entry.equip.slug, true, entry.equip.tier) : equipStampTitle(entry.equip.stampId);
}

type Mode = 'about' | 'change';

export default function TitleSheet({ visible, title, onClose, onChanged, onRemoved }: {
  readonly visible: boolean;
  /** The title worn right now (player.title). */
  readonly title: string | null | undefined;
  readonly onClose: () => void;
  /** After a change is saved: refresh the player so the pill follows the server. */
  readonly onChanged: () => Promise<unknown> | void;
  /** After Remove is saved: the title that came off (null if the lists did not know it), so the profile can offer Undo. */
  readonly onRemoved?: (previous: EarnedTitle | null) => void;
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
        { slug: 'churro_collection', name: 'Churro Collection', total_items: 24, starter_milestone: { target: 8, rewards_claimed: true, rewards: { title: 'Churro Finder' } } },
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

  const save = useCallback(async (key: string, run: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    haptic('tapLight');
    try {
      await run();
      await onChanged();
      haptic('success');
      playSfx('ui.confirm', 0.7);
      onClose();
      after?.();
    } catch {
      haptic('warning');
      setError('That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, onChanged, onClose]);

  const wear = (entry: EarnedTitle) => save(entry.key, () => equipEarned(entry));
  // stamp_id null clears whatever title is worn (users.equipped_title), from a book or a stamp.
  const remove = () => {
    const previous = findEarned(title, earned ?? []);
    return save('remove', () => equipStampTitle(null), () => onRemoved?.(previous));
  };

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
              <TitleArt entry={findEarned(worn, earned ?? [])} size={30} />
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
              // Quiet on purpose: taking a title off is the rare choice, and the profile offers Undo.
              <Pressable accessibilityRole="button" accessibilityLabel="Remove title" accessibilityHint="Takes the title off your profile"
                disabled={!!busy} hitSlop={8} onPress={() => { void remove(); }} style={({ pressed }) => [styles.remove, pressed && styles.rowPressed]}>
                <Text style={styles.removeText} maxFontSizeMultiplier={1.3}>{busy === 'remove' ? 'Removing...' : 'Remove title'}</Text>
              </Pressable>
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
                  <View style={styles.rowArt}><TitleArt entry={entry} size={40} /></View>
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
  rowArt: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#ffcf3b',
    alignItems: 'center', justifyContent: 'center' },
  // The WEAR pill: a small version of the yellow button (white rim, darker gold lip) so it reads as the tap.
  wear: { backgroundColor: '#ffcf3b', borderRadius: 14, borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4,
    borderBottomColor: '#d99a00', paddingHorizontal: 12, paddingVertical: 5, minHeight: 32, justifyContent: 'center' },
  wearText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, letterSpacing: 0.5 },
  remove: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  removeText: { fontFamily: 'Knockout', fontSize: 17, color: '#ffd6d6', textDecorationLine: 'underline' },
  rowMeaning: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
});
