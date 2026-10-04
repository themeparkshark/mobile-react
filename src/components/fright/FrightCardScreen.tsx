/**
 * The Deep Lantern: one yearly card per event (CONTRACT 2). Ring of haunt
 * beads with re-swim counts (gold rim for Ten-in-One), pins, the Case Files
 * scroll ("17 of 36", cold cases), the Team tally, the Lantern level and the
 * recap history (reopens the Marquee). Read-only for friends via playerId.
 * Locked slots are silhouettes; "Back next fall" once the season has ended.
 * Easter eggs: tap the Lantern glass 3 times and Misty Mirror blinks back;
 * the 19th night glows extra bright.
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFrightCard, type FrightCard, type FrightSlot } from '../../api/endpoints/fright';
import { artFromCard, frameFor, orderCaseFiles, pinCounts, pinImage, rememberFrightArt, showTally, tallyFill } from '../../services/fright/art';
import { getFrightSnapshot } from '../../services/fright/store';
import { hauntsWord } from '../../services/fright/pace';
import { FlexShareButton } from '../../share';
import { badgeFlex, featuredNight, lanternFlex, nightFlex } from '../../services/fright/share';
import { COPY } from '../../services/fright/copy';
import { withTimeout } from '../../services/fright/timeout';
import { NightButton } from './ui';
import { formatMinutes, nightDateLabel } from '../../services/fright/dates';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import ArtImage from './ArtImage';
import { CASE_FILE_ART, caseFilePlate } from './CaseFileReveal';
import { MarqueeBody } from './MarqueeRecap';

export interface FrightCardParams {
  readonly eventSlug: string;
  readonly playerId?: number | null;
  /** 'pins': scroll to the pins section (reward reveal pins line); 'files': to the Case Files. */
  readonly section?: 'pins' | 'files' | null;
  /** A night to feature with its own Share row at the top (Marquee "Share from your Lantern"). */
  readonly nightOn?: string | null;
}

const RING = 220;

function Bead({ slot, index, total, gold, ended }: { slot: FrightSlot; index: number; total: number; gold: boolean; ended: boolean }) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const r = RING / 2 - 22;
  const size = 40;
  return (
    <View accessible accessibilityLabel={slot.earned ? `${slot.name}, survived${slot.runs > 1 ? `, ${slot.runs} runs` : ''}`
      : `Locked haunt${ended ? `. ${COPY.backNextFall}` : ''}`}
      style={[styles.bead, { width: size, height: size, left: RING / 2 + r * Math.cos(angle) - size / 2, top: RING / 2 + r * Math.sin(angle) - size / 2 },
        slot.earned ? styles.beadLit : styles.beadLocked, slot.earned && gold && styles.beadGold]}>
      {slot.earned ? <ArtImage uri={slot.badge} style={{ width: 30, height: 30 }} fallback={<GameIcon name="fin" size={22} />} />
        : <GameIcon name="lock" size={16} />}
      {slot.runs > 1 && <Text style={styles.reswim}>{`x${slot.runs}`}</Text>}
    </View>
  );
}

