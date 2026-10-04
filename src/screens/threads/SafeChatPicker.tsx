/**
 * Safe Chat picker: the Club Penguin way to post. A kid picks a category, taps a phrase and
 * fills its blank with a park, ride or snack spot from our own data. Nothing typed ever goes
 * into a Safe Chat post, so it publishes at once. Reactions stay on the post's reaction bar.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { fetchSafeChatPlaces } from '../../api/endpoints/social';
import { BRAND, GameIcon, isGameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { PressScale } from './socialLook';
import {
  SAFE_CHAT_CATEGORIES,
  phraseById,
  phraseLabel,
  phraseSlot,
  type SafeChatPick,
  type SafeChatPlace,
  type SafeChatSlot,
} from './socialModel';

let placesCache: SafeChatPlace[] | null = null;

/** Places load once per app session; phrases without a blank work even before they arrive. */
export function useSafeChatPlaces(): SafeChatPlace[] {
  const [places, setPlaces] = useState<SafeChatPlace[]>(placesCache ?? []);
  useEffect(() => {
    if (placesCache) return;
    fetchSafeChatPlaces()
      .then((list) => {
        placesCache = list;
        setPlaces(list);
      })
      .catch(() => undefined);
  }, []);
  return places;
}

const SLOT_WORD: Readonly<Record<SafeChatSlot, string>> = { ride: 'a ride', park: 'a park', food: 'a snack spot' };

