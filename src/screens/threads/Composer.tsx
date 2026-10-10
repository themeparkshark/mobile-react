/**
 * The new-post screen. It replaces the old 78% sheet, whose header (close,
 * Post) slid off the top of the phone when the keyboard opened, leaving a
 * blank white box.
 *
 * Full screen, header pinned: X on the left, the gold POST button on the
 * right, always visible. Then two big steps a 7-year-old can follow
 * without reading much (no topics or tags, Dustin's call):
 *   1. pick a Safe Chat phrase, or write your own in the card that looks
 *      exactly like the post will
 *   2. POST: it pulses while sending, then confetti, the shark and "Posted!"
 * The draft is saved as you type, survives a failed post, and comes back
 * if the screen is closed by accident.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postThread, editThread, fetchPostingStatus } from '../../api/endpoints/social';
import Avatar from '../../components/Avatar';
import RewardBurst from '../../components/RewardBurst';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { isTeam, TEAMS } from '../../constants/teams';
import * as Haptics from '../../helpers/haptics';
import type { ThreadType } from '../../models/thread-type';
import { BRAND, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GoldPill, PressScale, card } from './socialLook';
import { CLEAN } from '../../components/CleanScreenBackground';
import useKeyboardInset from './useKeyboardInset';
import SafeChatPicker, { useSafeChatPlaces } from './SafeChatPicker';
import {
  DEFAULT_PROMPT,
  DRAFT_LINES,
  POST_MAX,
  categoryForTopic,
  DISCLOSURE_LINE,
  isCareHold,
  isDisclosure,
  phraseById,
  phraseLabel,
  checkDraft,
  composeSafeChat,
  FREE_TEXT_LINE,
  type SafeChatPick,
  CARE_LINE,
  HINT_DEBOUNCE_MS,
  isDistress,
  quickDraftProblem,
  reviewLine,
  pauseLine,
  errorLine,
} from './socialModel';

const SHARK = require('../../../assets/images/screens/pin-collections/shark.png');
// success.mp3 is a broken 111-byte file: a published post whooshes away like a reply.
const SUCCESS = require('../../../assets/sounds/whoosh.mp3');
const NOPE = require('../../../assets/sounds/nope.mp3');
const OPEN = require('../../../assets/sounds/modal_open.mp3');

const draftKey = (playerId?: number) => `social.draft.v2.${playerId ?? 'guest'}`;

// Older saved drafts may still carry a topic; it is ignored.
interface Draft { text: string; team: boolean }

export default function Composer({
  visible,
  onClose,
  onPosted,
  editing,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onPosted: (thread: ThreadType, edited: boolean) => void;
  /** Edit an existing post instead of writing a new one. */
  readonly editing?: ThreadType | null;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const keyboard = useKeyboardInset(height, reduced);
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const playerTeam = (player as { team?: { team?: string } } | null)?.team?.team;
  const team = isTeam(playerTeam) ? TEAMS[playerTeam] : null;

  const [text, setText] = useState('');
  const [toTeam, setToTeam] = useState(false);
  const [phase, setPhase] = useState<'write' | 'posting' | 'done'>('write');
  const [serverLine, setServerLine] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const burst = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const wiggleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: wiggle.value }] }));
  const scrollRef = useRef<ScrollView>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the keyboard lands (or changes height) while typing, bring the post card fully into view.
  useEffect(() => {
    if (keyboard > 0 && inputRef.current?.isFocused()) {
      const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduced }), 60);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [keyboard, reduced]);
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);

  // Load the saved draft (or the post being edited) each time the screen opens.
  useEffect(() => {
    if (!visible) return;
    setPhase('write');
    setServerLine(null);
    setTouched(false);
    burst.value = 0;
    playSound(OPEN, { volume: 0.5 });
    if (editing) {
      setText(editing.content || editing.title || '');
      setToTeam(Boolean(editing.team));
      return;
    }
    AsyncStorage.getItem(draftKey(player?.id))
      .then((raw) => {
        const saved: Draft | null = raw ? JSON.parse(raw) : null;
        setText(saved?.text ?? '');
        setToTeam(Boolean(saved?.team && team));
      })
      .catch(() => undefined);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save as you type (new posts only).
  useEffect(() => {
    if (!visible || editing || phase === 'done') return;
    const id = setTimeout(() => {
      const draft: Draft = { text, team: toTeam };
      AsyncStorage.setItem(draftKey(player?.id), JSON.stringify(draft)).catch(() => undefined);
    }, 300);
    return () => clearTimeout(id);
  }, [text, toTeam, visible, editing, phase, player?.id]);

  // Keystroke path: only the cheap check (empty, too long). The full filter runs on the
  // debounced text below and again on submit, so a 500-character post never lags.
  const quick = quickDraftProblem(text, POST_MAX);
  // The live hint follows the text after a short pause, so a long post never lags while typing.
  const [hintText, setHintText] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setHintText(text), HINT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);
  const hintProblem = useMemo(() => checkDraft(hintText, POST_MAX), [hintText]);
  // Self-harm words never block: a kind line now, and the server holds the post for a grown-up.
  const care = useMemo(() => isDistress(hintText), [hintText]);
  const disclosure = useMemo(() => isDisclosure(hintText), [hintText]);
  // A kid on a posting break learns it before typing, not after.
  const [pausedLine, setPausedLine] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setPausedLine(null);
    fetchPostingStatus().then((s) => {
      setPausedLine(s.paused ? pauseLine(s.paused_until) : null);
      setFreeTextBy(s.free_text === 'ai' ? 'ai' : 'person');
    }).catch(() => undefined);
  }, [visible]);
  const [held, setHeld] = useState<string | null>(null);
  // Safe Chat is the default way to post: picked phrases publish at once. "Write my own" is
  // free text, which a grown-up checks first while AI review is off.
  const [mode, setMode] = useState<'safe' | 'free'>('safe');
  const [pick, setPick] = useState<SafeChatPick | null>(null);
  const [freeTextBy, setFreeTextBy] = useState<'person' | 'ai'>('person');
  const places = useSafeChatPlaces();
  const safeText = composeSafeChat(pick, places);
  const safeMode = mode === 'safe' && !editing;
  useEffect(() => {
    if (!visible) return;
    setMode(editing ? 'free' : 'safe');
    setPick(null);
  }, [visible, editing]);
  const showProblem = hintProblem && hintProblem !== 'empty' ? DRAFT_LINES[hintProblem] : null;
  const line = serverLine ?? pausedLine ?? showProblem ?? (disclosure ? DISCLOSURE_LINE : care ? CARE_LINE : null);
  const canPost = phase === 'write' && !pausedLine && (safeMode ? safeText !== null : !quick);
  const left = POST_MAX - text.trim().length;

  const close = async () => {
    if (phase === 'posting') return;
    Keyboard.dismiss();
    // New posts keep their draft automatically, so closing never loses words.
    onClose();
  };

  const submit = async () => {
    setTouched(true);
    if (phase !== 'write') return;
    // Only empty or too long stops here. Anything else goes to the server, which refuses it
    // with the same friendly line and records it for a grown-up: no refusal is ever silent.
    const problem = safeMode ? (safeText === null ? 'empty' : null) : quickDraftProblem(text, POST_MAX);
    if (problem || pausedLine) {
      // An empty or unsafe post never just sits there: the card wiggles, a soft "nope", and the cursor is ready.
      playSound(NOPE, { volume: 0.5 });
      void Haptics.notificationAsync('warning');
      if (!reduced) {
        wiggle.value = withSequence(
          withTiming(-10, { duration: 50 }), withTiming(10, { duration: 70 }),
          withTiming(-7, { duration: 60 }), withTiming(5, { duration: 60 }), withTiming(0, { duration: 50 }),
        );
      }
      inputRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setPhase('posting');
    setServerLine(null);
    const content = text.trim();
    try {
      const where = { topic: null, team: toTeam && playerTeam ? playerTeam : null };
      const thread = editing
        ? await editThread(editing.id, content)
        : safeMode && pick
          ? await postThread({ safeChat: pick, ...where })
          : await postThread({ content, ...where });
      setHeld(thread.review ?? null);
      setPhase('done');
      // A care or safety hold is a calm moment: no confetti, no chime, no success buzz.
      if (!isCareHold(thread.review)) {
        playSound(SUCCESS, { volume: 0.7 });
        void Haptics.notificationAsync('success');
        if (!reduced) burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
      }
      if (!editing && !safeMode) AsyncStorage.removeItem(draftKey(player?.id)).catch(() => undefined);
      // Give a kid time to read the care or safety line before the screen closes.
      doneTimer.current = setTimeout(() => {
        onPosted({ ...thread, player: thread.player ?? (player as ThreadType['player']) }, Boolean(editing));
      }, isCareHold(thread.review) ? 6000 : reduced ? 700 : 1150);
    } catch (error) {
      setPhase('write');
      setServerLine(errorLine(error));
      playSound(NOPE, { volume: 0.5 });
      void Haptics.notificationAsync('error');
    }
  };

  return (
    <Modal visible={visible} animationType={reduced ? 'fade' : 'slide'} presentationStyle="fullScreen" onRequestClose={close}>
      <View style={styles.root}>
        {/* Full-screen modal: the keyboard's own height is the exact bottom padding. */}
        <View style={{ flex: 1, paddingBottom: keyboard }}>
          {/* Header: never moves, never hides. */}
          <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
            <PressScale onPress={close} hitSlop={8} accessibilityLabel="Close" accessibilityHint="Your words are saved for later">
              <GameIcon name="close" size={44} />
            </PressScale>
            <Text style={styles.title} accessibilityRole="header">{editing ? 'Edit Post' : 'New Post'}</Text>
            <GoldPill
              label={phase === 'posting' ? 'Posting' : editing ? 'Save' : 'Post'}
              onPress={submit}
              loading={phase === 'posting'}
              dimmed={!canPost && phase === 'write'}
              accessibilityLabel={editing ? 'Save post' : 'Post it'}
            />
          </View>

          <LinearGradient
            colors={['rgba(5,104,185,0.95)', 'rgba(5,104,185,0)']}
            style={styles.headerFade}
            pointerEvents="none"
          />
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.scroll, { paddingBottom: keyboard > 0 ? 16 : insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {team && !editing && (
              <View style={styles.who}>
                <Text style={styles.whoLabel}>Who sees it?</Text>
                <View style={styles.seg}>
                  <PressScale onPress={() => setToTeam(false)} accessibilityRole="button" accessibilityState={{ selected: !toTeam }} style={[styles.segBtn, !toTeam && styles.segOn]}>
                    <GameIcon name="map" size={20} />
                    <Text style={[styles.segText, !toTeam && styles.segTextOn]}>Everyone</Text>
                  </PressScale>
                  <PressScale onPress={() => setToTeam(true)} accessibilityRole="button" accessibilityState={{ selected: toTeam }} style={[styles.segBtn, toTeam && styles.segOn]}>
                    <Image source={team.badge} style={{ width: 20, height: 20 }} contentFit="contain" />
                    <Text style={[styles.segText, toTeam && styles.segTextOn]} numberOfLines={1}>{team.name}</Text>
                  </PressScale>
                </View>
              </View>
            )}

            {!editing && (
              <View style={styles.seg} accessibilityRole="tablist">
                <PressScale onPress={() => { setMode('safe'); Keyboard.dismiss(); }} accessibilityRole="tab" accessibilityState={{ selected: mode === 'safe' }} style={[styles.segBtn, mode === 'safe' && styles.segOn]} testID="composer-mode-safe">
                  <GameIcon name="shark" size={22} />
                  <Text style={[styles.segText, mode === 'safe' && styles.segTextOn]}>Safe Chat</Text>
                </PressScale>
                <PressScale onPress={() => { setMode('free'); setTimeout(() => inputRef.current?.focus(), 150); }} accessibilityRole="tab" accessibilityState={{ selected: mode === 'free' }} style={[styles.segBtn, mode === 'free' && styles.segOn]} testID="composer-mode-free">
                  <GameIcon name="edit" size={20} />
                  <Text style={[styles.segText, mode === 'free' && styles.segTextOn]}>Write my own</Text>
                </PressScale>
              </View>
            )}

            {/* The card the post will look like. */}
            <Animated.View style={[card.shell, styles.preview, touched && (safeMode ? safeText === null : quick === 'empty') && { borderColor: BRAND.gold }, wiggleStyle]}>
              <View style={styles.previewHead}>
                <Avatar player={player as ThreadType['player']} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>{player?.screen_name ?? 'You'}</Text>
                </View>
              </View>
              {safeMode ? (
                <Text style={[styles.input, styles.safePreview, !safeText && styles.safePlaceholder]} accessibilityLiveRegion="polite">
                  {safeText ?? (pick ? phraseLabel(phraseById(pick.phrase)?.text ?? '') : 'Tap a phrase below to build your post!')}
                </Text>
              ) : (
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={(value) => { setText(value); setServerLine(null); }}
                // On a posting break the box is read-only: no typing a post that cannot be sent.
                editable={!pausedLine}
                placeholder={DEFAULT_PROMPT}
                placeholderTextColor="#7d95b5"
                multiline
                maxLength={POST_MAX + 50}
                style={styles.input}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduced }), 280)}
                accessibilityLabel="Your post"
                accessibilityHint={DEFAULT_PROMPT}
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
              )}
              <View style={styles.footer}>
                {line ? (
                  <Animated.View entering={reduced ? undefined : FadeIn} exiting={reduced ? undefined : FadeOut} style={styles.lineWrap} accessibilityLiveRegion="polite">
                    <GameIcon name="info" size={20} />
                    <Text style={styles.line}>{line}</Text>
                  </Animated.View>
                ) : safeMode ? (
                  <View style={styles.lineWrap}>
                    <GameIcon name="rush" size={18} />
                    <Text style={styles.kind}>Safe Chat posts go up right away!</Text>
                  </View>
                ) : (
                  <View style={styles.lineWrap}>
                    <GameIcon name="heart" size={18} />
                    <Text style={styles.kind}>{freeTextBy === 'person' ? FREE_TEXT_LINE : 'Be kind. No real names or addresses.'}</Text>
                  </View>
                )}
                {!safeMode && left < 60 && <Text style={[styles.left, left < 0 && { color: BRAND.red }]}>{left}</Text>}
              </View>
            </Animated.View>

            {safeMode && (
              <SafeChatPicker
                startCategory={categoryForTopic(null)}
                places={places}
                pick={pick}
                onPick={(next) => { setPick(next); setServerLine(null); }}
              />
            )}
          </ScrollView>
        </View>

        {phase === 'done' && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Its own moment: the form fades behind a navy scrim, the shark and ribbon sit dead center. */}
            <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, styles.doneScrim]} />
            {!isCareHold(held) && <RewardBurst progress={burst} x={width / 2} y={height * 0.5} />}
            <Animated.View entering={reduced ? FadeIn : ZoomIn.springify().damping(10)} style={[styles.doneWrap, { top: height * 0.5 - 110 }]}>
              {!isCareHold(held) && <View style={styles.doneGlow} />}
            <Image source={SHARK} style={styles.doneShark} contentFit="contain" />
              <View style={styles.doneRibbon}>
                <Text style={styles.doneText}>{held === 'safety' ? 'Thank you' : held === 'care' ? 'We hear you' : held === 'person' ? 'Grown-up check' : held ? 'Quick look!' : editing ? 'Saved!' : 'Posted!'}</Text>
              </View>
              {held && <Text style={styles.doneSub}>{reviewLine(held)}</Text>}
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CLEAN.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: BRAND.blue,
    overflow: 'hidden',
  },
  title: { fontFamily: 'Shark', fontSize: 26, color: BRAND.white, marginTop: 4, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  scroll: { padding: 14, gap: 12 },
  step: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 2, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  tick: { position: 'absolute', top: -10, right: -8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoLabel: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  seg: { flex: 1, flexDirection: 'row', backgroundColor: CLEAN.well, borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, minHeight: 44, paddingHorizontal: 8 },
  segOn: { backgroundColor: BRAND.white, borderWidth: 1.5, borderColor: CLEAN.line },
  segText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navySoft, marginTop: 3 },
  segTextOn: { color: BRAND.navy },
  preview: { padding: 14, gap: 8 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewName: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingLeft: 4, paddingRight: 10, marginTop: 3 },
  badgeText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 2 },
  input: { fontFamily: 'Knockout', fontSize: 23, lineHeight: 28, color: '#10233f', minHeight: 130, paddingTop: 4 },
  safePreview: { minHeight: 70 },
  safePlaceholder: { color: '#7d95b5' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 2, borderTopColor: '#e3eefb', paddingTop: 8 },
  lineWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { flex: 1, fontFamily: 'Knockout', fontSize: 17, color: BRAND.redLip },
  kind: { flex: 1, fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  left: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navySoft },
  doneWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  doneScrim: { backgroundColor: 'rgba(5,52,110,0.82)' },
  doneGlow: { position: 'absolute', top: -30, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,207,59,0.35)', borderWidth: 8, borderColor: 'rgba(255,224,122,0.45)' },
  headerFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 22, zIndex: 2 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactChip: { marginTop: 0, minHeight: 40, paddingVertical: 4, paddingLeft: 6, paddingRight: 14, alignItems: 'center' },
  doneShark: { width: 170, height: 150 },
  doneRibbon: {
    marginTop: -14,
    backgroundColor: BRAND.gold,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: '#7a3d00',
    borderRadius: 18,
    paddingHorizontal: 26,
    paddingVertical: 6,
  },
  doneText: { fontFamily: 'Shark', fontSize: 34, color: '#7a3d00', marginTop: 4 },
  doneSub: { fontFamily: 'Knockout', fontSize: 20, color: BRAND.white, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 },
});