export default function FrightCardScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as Partial<FrightCardParams>;
  const [card, setCard] = useState<FrightCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recapNight, setRecapNight] = useState<string | null>(null);
  const [misty, setMisty] = useState(false);
  const taps = useRef<number[]>([]);
  const glow = useRef(new Animated.Value(0.6)).current;
  const scroll = useRef<ScrollView>(null);
  const [pinsY, setPinsY] = useState<number | null>(null);
  const [filesY, setFilesY] = useState<number | null>(null);
  const scrolledToPins = useRef(false);

  // Fright pins open here (never PinCollections): scroll once to the pins (or Case Files) section.
  useEffect(() => {
    const y = params.section === 'pins' ? pinsY : params.section === 'files' ? filesY : null;
    if (y == null || scrolledToPins.current) return;
    scrolledToPins.current = true;
    const timer = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 250);
    return () => clearTimeout(timer);
  }, [params.section, pinsY, filesY]);

  useEffect(() => {
    if (!params.eventSlug) { setFailed(true); return; }
    let current = true;
    setFailed(false);
    void withTimeout(getFrightCard(params.eventSlug, params.playerId)).then(next => {
      if (!current) return;
      if (next) { setCard(next); rememberFrightArt(artFromCard(next.art)); } else setFailed(true);
    });
    return () => { current = false; };
  }, [params.eventSlug, params.playerId, attempt]);

  const brightNight = card?.nights === 19;
  useEffect(() => {
    if (!brightNight) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [brightNight, glow]);

  const tapGlass = () => {
    const t = Date.now();
    taps.current = [...taps.current.filter(at => t - at < 1500), t];
    if (taps.current.length >= 3) {
      taps.current = [];
      setMisty(true);
      setTimeout(() => setMisty(false), 1800);
    }
  };

  const back = () => { if (navigation.canGoBack()) navigation.goBack(); };
  if (!card) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}><GameIcon name="back" size={34} /></Pressable>
        <Text style={styles.empty} accessibilityLiveRegion="polite">
          {failed ? 'Couldn\'t load your Deep Lantern. Check your signal and try again.' : 'The Lantern is loading. Hang tight.'}</Text>
        {failed && params.eventSlug && <NightButton label="Retry" icon="retry" onPress={() => setAttempt(value => value + 1)}
          style={{ marginTop: 16, alignSelf: 'center', minWidth: 160 }} />}
      </View>
    );
  }

  const ended = card.status === 'ended';
  const haunts = card.slots.filter(slot => slot.kind === 'haunt');
  const others = card.slots.filter(slot => slot.kind !== 'haunt');
  const pins = card.slots.filter(slot => slot.pin || slot.pin_art?.image || slot.pin_art?.locked);
  const frame = card.art.frames?.[frameFor(card)] ?? null;
  // An empty track until the first point (never a 50/50 fill at Chaos 0 · Control 0).
  const fill = tallyFill(card.tally);
  const lanternProgress = card.lantern.next_at ? Math.min(1, card.lantern.parts / card.lantern.next_at) : 1;
  const friend = !!params.playerId;
  // The Marquee's "Share from your Lantern": that night's share, up top (this is a screen, so Share works in release).
  const featured = friend ? null : featuredNight(card, params.nightOn);

  const pinCount = pinCounts(card);
  const files = orderCaseFiles(card.case_files);
  // Team Chaos vs Team Control stays hidden until encounters ship (server flag via tonight, or real tally points).
  const tallyOn = showTally(card.tally, getFrightSnapshot().encountersEnabled);

  return (
    <View style={styles.root}>
      {/* Sticky header under the safe area: nothing scrolls under the Dynamic Island. */}
      <View style={[styles.sticky, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}><GameIcon name="back" size={34} /></Pressable>
          <View style={{ flex: 1 }}>
            {card.art.card ? (
              <ArtImage uri={card.art.card} style={styles.headerArt} label={card.card_title}
                fallback={<Text style={styles.title} accessibilityRole="header">{card.card_title}</Text>} />
            ) : card.art.header ? (
              <View style={styles.headerArt}>
                <ArtImage uri={card.art.header} style={StyleSheet.absoluteFill} />
                <Text style={[styles.title, styles.headerTitle]} accessibilityRole="header">{card.card_title}</Text>
              </View>
            ) : <Text style={styles.title} accessibilityRole="header">{card.card_title}</Text>}
            <Text style={styles.sub}>{`${card.park_name} · ${card.nights} night${card.nights === 1 ? '' : 's'}${friend ? ' · Friend\'s card' : ''}`}</Text>
          </View>
          {/* Share Studio (a route, not a modal): the whole Deep Lantern. Own card only. */}
          {!friend && card.haunts_done > 0 && <FlexShareButton kind="fright_lifetime" payload={lanternFlex(card)} surface="fright_card" />}
        </View>

      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
        {featured && (
          <View style={styles.featured} accessible={false}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featuredTitle}>{`Your night: ${hauntsWord(featured.night.haunts)}`}</Text>
              <Text style={styles.meta}>{`${nightDateLabel(featured.night.night_on) ?? featured.night.night_on} · ${formatMinutes(featured.night.minutes_in_line)}`}</Text>
            </View>
            <FlexShareButton kind="fright_night" payload={nightFlex(card, featured.night, featured.number)} surface="fright_recap" size="md" />
          </View>
        )}
        <View style={styles.ringWrap}>
          {frame && <ArtImage uri={frame} style={styles.frame} />}
          <View style={[styles.ring, card.ten_in_one && styles.ringGold, frame ? styles.ringFramed : null]}>
            {haunts.map((slot, index) => <Bead key={slot.key} slot={slot} index={index} total={haunts.length} gold={card.ten_in_one} ended={ended} />)}
            <Pressable onPress={tapGlass} accessibilityRole="button" accessibilityLabel={`Deep Lantern, level ${card.lantern.level}`} style={styles.glass}>
              <Animated.View style={[styles.glassGlow, { opacity: brightNight ? glow : 0.55 }]} />
              <ArtImage uri={card.art.chip} style={{ width: 70, height: 70 }} fallback={<Image source={require('./art/lantern.webp')} style={{ width: 70, height: 70 }} contentFit="contain" />} />
              <Text style={styles.level}>{`Lv${card.lantern.level}`}</Text>
            </Pressable>
          </View>
          {misty && <Text style={styles.misty} accessibilityLiveRegion="polite">{COPY.misty}</Text>}
          {brightNight && <Text style={styles.misty}>{COPY.night19}</Text>}
          <Text style={styles.count}>{`${card.haunts_done} of ${card.haunts_total} haunts survived`}</Text>
          {card.ten_in_one && <Text style={styles.gold}>Ten-in-One Fin</Text>}
          {ended && card.haunts_done < card.haunts_total && <Text style={styles.sub}>{COPY.backNextFall}</Text>}
        </View>

        <Text style={styles.section}>Lantern</Text>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(lanternProgress * 100)}%` }]} /></View>
        <Text style={styles.meta}>{card.lantern.next_at ? `${card.lantern.parts} of ${card.lantern.next_at} Parts to Lv${card.lantern.level + 1}` : 'Fully lit!'}</Text>

        {tallyOn && <>
          <Text style={styles.section}>Team Chaos vs Team Control</Text>
          <View style={styles.tally} accessibilityLabel={`Chaos ${card.tally.chaos}, Control ${card.tally.control}`}>
            {fill && <>
              <View style={[styles.tallyChaos, { flex: fill.chaos }]} />
              <View style={[styles.tallyControl, { flex: fill.control }]} />
            </>}
          </View>
          <Text style={styles.meta}>{`Chaos ${card.tally.chaos} · Control ${card.tally.control}${card.tally.my_side ? ` · You: Team ${card.tally.my_side === 'chaos' ? 'Chaos' : 'Control'}` : ''}`}</Text>
        </>}

        <Text style={styles.section}>Haunts</Text>
        {haunts.map(slot => (
          <View key={slot.key} style={[styles.slotRow, !slot.earned && { opacity: 0.55 }]}>
            <GameIcon name={slot.earned ? 'check' : 'lock'} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.slotName}>{slot.earned || !ended ? slot.name : '???'}</Text>
              <Text style={styles.meta}>{[
                slot.earned && slot.first_on ? `First: ${nightDateLabel(slot.first_on)}` : null,
                slot.best_wait_minutes != null ? `Best wait ${formatMinutes(slot.best_wait_minutes)}` : null,
                slot.my_score != null ? `You: ${slot.my_score} fins` : null,
                slot.fan_rank != null && slot.fan_rank <= 3 ? `Fan favorite #${slot.fan_rank}` : null,
                !slot.earned && ended ? COPY.backNextFall : null,
              ].filter(Boolean).join(' · ')}</Text>
            </View>
            {!friend && (() => {
              const flex = badgeFlex(card, slot);
              return flex ? <FlexShareButton kind="fright_badge" payload={flex} surface="fright_card" /> : null;
            })()}
          </View>
        ))}

        {others.length > 0 && <Text style={styles.section}>Fright Reefs</Text>}
        {others.map(slot => (
          <View key={slot.key} style={[styles.slotRow, !slot.earned && { opacity: 0.55 }]}>
            <GameIcon name={slot.earned ? 'check' : 'lock'} size={18} />
            <Text style={[styles.slotName, { flex: 1 }]}>{slot.name}</Text>
          </View>
        ))}

        {pins.length > 0 && (
          <Text style={styles.section} onLayout={event => setPinsY(event.nativeEvent.layout.y)}>{`Pins ${pinCount.earned} of ${pinCount.total}`}</Text>
        )}
        <View style={styles.pins}>
          {pins.map(slot => (
            (() => {
              const art = pinImage(slot);
              return (
                <View key={slot.key} style={[styles.pin, !art.earned && styles.pinLocked]}
                  accessibilityLabel={art.earned ? slot.pin?.name ?? slot.name : 'Locked pin'}>
                  <ArtImage uri={art.uri} style={{ width: 52, height: 52 }}
                    fallback={<GameIcon name={art.earned ? 'pin' : 'lock'} size={28} />} />
                </View>
              );
            })()
          ))}
        </View>

        <Text style={styles.section} onLayout={event => setFilesY(event.nativeEvent.layout.y)}>{`Case Files ${card.case_files_found} of ${card.case_files_total}`}</Text>
        {files.found.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {files.found.map(file => (
              <View key={file.key} style={[styles.file, file.image ? styles.fileArt : null]}
                accessibilityLabel={`Case File ${file.number}. ${file.title}. ${file.body}`}>
                {file.image ? (
                  <>
                    {/* Card front art; its nameplate is blank, so the title sits on it (the year is on the art's medallion). */}
                    <ArtImage uri={file.image} fit="cover" style={StyleSheet.absoluteFill} />
                    <View style={styles.filePlate}>
                      <Text style={styles.filePlateTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{file.title}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.fileYear}>{`${file.number} · ${file.year_label}`}</Text>
                    <Text style={styles.fileTitle} numberOfLines={2}>{file.title}</Text>
                    <Text style={styles.fileBody} numberOfLines={4}>{file.body}</Text>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        )}
        {/* Locked files: small silhouettes, never tall empty tiles. */}
        {files.locked.length > 0 && (
          <View style={styles.lockedGrid}>
            {files.locked.map(file => (
              <View key={file.key} style={[styles.lockedFile, file.cold_case && styles.coldFile]}
                accessibilityLabel={`Case File ${file.number}, ${file.cold_case ? 'cold case' : 'not found yet'}`}>
                <GameIcon name="lock" size={14} />
                <Text style={styles.lockedNum}>{file.number}</Text>
              </View>
            ))}
          </View>
        )}

        {card.recaps.length > 0 && <Text style={styles.section}>Your nights</Text>}
        {card.recaps.slice().sort((a, b) => b.night_on.localeCompare(a.night_on)).map((item, index, list) => (
          <Pressable key={item.night_on} accessibilityRole="button" onPress={() => setRecapNight(item.night_on)} style={styles.recapRow}
            accessibilityLabel={`${nightDateLabel(item.night_on)}. ${hauntsWord(item.haunts)}. Open the Marquee.`}>
            <Text style={[styles.slotName, { flex: 1 }]}>{nightDateLabel(item.night_on) ?? item.night_on}</Text>
            <Text style={styles.meta}>{`${hauntsWord(item.haunts)} · ${formatMinutes(item.minutes_in_line)}`}</Text>
            {/* Recap share lives here (the Marquee is a modal; SHARE_IN_MODALS keeps its button hidden). */}
            {!friend && item.haunts > 0 && (
              <FlexShareButton kind="fright_night" payload={nightFlex(card, item, list.length - index)} surface="fright_recap" />
            )}
            <GameIcon name="arrow" size={16} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={!!recapNight} transparent animationType="slide" onRequestClose={() => setRecapNight(null)}>
        <View style={{ flex: 1, backgroundColor: NIGHT.scrim, justifyContent: 'flex-end' }}>
          {recapNight && <MarqueeBody eventSlug={card.event_slug} nightOn={recapNight} playerId={params.playerId} inModal
            onClose={() => setRecapNight(null)} />}
        </View>
      </Modal>
    </View>
  );
}

/** Case File art tiles: 160 pt wide (156 inside the border), the art's 480 x 719 shape. */
const THUMB_W = 156;
const THUMB_H = Math.round(THUMB_W * CASE_FILE_ART.h / CASE_FILE_ART.w);
const THUMB_PLATE = caseFilePlate(THUMB_W, THUMB_H);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NIGHT.midnight },
  sticky: { backgroundColor: NIGHT.midnight, paddingHorizontal: 16, paddingBottom: 6, zIndex: 2,
    borderBottomWidth: 1, borderBottomColor: 'rgba(185,168,230,0.25)' },
  lockedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  lockedFile: { width: 40, height: 52, borderRadius: 8, backgroundColor: NIGHT.haunt, borderWidth: 1, borderColor: NIGHT.dusk,
    alignItems: 'center', justifyContent: 'center', opacity: 0.7 },
  coldFile: { borderColor: NIGHT.fog },
  lockedNum: { fontFamily: 'Knockout', fontSize: 11, color: NIGHT.fog, marginTop: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Shark', fontSize: 24, color: NIGHT.candy },
  sub: { fontFamily: 'Knockout', fontSize: 14, color: NIGHT.fogLight, textAlign: 'center' },
  empty: { fontFamily: 'Knockout', fontSize: 18, color: NIGHT.fogLight, textAlign: 'center', marginTop: 80, paddingHorizontal: 24 },
  ringWrap: { alignItems: 'center', marginTop: 16 },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 4, borderColor: NIGHT.dusk, backgroundColor: NIGHT.haunt },
  ringGold: { borderColor: NIGHT.candy, borderWidth: 6 },
  bead: { position: 'absolute', borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  beadLit: { backgroundColor: NIGHT.lantern, borderColor: NIGHT.moon },
  beadGold: { borderColor: NIGHT.candy, borderWidth: 3 },
  beadLocked: { backgroundColor: NIGHT.midnight, borderColor: NIGHT.dusk },
  reswim: { position: 'absolute', bottom: -8, right: -8, fontFamily: 'Shark', fontSize: 11, color: NIGHT.ink, backgroundColor: NIGHT.candy,
    borderRadius: 8, paddingHorizontal: 4, overflow: 'hidden' },
  glass: { position: 'absolute', left: RING / 2 - 50, top: RING / 2 - 50, width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center' },
  glassGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: NIGHT.lantern },
  level: { position: 'absolute', bottom: 4, fontFamily: 'Shark', fontSize: 13, color: NIGHT.ink },
  misty: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fog, marginTop: 8, fontStyle: 'italic' },
  count: { fontFamily: 'Shark', fontSize: 18, color: NIGHT.white, marginTop: 12 },
  gold: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.candy, marginTop: 4 },
  section: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.candy, textTransform: 'uppercase', marginTop: 22, marginBottom: 6 },
  meta: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fog },
  bar: { height: 12, borderRadius: 6, backgroundColor: NIGHT.haunt, overflow: 'hidden', borderWidth: 2, borderColor: NIGHT.dusk },
  barFill: { height: '100%', backgroundColor: NIGHT.lantern },
  tally: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', borderWidth: 2, borderColor: NIGHT.dusk,
    backgroundColor: NIGHT.haunt },
  tallyChaos: { backgroundColor: NIGHT.pumpkin },
  tallyControl: { backgroundColor: '#3f9fb0' },
  headerArt: { height: 64, width: '100%', justifyContent: 'center' },
  headerTitle: { textAlign: 'center' },
  frame: { position: 'absolute', top: -18, width: RING + 36, height: RING + 36 },
  ringFramed: { borderColor: 'transparent' },
  // The art tile is the card's own shape; the title sits on the art's measured nameplate.
  filePlate: { position: 'absolute', top: THUMB_PLATE.top, height: THUMB_PLATE.height, left: THUMB_PLATE.left, right: THUMB_PLATE.right,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filePlateTitle: { fontFamily: 'Shark', fontSize: 13, color: NIGHT.ink, textAlign: 'center' },
  fileArt: { height: THUMB_H + 4, minHeight: undefined, padding: 0, overflow: 'hidden' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(185,168,230,0.2)' },
  slotName: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.white },
  pins: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pin: { width: 64, height: 64, borderRadius: 14, backgroundColor: NIGHT.haunt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: NIGHT.lantern },
  pinLocked: { borderColor: NIGHT.dusk },
  file: { width: 160, minHeight: 150, borderRadius: 14, backgroundColor: NIGHT.haunt, borderWidth: 2, borderColor: NIGHT.lantern, padding: 10 },
  fileLocked: { borderColor: NIGHT.dusk, opacity: 0.6 },
  fileYear: { fontFamily: 'Knockout', fontSize: 12, color: NIGHT.lantern },
  fileTitle: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.moon, marginTop: 2 },
  fileBody: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fogLight, marginTop: 4 },
  cold: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fog, marginTop: 6 },
  featured: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 2,
    borderColor: NIGHT.candy, backgroundColor: NIGHT.haunt, marginTop: 6 },
  featuredTitle: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.candy },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 44,
    borderBottomWidth: 1, borderBottomColor: 'rgba(185,168,230,0.2)' },
});
