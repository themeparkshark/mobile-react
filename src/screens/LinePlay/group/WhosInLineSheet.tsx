/**
 * "Who's in line?" (L3): the Line Play session opener. One tap for solo, two
 * more for a crew. Nothing waits on it: the verified wait is already counting
 * underneath, and the line never pauses for it.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameButton, GameIcon, SHADOW, type GameIconName } from '../../../ui';
import {
  createLineGroup, defaultGroupSize, defaultKidFlag, defaultPlayerName, groupSizeRange,
  MAX_NAME_LENGTH, type GroupKind, type LineGroup,
} from '../../../services/lineplay/lineGroup';
import PlayerBadge from './PlayerBadge';

const CREW_ART = require('../../../../assets/images/screens/lineplay/line-crew-sharks.png');

const DOORS: ReadonlyArray<{ kind: GroupKind; icon: GameIconName; title: string; body: string }> = [
  { kind: 'solo', icon: 'shark', title: 'Just me', body: 'My games, my pace' },
  { kind: 'couple', icon: 'heart', title: 'The two of us', body: 'Take turns on one phone' },
  { kind: 'family', icon: 'star', title: 'Family with kids', body: 'Easier rounds for kids' },
  { kind: 'friends', icon: 'crown', title: 'Friends', body: 'Up to 6, pass the phone' },
];

const KIND_TITLE: Record<GroupKind, string> = {
  solo: 'Just me', couple: 'The two of us', family: 'Family crew', friends: 'Friend crew',
};

interface Row { name: string; kid: boolean }

export function crewSummary(group: LineGroup): string {
  const names = group.players.map(player => player.name);
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

export default function WhosInLineSheet({ visible, ownerName, lastCrew, editing, onChoose, onClose }: {
  readonly visible: boolean;
  readonly ownerName?: string | null;
  /** Today's earlier crew, offered as one tap. */
  readonly lastCrew?: LineGroup | null;
  /** Editing the current crew mid-wait opens straight to the names. */
  readonly editing?: LineGroup | null;
  readonly onChoose: (group: LineGroup) => void;
  /** Close without changing anything (editing only). */
  readonly onClose?: () => void;
}) {
  const reducedMotion = useReducedGameMotion();
  const [kind, setKind] = useState<GroupKind | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const openWith = (next: GroupKind, from?: LineGroup | null) => {
    setKind(next);
    const size = from?.players.length ?? defaultGroupSize(next);
    setRows(Array.from({ length: size }, (_, index) => ({
      name: from?.players[index]?.name ?? (index === 0 && ownerName ? defaultPlayerName(0, next, ownerName) : ''),
      kid: from?.players[index]?.kid ?? defaultKidFlag(index, next),
    })));
  };

  useEffect(() => {
    if (!visible) return;
    if (editing && editing.kind !== 'solo') openWith(editing.kind, editing);
    else { setKind(null); setRows([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing]);

  const range = kind ? groupSizeRange(kind) : { min: 1, max: 1 };
  const filled = useMemo(() => rows.map((row, index) => ({
    name: row.name.trim() || `Player ${index + 1}`, kid: row.kid })), [rows]);

  if (!visible) return null;

  const pickDoor = (door: GroupKind) => {
    if (door === 'solo') { onChoose(createLineGroup('solo', [{ name: ownerName ?? 'Player 1' }])); return; }
    openWith(door);
  };
  const resize = (delta: number) => setRows(current => {
    const size = Math.max(range.min, Math.min(range.max, current.length + delta));
    if (size === current.length) return current;
    return size > current.length
      ? [...current, { name: '', kid: kind ? defaultKidFlag(current.length, kind) : false }]
      : current.slice(0, size);
  });

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.scrim}
      accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.fill} />
        <Animated.View entering={reducedMotion ? undefined : SlideInDown.springify().damping(16)} style={styles.sheet}>
          {kind == null ? (
            <>
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text style={styles.kicker}>LINEPLAY</Text>
                  <Text style={styles.title} accessibilityRole="header">Who&apos;s in line?</Text>
                  <Text style={styles.body}>Your wait is already counting. Pick your crew.</Text>
                </View>
                <Image source={CREW_ART} style={styles.crewArt} contentFit="contain"
                  accessibilityLabel="A crew of sharks waiting together" />
              </View>
              {lastCrew && <Pressable accessibilityRole="button"
                accessibilityLabel={`Same crew as last ride: ${crewSummary(lastCrew)}`}
                onPress={() => onChoose(lastCrew)} style={({ pressed }) => [styles.sameCrew, pressed && styles.pressed]}>
                <View style={styles.badgeRow}>
                  {lastCrew.players.slice(0, 4).map((player, index) =>
                    <View key={player.id} style={index > 0 ? styles.badgeOverlap : null}>
                      <PlayerBadge name={player.name} index={index} size={34} kid={player.kid} />
                    </View>)}
                </View>
                <View style={styles.sameCrewCopy}>
                  <Text style={styles.sameCrewTitle}>Same crew as last ride</Text>
                  <Text style={styles.sameCrewNames} numberOfLines={1}>{crewSummary(lastCrew)}</Text>
                </View>
                <GameIcon name="arrow" size={26} />
              </Pressable>}
              <View style={styles.doors}>
                {DOORS.map(door => <Pressable key={door.kind} accessibilityRole="button"
                  accessibilityLabel={`${door.title}. ${door.body}`} onPress={() => pickDoor(door.kind)}
                  style={({ pressed }) => [styles.door, pressed && styles.pressed]}>
                  <GameIcon name={door.icon} size={34} />
                  <Text style={styles.doorTitle}>{door.title}</Text>
                  <Text style={styles.doorBody}>{door.body}</Text>
                </Pressable>)}
              </View>
              {editing && onClose && <GameButton label="Never mind" variant="ghost" onPress={onClose} />}
            </>
          ) : (
            <>
              <Text style={styles.kicker}>{KIND_TITLE[kind].toUpperCase()}</Text>
              <Text style={styles.title} accessibilityRole="header">Who&apos;s playing?</Text>
              <Text style={styles.body}>
                {kind === 'family' ? 'Kids get simpler rounds. Names stay on this phone.' : 'One phone, turns in order. Names stay on this phone.'}
              </Text>
              {range.max > range.min && <View style={styles.sizeRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="One fewer player" hitSlop={8}
                  disabled={rows.length <= range.min} onPress={() => resize(-1)}
                  style={[styles.sizeButton, rows.length <= range.min && styles.disabled]}>
                  <Text style={styles.sizeButtonText}>-</Text>
                </Pressable>
                <Text style={styles.sizeText} accessibilityLiveRegion="polite">{rows.length} players</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="One more player" hitSlop={8}
                  disabled={rows.length >= range.max} onPress={() => resize(1)}
                  style={[styles.sizeButton, rows.length >= range.max && styles.disabled]}>
                  <Text style={styles.sizeButtonText}>+</Text>
                </Pressable>
              </View>}
              <ScrollView style={styles.rows} keyboardShouldPersistTaps="handled">
                {rows.map((row, index) => <View key={index} style={styles.row}>
                  <PlayerBadge name={filled[index]?.name ?? ''} index={index} size={38} kid={row.kid} />
                  <TextInput value={row.name} placeholder={`Player ${index + 1}`} placeholderTextColor={BRAND.navySoft}
                    maxLength={MAX_NAME_LENGTH} autoCorrect={false} autoCapitalize="words" returnKeyType="done"
                    accessibilityLabel={`Player ${index + 1} name`} style={styles.input}
                    onChangeText={text => setRows(current => current.map((item, at) => at === index ? { ...item, name: text } : item))} />
                  {kind === 'family' && <Pressable accessibilityRole="switch" accessibilityState={{ checked: row.kid }}
                    accessibilityLabel={`${filled[index]?.name ?? 'Player'} plays kid rounds`}
                    onPress={() => setRows(current => current.map((item, at) => at === index ? { ...item, kid: !item.kid } : item))}
                    style={[styles.kidPill, row.kid && styles.kidPillOn]}>
                    <Text style={[styles.kidPillText, row.kid && styles.kidPillTextOn]}>{row.kid ? 'KID' : 'GROWN-UP'}</Text>
                  </Pressable>}
                </View>)}
              </ScrollView>
              <GameButton label="Start playing" icon="play" onPress={() => onChoose(createLineGroup(kind, filled))} />
              <GameButton label={editing ? 'Keep current crew' : 'Back'} variant="ghost"
                onPress={() => { if (editing && onClose) onClose(); else setKind(null); }} />
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.scrim, zIndex: 50 },
  fill: { flex: 1 },
  sheet: { backgroundColor: BRAND.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 4, borderBottomWidth: 0, borderColor: BRAND.navy, paddingHorizontal: 18, paddingTop: 16,
    paddingBottom: 34, maxHeight: '86%', ...SHADOW.lifted },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1 },
  crewArt: { width: 118, height: 104, marginRight: -6 },
  kicker: { color: BRAND.blueBright, fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  title: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 28, lineHeight: 33, marginTop: 2 },
  body: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 16, lineHeight: 20, marginTop: 4, marginBottom: 10 },
  sameCrew: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.gold,
    borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 9, paddingHorizontal: 12,
    marginBottom: 10, ...SHADOW.card },
  badgeRow: { flexDirection: 'row' },
  badgeOverlap: { marginLeft: -12 },
  sameCrewCopy: { flex: 1 },
  sameCrewTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 17 },
  sameCrewNames: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 15 },
  doors: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  door: { width: '48.5%', minHeight: 112, borderRadius: 20, borderWidth: 3, borderColor: BRAND.navy,
    backgroundColor: BRAND.white, padding: 12, justifyContent: 'center', ...SHADOW.card },
  doorTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 18, marginTop: 6 },
  doorBody: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 8 },
  sizeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.gold, borderWidth: 3,
    borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  sizeButtonText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 24, lineHeight: 28 },
  sizeText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 20, minWidth: 110, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  rows: { maxHeight: 290, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  input: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 3, borderColor: BRAND.skyDeep,
    backgroundColor: BRAND.white, paddingHorizontal: 12, color: BRAND.navy, fontFamily: 'Knockout', fontSize: 19 },
  kidPill: { minWidth: 86, minHeight: 44, borderRadius: 22, borderWidth: 3, borderColor: BRAND.skyDeep,
    backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  kidPillOn: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  kidPillText: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.5 },
  kidPillTextOn: { color: BRAND.navy },
});
