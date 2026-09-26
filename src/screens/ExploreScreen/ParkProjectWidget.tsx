import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import * as RootNavigation from '../../RootNavigation';
import { colors, spacing } from '../../design-system';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import HapticPatterns from '../../helpers/hapticPatterns';
import {
  answerParkProjectRemote, followParkProject, getParkProjects, voteParkProject,
  type ParkProject,
} from '../../api/endpoints/me/park-projects';
import { preferFreshProjectSnapshot, projectLiveUpdate, projectNextMilestone, projectStageLabel } from './projectLiveUpdate';
import ProjectRippleFeed from './ProjectRippleFeed';

interface Props {
  readonly parkId: number | null;
  readonly refreshVersion: number;
  readonly onActiveProjectChange?: (project: ParkProject | null) => void;
  readonly openRequestVersion?: number;
  readonly loadProjects?: typeof getParkProjects;
  readonly topOffset?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function projectHeroSource(slug: string) {
  if (slug.startsWith('observatory-'))
    return require('../../../assets/images/screens/park-projects/tide-observatory-hero-v1.png');
  if (slug === 'coral-passage-chapter')
    return require('../../../assets/images/screens/park-projects/coral-passage-hero-v1.png');
  if (slug === 'echo-harbor-chapter')
    return require('../../../assets/images/screens/park-projects/echo-harbor-hero.png');
  if (slug === 'lantern-tide-chapter')
    return require('../../../assets/images/screens/park-projects/lantern-tide-hero.png');
  if (slug === 'hidden-pulse-chapter')
    return require('../../../assets/images/screens/park-projects/hidden-pulse-hero-v1.png');
  return require('../../../assets/images/screens/park-projects/lost-current-hero.png');
}

export default function ParkProjectWidget({ parkId, refreshVersion, onActiveProjectChange,
  openRequestVersion = 0, loadProjects = getParkProjects,
  topOffset = 82 + Constants.statusBarHeight }: Props) {
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [history, setHistory] = useState<ParkProject[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<Record<number, { parkDay: string; message: string }>>({});
  const soundEffects = useContext(SoundEffectContext);
  const playSoundRef = useRef(soundEffects.playSound);
  playSoundRef.current = soundEffects.playSound;
  const pulse = useRef(new Animated.Value(1)).current;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProjects = useRef<Map<number, ParkProject>>(new Map());
  const requestVersion = useRef(0);
  const focused = useRef(false);
  const currentParkId = useRef(parkId);
  currentParkId.current = parkId;

  useEffect(() => {
    lastProjects.current.clear();
    setNotice(null);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, [parkId]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    pulse.stopAnimation();
  }, [pulse]);

  useEffect(() => {
    if (openRequestVersion > 0) {
      setOpen(true);
      setNotice(null);
    }
  }, [openRequestVersion]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await loadProjects();
      if (!focused.current || version !== requestVersion.current || currentParkId.current !== parkId) return;
      const accepted = next.active.map(project => preferFreshProjectSnapshot(lastProjects.current.get(project.id), project));
      const inView = parkId == null ? accepted : accepted.filter(project => project.park_id === parkId);
      const update = inView.map(project => projectLiveUpdate(lastProjects.current.get(project.id), project))
        .find((message): message is string => !!message);
      const stageAdvanced = inView.some(project => {
        const prior = lastProjects.current.get(project.id);
        return prior && !prior.ended && !project.ended && project.stage > prior.stage;
      });
      if (update) {
        setNotice(update);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 10_000);
      }
      if (stageAdvanced) {
        pulse.stopAnimation();
        Animated.sequence([
          Animated.spring(pulse, { toValue: 1.075, friction: 5, useNativeDriver: true }),
          Animated.spring(pulse, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]).start();
        HapticPatterns.achievement();
        void playSoundRef.current?.(require('../../../assets/sounds/reward.mp3'));
      }
      lastProjects.current = new Map(accepted.map(project => [project.id, project]));
      setProjects(accepted);
      setHistory(next.history);
      onActiveProjectChange?.(inView.find(project => project.targeted) ?? inView[0] ?? null);
      setOffline(false);
      setError(null);
    } catch {
      if (!focused.current || version !== requestVersion.current) return;
      // Keep the last confirmed world state; the next focus or refresh retries.
      setOffline(true);
      if (open) setError('Could not refresh the project. Try again when connected.');
    }
  }, [open, parkId, onActiveProjectChange, loadProjects]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, open ? 20_000 : 45_000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      focused.current = false;
      requestVersion.current += 1;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [load, refreshVersion, parkId, open]));

  const active = parkId == null ? projects : projects.filter((project) => project.park_id === parkId);
  const archived = parkId == null ? history : history.filter((project) => project.park_id === parkId);
  const visible = [...active, ...archived];
  const featured = active.find((project) => project.targeted) ?? active[0] ?? archived[0];
  if (!featured) return null;
  const compactHome = parkId == null && !notice;

  const perform = async (action: () => Promise<ParkProject>) => {
    if (busy || offline) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      const message = (cause as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'Could not save that choice. Try again when connected.');
    } finally {
      setBusy(false);
    }
  };

  const answerRemote = async (project: ParkProject, choice: number) => {
    if (busy || offline || !project.remote_challenge || project.remote_challenge.index == null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await answerParkProjectRemote(project.id, choice,
        project.remote_challenge.park_day, project.remote_challenge.index);
      setAnswerFeedback(previous => ({ ...previous, [project.id]: {
        parkDay: project.remote_challenge?.park_day ?? '',
        message: result.correct
          ? `${result.points_awarded ? '+1 project point. ' : 'Challenge complete. '} ${result.explanation ?? ''}`
          : 'That route did not match the clue. Try another answer.',
      } }));
      if (result.correct) await load();
    } catch (cause) {
      const status = (cause as { response?: { status?: number } })?.response?.status;
      if (status === 422) await load();
      setError(status === 422
        ? 'The story clue changed. Check today’s question and try again.'
        : 'Could not check that answer. Try again when connected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AnimatedPressable accessibilityRole="button"
        accessibilityLabel={`${offline ? 'Last confirmed park story' : 'Park story'}: ${featured.title}. ${featured.total_points} of ${featured.goal_points} signals.${offline ? ' Progress may have changed.' : ''} Open story.`}
        style={[styles.pill, compactHome && styles.pillCompact,
          { top: topOffset, transform: [{ scale: pulse }] }]}
        onPress={() => { setOpen(true); setNotice(null); }}>
        <Text style={styles.pillStar}>✦</Text>
        <Text style={styles.pillKicker}>
          {offline ? 'LAST KNOWN' : featured.ended ? 'STORY ARCHIVE' : notice ? 'PARK UPDATE'
            : featured.previous_story?.your_vote === featured.previous_story?.chosen_chapter && featured.previous_story?.your_vote
              ? 'YOUR VOTE WON' : featured.previous_story?.votes ? 'CREW CHOSE THIS' : 'PARK STORY'}
        </Text>
        {!compactHome && <Text style={styles.pillTitle} numberOfLines={2}>{notice ?? featured.title}</Text>}
        <Text style={styles.pillProgress}>{compactHome
          ? featured.ended ? 'Tap to revisit' : `${featured.total_points}/${featured.goal_points} signals`
          : `${featured.total_points}/${featured.goal_points} · ${notice ? 'Tap to see what changed' : featured.ended ? 'Your park story' : projectStageLabel(featured)}`}</Text>
      </AnimatedPressable>
      <Modal isVisible={open} onBackdropPress={() => setOpen(false)} onBackButtonPress={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Image source={projectHeroSource(featured.slug)}
              resizeMode="cover" style={styles.headerArt}
              accessibilityLabel={`Shark exploring ${featured.title}`} />
            <Text style={styles.headerText}>THE PARK IS CHANGING</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Park Projects"
              style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {offline && <Text style={styles.hint}>Showing the last confirmed project update. Progress may have changed.</Text>}
            {visible.map((project) => {
              const fraction = Math.min(100, Math.round(100 * project.total_points / Math.max(1, project.goal_points)));
              const milestone = projectNextMilestone(project);
              return (
                <View key={project.id} style={styles.card}>
                  {project.ended && <Text style={styles.archiveLabel}>PAST PARK STORY</Text>}
                  <Text style={styles.parkName}>{project.park_name.toUpperCase()}</Text>
                  <Text style={styles.title}>{project.title}</Text>
                  {parkId == null && !project.ended && !project.targeted && (
                    <Pressable style={styles.action} disabled={busy || offline} onPress={() => void perform(() => followParkProject(project.id))}>
                      <Text style={styles.actionText}>Support this park from home</Text>
                    </Pressable>
                  )}
                  {parkId == null && !project.ended && project.targeted && project.remote_challenge && (
                    <View style={styles.crewBox}>
                      <Text style={styles.crewTitle}>
                        TODAY'S STORY CLUE{project.remote_challenge.index != null && project.remote_challenge.total
                          ? ` · ${project.remote_challenge.index + 1}/${project.remote_challenge.total}` : ''}
                      </Text>
                      <Text style={styles.story}>{project.remote_challenge.prompt}</Text>
                      {project.remote_challenge.completed ?
                        <Text style={styles.target}>{project.remote_challenge.index != null &&
                          project.remote_challenge.total != null &&
                          project.remote_challenge.index + 1 >= project.remote_challenge.total
                          ? 'Final clue solved. Your crew can still shape the project until it closes.'
                          : 'Clue solved. The next one opens on the park’s next day.'}</Text>
                        : project.remote_challenge.choices.map((choice, index) =>
                          <Pressable key={`${project.id}-${index}`} accessibilityRole="button"
                            disabled={busy || offline} style={({ pressed }) => [styles.vote, pressed && styles.votePressed]}
                            onPress={() => void answerRemote(project, index)}>
                            <Text style={styles.voteText}>{choice}</Text>
                          </Pressable>)}
                      {answerFeedback[project.id]?.parkDay === project.remote_challenge.park_day &&
                        <Text style={styles.hint}>{answerFeedback[project.id].message}</Text>}
                      <Text style={styles.hint}>Up to one shared point per park day · play anywhere. Ride coins come from rides.</Text>
                    </View>
                  )}
                  {project.previous_story && (
                    <View style={styles.clue}>
                      <Text style={styles.clueText}>
                        {project.previous_story.votes > 0
                          ? `The last crew's vote opened ${project.previous_story.chosen_title}.`
                          : `The last story opened ${project.previous_story.chosen_title} through its quiet-park path.`}
                        {project.previous_story.your_vote === project.previous_story.chosen_chapter
                          ? ' Your vote followed this path.' : ''}
                      </Text>
                    </View>
                  )}
                  {parkId != null && !project.ended &&
                    <Text style={styles.hint}>This story reaches the whole park. Join in wherever your day takes you.</Text>}
                  <Text style={styles.story}>{project.story_text}</Text>
                  <View style={styles.progressCard} accessible accessibilityRole="text"
                    accessibilityLabel={`${offline ? 'Last confirmed progress. ' : ''}${project.total_points} of ${project.goal_points} shared signals. ${milestone.remaining > 0 ? `${milestone.remaining} more until ${milestone.label.toLowerCase()}` : milestone.label.toLowerCase()}. Your contribution ${project.my_points}`}>
                    <View style={styles.progressTop}>
                      <Text style={styles.progressKicker}>✦  {projectStageLabel(project).toUpperCase()}</Text>
                      <Text style={styles.progressCount}>{project.total_points}/{project.goal_points}</Text>
                    </View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill,
                      { width: `${fraction}%` as `${number}%` }]} /></View>
                    <Text style={styles.progressNext}>
                      {milestone.remaining > 0 ? `${milestone.remaining} MORE SIGNALS · ${milestone.label}` : milestone.label}
                    </Text>
                    <Text style={styles.progressMeta}>
                      {project.contributors} {project.contributors === 1 ? 'fan' : 'fans'} helped
                      {'  ·  '}{project.ended ? 'Ended' : 'Ends'} {new Date(project.ends_at).toLocaleDateString()}
                    </Text>
                    <View style={styles.personalProgress}>
                      <Text style={styles.personalText}>
                        {project.my_points >= 3 ? 'YOUR CLUE IS OPEN'
                          : project.participated && project.my_points === 0 ? 'YOU JOINED THE FINAL CHAPTER'
                            : project.stage >= 3 ? `YOU ADDED ${project.my_points} ${project.my_points === 1 ? 'SIGNAL' : 'SIGNALS'}`
                              : `YOUR CLUE · ${project.my_points}/3 SIGNALS`}
                      </Text>
                    </View>
                  </View>
                  {parkId == null && !project.ended && project.targeted && (
                    <Text style={styles.target}>
                      {project.stage === 3
                        ? 'YOUR HOME PROJECT · The meter is full. A nearby prep pickup still lets a new fan vote.'
                        : 'YOUR HOME PROJECT · Nearby prep pickups add a signal point.'}
                    </Text>
                  )}
                  {project.personal_clue && (
                    <View style={styles.clue}><Text style={styles.clueText}>YOUR CLUE: {project.personal_clue}</Text></View>
                  )}
                  {project.stage >= 2 && (
                    <View style={styles.voteBox}>
                      <Text style={styles.voteTitle}>{project.ended ? 'The next chapter chosen' : 'Choose the next chapter'}</Text>
                      {!project.ended && <Text style={styles.meta}>Your vote helps choose what the community sees next.</Text>}
                      {(['a', 'b'] as const).map((chapter) => (
                        <Pressable key={chapter} style={[styles.vote, project.my_chapter === chapter && styles.selectedVote]}
                          disabled={busy || offline || !project.can_vote}
                          onPress={() => void perform(() => voteParkProject(project.id, chapter))}>
                          <Text style={styles.voteText}>
                            {chapter === 'a' ? project.chapter_a_title : project.chapter_b_title}
                            {' · '}{chapter === 'a' ? project.chapter_a_votes : project.chapter_b_votes}
                          </Text>
                        </Pressable>
                      ))}
                      {!project.participated && <Text style={styles.hint}>Complete a verified activity before voting.</Text>}
                      {project.my_chapter && <Text style={styles.target}>Your choice is locked in.</Text>}
                      {!project.ended && project.leading_chapter && <Text style={styles.hint}>Currently leading: {project.leading_chapter === 'a' ? project.chapter_a_title : project.chapter_b_title}</Text>}
                      {!project.ended && <Text style={styles.hint}>A tie follows {project.chapter_a_title}.</Text>}
                      {project.ended && project.final_chapter && (
                        <Text style={styles.target}>Community choice: {project.final_chapter === 'a' ? project.chapter_a_title : project.chapter_b_title}</Text>
                      )}
                    </View>
                  )}
                  {project.crew && (
                    <View style={styles.crewBox}>
                      <Text style={styles.crewTitle}>YOUR FRIEND CREW</Text>
                      <Text style={styles.meta}>
                        {project.crew.points}/{project.crew.target} verified points · {project.crew.friends} {project.crew.friends === 1 ? 'friend' : 'friends'} helped
                      </Text>
                      <View style={styles.track}><View style={[styles.crewFill, {
                        width: `${Math.min(100, Math.round(100 * project.crew.points / Math.max(1, project.crew.target)))}%` as `${number}%`,
                      }]} /></View>
                      {project.crew.clue ? <Text style={styles.clueText}>CREW CLUE: {project.crew.clue}</Text>
                        : <Text style={styles.hint}>You and accepted friends can uncover this clue together. You can also reach it on your own.</Text>}
                      {!project.crew.clue && <Pressable accessibilityRole="button" style={styles.crewAction}
                        onPress={() => { setOpen(false); RootNavigation.navigate('Friends'); }}>
                        <Text style={styles.crewActionText}>See friends</Text>
                      </Pressable>}
                    </View>
                  )}

                  {parkId != null && !project.ended && (
                    <Text style={styles.hint}>
                      {project.stage === 3
                        ? 'The shared meter is full. A verified ride or LinePlay activity still lets a new guest vote.'
                        : 'Winning ride challenges and earning LinePlay Parts help this project.'}
                    </Text>
                  )}

                  <ProjectRippleFeed project={project} />
                </View>
              );
            })}
            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', right: 12,
    width: '43%', zIndex: 30, borderRadius: 14,
    padding: spacing.sm, paddingRight: 25, backgroundColor: '#0879ca', borderWidth: 3, borderColor: '#fff',
    shadowColor: '#003c7a', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 5 },
  pillCompact: { width: '29%', minWidth: 118, minHeight: 48, paddingVertical: 7,
    paddingLeft: 8, paddingRight: 23, borderWidth: 2 },
  pillStar: { color: '#ffdc42', fontSize: 26, position: 'absolute', top: 5, right: 6 },
  pillKicker: { color: '#ffe06c', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
  pillTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 15, marginTop: 3 },
  pillProgress: { color: '#dff4ff', fontSize: 11, marginTop: 4 },
  modal: { maxHeight: '85%', borderRadius: 20, backgroundColor: '#bdeaff', padding: spacing.lg,
    borderWidth: 3, borderColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#073a78', borderRadius: 14, minHeight: 108, overflow: 'hidden',
    marginHorizontal: -7, marginTop: -7, paddingLeft: 12 },
  headerArt: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  headerText: { color: '#fff', fontFamily: 'Shark', fontSize: 18, flex: 1, zIndex: 1,
    textShadowColor: '#062a55', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3 },
  closeButton: { width: 36, height: 36, marginRight: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, backgroundColor: '#063566e8', borderWidth: 2, borderColor: '#ffdd4c', zIndex: 1 },
  close: { color: '#fff', fontFamily: 'Knockout', fontSize: 25, lineHeight: 29 },
  list: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#e4f7ff', padding: spacing.lg },
  parkName: { color: '#0871bc', fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1 },
  archiveLabel: { color: '#5982a0', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1, marginBottom: spacing.sm },
  title: { color: '#0b3d70', fontFamily: 'Shark', fontSize: 23, marginTop: 3 },
  story: { color: '#244b6f', fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  progressCard: { backgroundColor: '#073f78', borderWidth: 2, borderColor: '#ffda56',
    borderRadius: 13, padding: 11, marginTop: spacing.md },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progressKicker: { color: '#ffe078', fontFamily: 'Knockout', fontSize: 12, flex: 1,
    letterSpacing: 0.5 },
  progressCount: { color: '#fff', fontFamily: 'Shark', fontSize: 18 },
  progressTrack: { height: 12, borderRadius: 7, borderWidth: 1, borderColor: '#b5e9ff',
    backgroundColor: '#316895', overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', backgroundColor: '#ffca30', borderRadius: 6 },
  progressNext: { color: '#ffe078', fontFamily: 'Knockout', fontSize: 14, marginTop: 7 },
  progressMeta: { color: '#d9f2ff', fontSize: 11, marginTop: 3 },
  personalProgress: { alignSelf: 'flex-start', backgroundColor: '#fff3c2', borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 4, marginTop: 9 },
  personalText: { color: '#174d76', fontFamily: 'Knockout', fontSize: 13 },
  track: { height: 10, borderRadius: 6, backgroundColor: '#d9f2ff', marginTop: spacing.lg, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 6, backgroundColor: colors.tertiary },
  meta: { color: '#4c728e', fontSize: 12, marginTop: spacing.sm },
  stage: { color: '#0871bc', fontFamily: 'Knockout', fontSize: 17, marginTop: spacing.sm },
  hint: { color: '#4c728e', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  clue: { backgroundColor: '#fff7d6', borderRadius: 10, borderWidth: 1, borderColor: '#ffdc65',
    padding: spacing.md, marginTop: spacing.md },
  clueText: { color: '#16466c', fontSize: 13, lineHeight: 19 },
  crewBox: { backgroundColor: '#e5f7ff', borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  crewTitle: { color: '#0871bc', fontFamily: 'Knockout', fontSize: 16, letterSpacing: 0.6 },
  crewFill: { height: 10, borderRadius: 6, backgroundColor: '#5CD4CF' },
  crewAction: { alignSelf: 'flex-start', marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: 8, backgroundColor: colors.secondary },
  crewActionText: { color: '#fff', fontFamily: 'Knockout', fontSize: 15 },
  action: { backgroundColor: colors.secondary, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  actionText: { color: '#fff', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center' },
  target: { color: '#a36800', fontFamily: 'Knockout', fontSize: 15, marginTop: spacing.md },
  voteBox: { borderTopWidth: 2, borderTopColor: '#c9eaff', marginTop: spacing.lg, paddingTop: spacing.md },
  voteTitle: { color: '#0b3d70', fontFamily: 'Shark', fontSize: 18 },
  vote: { minHeight: 44, justifyContent: 'center', backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#a8d9ef', padding: spacing.md, marginTop: spacing.sm },
  votePressed: { backgroundColor: '#fff8dc', borderColor: '#ffbf1c' },
  selectedVote: { borderWidth: 2, borderColor: '#ffbf1c', backgroundColor: '#fff8dc' },
  voteText: { color: '#16466c', fontSize: 13, fontWeight: '700' },
  error: { color: colors.error, fontSize: 13 },
});
