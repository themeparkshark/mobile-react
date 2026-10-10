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
import { BRAND, GameButton, GameIcon, GameText } from '../../ui';
import StampSheet from '../../screens/stampbook/StampSheet';
import { setBadge } from '../../screens/SetCollection/DexParts';
import * as RootNavigation from '../../RootNavigation';
import { describeTitle, earnedTitles, findEarned, titleBadgeSlug, type EarnedTitle } from './titleModel';

const STAMP_SEAL = require('../../../assets/images/stamps/stamp-logo.png');

/**
 * The title's own art: the book's badge (the same art as its Collection Book tab), the stamp seal for stamps,
 * the crown only when neither is known. Without the lists (the profile pill) the book comes from the title's name.
 */
export function TitleArt({ entry, title, size }: { readonly entry: EarnedTitle | null; readonly title?: string | null; readonly size: number }) {
  const slug = entry?.equip.kind === 'set' ? entry.equip.slug : entry ? null : titleBadgeSlug(title);
  if (slug) {
    return <Image source={setBadge({ slug, badgeUrl: entry?.iconUrl ?? null })} style={{ width: size, height: size }} contentFit="contain" />;
  }
  if (entry?.equip.kind === 'stamp') {
    // The stamp's own art when the book sent it; with no art, the crown (never a generic badge).
    if (!entry.iconUrl) return <GameIcon name="crown" size={size - 4} />;
    return <Image source={{ uri: entry.iconUrl, cacheKey: entry.iconUrl }} style={{ width: size, height: size }} contentFit="contain" />;
  }
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
  /** Remove asked once for a title Undo cannot bring back. */
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(__DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW_TITLE_SHEET === 'change' ? 'change' : 'about');
    setError(null);
    setConfirming(false);
    let live = true;
    // Dev profile preview (offline): a fixture list so the sheet can be captured. Constant-folded out of release.
    if (__DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1') {
      setEarned(earnedTitles([
        { slug: 'churro_collection', name: 'Churro Collection', total_items: 24, starter_milestone: { target: 8, rewards_claimed: true, rewards: { title: 'Churro Finder' } } },
        { slug: 'pretzel_collection', name: 'Pretzel Collection', total_items: 16, rewards_claimed: true, completion_rewards: { title: 'Pretzel Pro' } },
      // The same dev book as the Stamp Book preview, so the profile list and the book's Titles list match in captures.
      ], require('../../screens/stampbook/preview').PREVIEW_BOOK));
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
    playSfx('ui.tap', 0.6);
    try {
      await run();
      await onChanged();
      haptic('success');
      playSfx('ui.confirm', 0.7);
      onClose();
      after?.();
    } catch {
      haptic('warning');
      playSfx('fail', 0.5);
      setError('That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, onChanged, onClose]);

  const wear = (entry: EarnedTitle) => save(entry.key, () => equipEarned(entry));
  // stamp_id null clears whatever title is worn (users.equipped_title), from a book or a stamp.
  // Disabled until the lists load, so Undo always knows which endpoint wears the title again.
  const remove = async () => {
    if (earned === null) return;
    const previous = findEarned(title, earned);
    // No Undo without knowing where the title came from (lists failed, or an event title): ask first,
    // inside this sheet (a second Modal over this one does not present on iOS).
    if (!previous && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    return save('remove', () => equipStampTitle(null), () => onRemoved?.(previous));
  };

  /** Every stamp title and how to get it lives in the Stamp Book's Titles list. */
  const openStampBook = () => { onClose(); RootNavigation.navigate('StampBook', { titles: true }); };

  const worn = title?.trim() || null;
  const others = (earned ?? []).filter(entry => entry.title !== worn);

  return (
    <StampSheet visible={visible} title={mode === 'about' ? 'Your title' : 'Change title'} onClose={onClose} testID="title-sheet">
      {mode === 'about' ? (
        <View style={styles.body}>
          {!!worn && (
            <View style={styles.source} accessible={false}>
              <TitleArt entry={findEarned(worn, earned ?? [])} title={worn} size={84} />
            </View>
          )}
          {!!worn && (
            <View style={styles.pill} accessible accessibilityLabel={`Title: ${worn}`}>
              <GameIcon name="crown" size={26} />
              <Text style={styles.pillText} numberOfLines={2} maxFontSizeMultiplier={1.3}>{worn}</Text>
            </View>
          )}
          <GameText preset="body" tone="onLight" align="center" style={styles.copy}>
            {worn ? describeTitle(worn, earned ?? []) : 'No title yet. Earn stamps to unlock titles, then wear one here.'}
          </GameText>
          {!!error && <GameText preset="bodySmall" tone="onLight" align="center" style={styles.error}>{error}</GameText>}
          {confirming && (
            <View style={styles.confirm} accessibilityLiveRegion="polite">
              <GameText preset="bodySmall" tone="onLight" align="center" style={styles.copy}>
                There is no Undo for this one. You might not get it back.
              </GameText>
              <GameButton label="Remove it" icon="close" variant="danger" tone="onLight" size="compact" loading={busy === 'remove'} disabled={!!busy}
                onPress={() => { void remove(); }} />
              <GameButton label="Keep it" icon="check" variant="ghost" tone="onLight" size="compact" disabled={!!busy} onPress={() => setConfirming(false)} />
            </View>
          )}
          <View style={[styles.actions, confirming && styles.hiddenActions]} pointerEvents={confirming ? 'none' : 'auto'}
            accessibilityElementsHidden={confirming} importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}>
            {/* Two jobs only: change it (the list ends with More titles) or take it off. */}
            <GameButton label="Change title" tone="onLight" icon="swap" disabled={!!busy}
              onPress={() => setMode('change')} accessibilityHint="Shows the titles you have and where to get more" />
            {!!worn && (
              // The same quiet white pill as the Stamp Book's Take off: one gold button per sheet.
              <Pressable onPress={() => { void remove(); }} disabled={!!busy || earned === null} hitSlop={6}
                accessibilityRole="button" accessibilityLabel="Take off title" accessibilityHint="Takes the title off your profile"
                style={({ pressed }) => [styles.takeOff, (busy || earned === null) && styles.removeOff, pressed && styles.rowPressed]}>
                <GameIcon name="close" size={18} />
                <Text style={styles.takeOffText} maxFontSizeMultiplier={1.4}>{busy === 'remove' ? 'Saving...' : 'Take off'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          {earned === null ? (
            <GameText preset="body" tone="onLight" align="center" style={styles.copy}>Finding your titles...</GameText>
          ) : others.length === 0 ? (
            <GameText preset="body" tone="onLight" align="center" style={styles.copy}>
              No other titles yet. Finish Collection Book steps and stamps to earn more.
            </GameText>
          ) : null}
          {earned === null ? null : others.length === 0 ? (
            <GameButton label="Find titles" icon="medal1" variant="secondary" tone="onLight" onPress={openStampBook} />
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
                    <Text style={styles.rowMeaning} maxFontSizeMultiplier={1.3}>{entry.meaning}</Text>
                  </View>
                  <View style={styles.wear}><Text style={styles.wearText} maxFontSizeMultiplier={1.2}>WEAR</Text></View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!!error && <GameText preset="bodySmall" tone="onLight" align="center" style={styles.error}>{error}</GameText>}
          <View style={styles.actions}>
            {earned !== null && others.length > 0 && (
              <GameButton label="More titles" icon="medal1" variant="secondary" tone="onLight" disabled={!!busy} onPress={openStampBook}
                accessibilityHint="Opens the Titles list in your Stamp Book" />
            )}
          </View>
        </View>
      )}
    </StampSheet>
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
  copy: { color: BRAND.navy },
  hint: { color: '#4A5A78' },
  error: { color: '#B3261E' },
  actions: { alignSelf: 'stretch', gap: 2, marginTop: 4, marginBottom: -6 },
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
  confirm: { alignSelf: 'stretch', gap: 4, backgroundColor: 'rgba(20,33,61,0.07)', borderRadius: 14, padding: 10 },
  hiddenActions: { opacity: 0.3 },
  remove: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 44,
    minWidth: 160, justifyContent: 'center' },
  removeOff: { opacity: 0.45 },
  removeText: { fontFamily: 'Knockout', fontSize: 18, color: 'rgba(255,255,255,0.85)', textDecorationLine: 'underline' },
  source: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#ffcf3b',
    alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'center' },
  pairItem: { flex: 1 },
  takeOff: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: '#9FB2C9', borderBottomWidth: 4,
  },
  takeOffText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  rowMeaning: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
});