export default function SafeChatPicker({
  places,
  pick,
  onPick,
  startCategory = 'cheers',
  compact = false,
}: {
  readonly places: readonly SafeChatPlace[];
  readonly pick: SafeChatPick | null;
  readonly onPick: (pick: SafeChatPick | null) => void;
  readonly startCategory?: string;
  /** Reply sheet: shorter phrase area. */
  readonly compact?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const [category, setCategory] = useState(startCategory);
  const parks = useMemo(() => places.filter((p) => p.kind === 'park'), [places]);
  const [parkId, setParkId] = useState<number | null>(null);
  useEffect(() => {
    if (parkId === null && parks.length > 0) setParkId(parks[0].park_id);
  }, [parks, parkId]);

  const current = SAFE_CHAT_CATEGORIES.find((c) => c.key === category) ?? SAFE_CHAT_CATEGORIES[0];
  const phrase = phraseById(pick?.phrase);
  const slot = phrase ? phraseSlot(phrase.text) : null;
  // Search only filters our own list of places; the typed letters are never posted.
  const [search, setSearch] = useState('');
  useEffect(() => setSearch(''), [slot]);
  const choices = useMemo(() => {
    const list = slot === 'park' ? parks : places.filter((p) => p.kind === slot && (search.trim() ? true : p.park_id === parkId));
    const q = search.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 60) : list;
  }, [slot, parks, places, parkId, search]);

  const choosePhrase = (id: string) => {
    if (pick?.phrase === id) {
      onPick(null);
      return;
    }
    const next = phraseById(id);
    // Keep the chosen place when the new phrase needs the same kind of blank.
    const keep = next && pick?.place && places.find((p) => p.id === pick.place)?.kind === phraseSlot(next.text);
    onPick({ phrase: id, place: keep ? pick?.place : null });
  };

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityLabel="Safe Chat categories">
        {(compact ? [...SAFE_CHAT_CATEGORIES].sort((a, b) => Number(b.key === startCategory) - Number(a.key === startCategory)) : SAFE_CHAT_CATEGORIES).map((c) => {
          const on = c.key === current.key;
          return (
            <PressScale
              key={c.key}
              onPress={() => setCategory(c.key)}
              accessibilityRole="tab"
              accessibilityLabel={c.title}
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
              testID={`safechat-tab-${c.key}`}
            >
              {isGameIconName(c.icon) && <GameIcon name={c.icon} size={22} />}
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{c.title}</Text>
            </PressScale>
          );
        })}
      </ScrollView>

      {/* The blank comes right under the tabs, so the next tap is always in view. */}
      {slot && (
        <Animated.View entering={reduced ? undefined : FadeIn} style={styles.slotBox}>
          <Text style={styles.slotTitle}>Pick {SLOT_WORD[slot]}</Text>
          {slot !== 'park' && (
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={slot === 'food' ? 'Search snack spots' : 'Search rides'}
              placeholderTextColor="#7d95b5"
              style={styles.search}
              autoCorrect={false}
              maxLength={40}
              accessibilityLabel={slot === 'food' ? 'Search snack spots' : 'Search rides'}
              testID="safechat-search"
            />
          )}
          {slot !== 'park' && parks.length > 1 && !search.trim() && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parkRow} accessibilityLabel="Parks">
              {parks.map((p) => {
                const on = p.park_id === parkId;
                return (
                  <PressScale key={p.id} onPress={() => setParkId(p.park_id)} accessibilityState={{ selected: on }} accessibilityLabel={p.name} style={[styles.park, on && styles.parkOn]}>
                    <Text style={[styles.parkText, on && styles.parkTextOn]} numberOfLines={1}>{p.name}</Text>
                  </PressScale>
                );
              })}
            </ScrollView>
          )}
          <ScrollView style={styles.placeScroll} nestedScrollEnabled contentContainerStyle={styles.places}>
            {choices.length === 0 ? (
              <Text style={styles.empty}>{search.trim() ? 'No match. Try fewer letters!' : 'Loading the parks...'}</Text>
            ) : (
              choices.map((p) => {
                const on = pick?.place === p.id;
                return (
                  <PressScale
                    key={p.id}
                    onPress={() => pick && onPick({ ...pick, place: on ? null : p.id })}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={p.name}
                    style={[styles.place, on && styles.placeOn]}
                    testID={`safechat-place-${p.id}`}
                  >
                    <Text style={[styles.placeText, on && styles.placeTextOn]} numberOfLines={2}>{p.name}</Text>
                  </PressScale>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      )}

      <ScrollView style={compact ? styles.phrasesCompact : undefined} nestedScrollEnabled contentContainerStyle={styles.phrases}>
        {current.phrases.map((p, i) => {
          const on = pick?.phrase === p.id;
          return (
            <Animated.View key={p.id} entering={reduced ? undefined : FadeInDown.delay(Math.min(i, 10) * 18)}>
              <PressScale
                onPress={() => choosePhrase(p.id)}
                scaleTo={0.93}
                accessibilityLabel={phraseLabel(p.text).replace(/\[(\w+)\]/, 'blank $1')}
                accessibilityState={{ selected: on }}
                style={[styles.phrase, on && styles.phraseOn]}
                testID={`safechat-phrase-${p.id}`}
              >
                <Text style={[styles.phraseText, on && styles.phraseTextOn]}>{phraseLabel(p.text)}</Text>
              </PressScale>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  tabs: { gap: 8, paddingRight: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: 'rgba(5,52,110,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  tabOn: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip, borderBottomWidth: 4 },
  tabText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, marginTop: 3 },
  tabTextOn: { color: BRAND.navy },
  phrases: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phrasesCompact: { maxHeight: 190 },
  phrase: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: BRAND.white, borderWidth: 2, borderBottomWidth: 4, borderColor: '#9cc8ef',
  },
  phraseOn: { backgroundColor: BRAND.navy, borderColor: BRAND.navy },
  phraseText: { fontFamily: 'Knockout', fontSize: 19, color: BRAND.navy },
  phraseTextOn: { color: BRAND.white },
  slotBox: { backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, padding: 10, gap: 8 },
  slotTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginTop: 2 },
  search: { minHeight: 44, borderRadius: 12, borderWidth: 2, borderColor: '#bcd8f5', backgroundColor: BRAND.white, paddingHorizontal: 12, fontFamily: 'Knockout', fontSize: 18, color: BRAND.navy },
  parkRow: { gap: 6 },
  park: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: 2, borderColor: '#bcd8f5', backgroundColor: BRAND.white, maxWidth: 220 },
  parkOn: { backgroundColor: BRAND.sky, borderColor: BRAND.blue },
  parkText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  parkTextOn: { color: BRAND.navy },
  placeScroll: { maxHeight: 170 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  place: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#bcd8f5', maxWidth: 300 },
  placeOn: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  placeText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy },
  placeTextOn: { color: BRAND.navy },
  empty: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
});
