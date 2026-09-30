import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PreviewMap from '../../dev/PreviewMap';
import { spacing } from '../../design-system';
import Topbar from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import Wrapper from '../../components/Wrapper';
import type { ParkProject } from '../../api/endpoints/me/park-projects';
import type { LineSignalSummary } from '../../api/endpoints/me/inline-timer/types';
import { crewLivePrompt } from '../../services/lineplay/livePrompt';
import LinePlayLiveRail from '../LinePlay/components/LinePlayLiveRail';
import ParkProjectMapBeacon from './ParkProjectMapBeacon';
import ParkProjectWidget from './ParkProjectWidget';
import HomeFocusCard from './HomeFocusCard';
import ProjectMissionModal from '../LinePlay/components/ProjectMissionModal';

const previewHome = process.env.EXPO_PUBLIC_PARK_PROJECT_HOME_PREVIEW === '1';
const previewStory = process.env.EXPO_PUBLIC_PARK_PROJECT_STORY_PREVIEW === 'observatory-living-reef'
  ? { slug: 'observatory-living-reef', title: 'The Living Reef Lens',
    story: 'The Coral Passage brought the shark crew to the Tide Observatory. Home clues and park discoveries calibrate a shared lens.',
    clue: 'The reef code reads RED, BLUE, RED, BLUE. Which gate starts its next pair?',
    choices: ['Red', 'Blue', 'Gold'] as const,
    chapters: ['Record the Bright Reef Map', 'Keep the Quiet Reef Map'] as const }
  : process.env.EXPO_PUBLIC_PARK_PROJECT_STORY_PREVIEW === 'coral-passage-chapter'
  ? { slug: 'coral-passage-chapter', title: 'The Coral Passage',
    story: 'The Deep Current has reached a living reef. Park discoveries and home clues help the crew read its alternating gates.',
    clue: 'The coral gates glow RED, BLUE, RED, BLUE. Which color starts the next pair?',
    choices: ['Red', 'Blue', 'Gold'] as const,
    chapters: ['Follow the Living Reef', 'Open the Stone Arch'] as const }
  : process.env.EXPO_PUBLIC_PARK_PROJECT_STORY_PREVIEW === 'hidden-pulse-chapter'
  ? { slug: 'hidden-pulse-chapter', title: 'The Hidden Pulse',
    story: 'The Star Current has reached a field of submerged lights. Together, fans can uncover its quiet beat.',
    clue: 'The hidden lights read BRIGHT, QUIET, BRIGHT, QUIET. What comes next?',
    choices: ['Bright', 'Quiet', 'Dark forever'] as const,
    chapters: ['Follow the Quiet Chimes', 'Search Beneath the Lights'] as const }
  : process.env.EXPO_PUBLIC_PARK_PROJECT_STORY_PREVIEW === 'echo-harbor-chapter'
  ? { slug: 'echo-harbor-chapter', title: 'Echo Harbor',
    story: 'The crew has followed the restored current into a hidden harbor. Park discoveries and fans playing from home are piecing together its echo map.',
    clue: 'The harbor sends SHELL, STAR, BELL. Its echo reads backward. Which marker comes first?',
    choices: ['Bell', 'Shell', 'Star'] as const,
    chapters: ['Open the Quiet Pier', 'Ring the Bright Pier'] as const }
  : process.env.EXPO_PUBLIC_PARK_PROJECT_STORY_PREVIEW === 'lantern-tide-chapter'
    ? { slug: 'lantern-tide-chapter', title: 'The Lantern Tide',
      story: 'A tide of floating lanterns has appeared. Every park discovery and home clue helps reveal which lights lead onward.',
      clue: 'The lanterns flash BRIGHT, BRIGHT, DIM, then repeat. Which light starts the next group?',
      choices: ['Bright', 'Dim', 'No light'] as const,
      chapters: ['Follow the Moonlit Lanterns', 'Follow the Hidden Lanterns'] as const }
    : { slug: 'lost-current-pilot', title: 'The Lost Current',
      story: 'The crew found a mysterious current beneath the park. Every ride challenge and verified queue session helps reveal where it leads.',
      clue: 'A blue signal blinks three times, then goes quiet. Which rhythm should your shark follow?',
      choices: ['Four even pulses', 'Three quick pulses, then a rest', 'One long pulse'] as const,
      chapters: ['Follow the Deep Current', 'Follow the Star Current'] as const };

/** Development-only visual QA for the shared park map treatment. */
export default function ParkProjectPreviewScreen() {
  const [stage, setStage] = useState(0);
  const [chapter, setChapter] = useState<'a' | 'b'>('a');
  const [signals, setSignals] = useState(0);
  const [newVotes, setNewVotes] = useState(0);
  const [myVote, setMyVote] = useState<'a' | 'b' | null>(null);
  const [opened, setOpened] = useState(previewHome && process.env.EXPO_PUBLIC_PARK_PROJECT_PILL_PREVIEW !== '1' ? 1 : 0);
  const [showLineMission, setShowLineMission] = useState(false);
  const [showQaControls, setShowQaControls] = useState(false);
  const previewProject = useMemo<ParkProject>(() => ({
      id: 1, park_id: 1, park_name: 'Magic Kingdom', park_latitude: 28.4194, park_longitude: -81.5812,
      slug: previewStory.slug,
      title: previewStory.title, description: 'A park-wide shark story',
      story_text: previewStory.story,
      personal_clue: null, crew: { points: 3, target: 8, friends: 2, clue: null },
      remote_challenge: previewHome ? {
        prompt: previewStory.clue,
        choices: previewStory.choices,
        completed: false, park_day: '2026-09-25', index: 0, total: 8,
      } : null, previous_story: null,
      chapter_a_title: previewStory.chapters[0], chapter_b_title: previewStory.chapters[1],
      starts_at: '2026-09-24T00:00:00Z', ends_at: '2026-10-01T00:00:00Z',
      goal_points: 100, total_points: Math.min(100, [12, 47, 73, 100][stage] + signals), stage,
      ended: false, my_points: 2,
      participated: true, my_chapter: myVote, targeted: previewHome, can_vote: stage >= 2 && !myVote,
      chapter_a_votes: 26, chapter_b_votes: 21 + newVotes, leading_chapter: newVotes > 5 ? 'b' : 'a',
      play_chapter: stage >= 2 ? chapter : null,
      play_mission: { title: 'Follow the signal', prompt: 'Solve the shark signal in line.', game_id: 'memory' },
      final_chapter: null, personal_clue_open: false, contributors: [3, 18, 25, 30][stage],
      recent_actions: [
        { kind: newVotes > 0 ? 'vote_b' : 'home_find', points: newVotes > 0 ? 0 : 1,
          at: new Date(Date.now() - 90_000).toISOString() },
        { kind: 'ride_coin', points: 3, at: new Date(Date.now() - 4 * 60_000).toISOString() },
        { kind: 'queue_part', points: 2, at: new Date(Date.now() - 11 * 60_000).toISOString() },
        { kind: 'fan_challenge', points: 1, at: new Date(Date.now() - 18 * 60_000).toISOString() },
      ],
    }), [stage, chapter, myVote, signals, newVotes]);
  const loadProjects = useCallback(async (): Promise<{ active: ParkProject[]; history: ParkProject[] }> => ({
    active: [previewProject], history: [],
  }), [previewProject]);
  const signal: LineSignalSummary = {
    park_day: '2026-09-24', community_target: 3, participants: stage >= 2 ? 3 : 2,
    route_a_count: 2, route_b_count: 1, unlocked_route: stage >= 2 ? 'route_a' : null,
    player_choice: null, can_choose: true, solo_route: null, seconds_until_eligible: 0,
    seconds_until_solo: 0, puzzle: stage >= 3 ? {
      route: 'route_a', stage: 2, total_stages: 3, completed: false, completed_at: null,
      total_guesses: 4, participants: 2, can_guess: true, seconds_until_guess: 0,
      needs_nearby_sample: false, recent_guesses: [], last_result: null,
    } : null,
  };
  const crewPrompt = crewLivePrompt(signal,
    stage >= 3 ? new Set(['signal-bonus-2026-09-24-route_a']) : new Set());

  return <View style={styles.root}>
    <Wrapper previewMode>
      <Topbar><TopbarColumn><TopbarText>EXPLORE</TopbarText></TopbarColumn></Topbar>
      <View style={styles.scene}>
        <PreviewMap style={styles.map} initialRegion={{
          latitude: previewHome ? 34.1808 : 28.4194,
          longitude: previewHome ? -118.3090 : -81.5812,
          latitudeDelta: 0.008, longitudeDelta: 0.008,
        }}>
          {!previewHome && <ParkProjectMapBeacon project={{ id: 1, slug: previewStory.slug, title: previewStory.title, stage,
            play_chapter: stage >= 2 ? chapter : null,
            park_latitude: 28.4194, park_longitude: -81.5812, ended: false }}
            onPress={() => setOpened(value => value + 1)} />}
        </PreviewMap>
        <ParkProjectWidget parkId={previewHome ? null : 1} refreshVersion={stage} openRequestVersion={opened}
          topOffset={12} loadProjects={loadProjects} />
        {previewHome && process.env.EXPO_PUBLIC_PARK_PROJECT_PILL_PREVIEW === '1' &&
          <HomeFocusCard topOffset={12} set={{ slug: 'churros', name: 'Churro Collection',
            theme: 'food', available_now: true }} onPress={() => {}} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle preview controls"
          style={styles.qaToggle} onPress={() => setShowQaControls(value => !value)}>
          <Text style={styles.qaToggleText}>QA</Text>
        </Pressable>
        {showQaControls && <View style={styles.toolbar}>
          <Text style={styles.readout}>{previewHome ? 'HOME' : 'PARK'} · Stage {stage} · {chapter.toUpperCase()}</Text>
          <View style={styles.controls}>
        <Pressable accessibilityRole="button" disabled={stage === 3}
          onPress={() => setStage(value => Math.min(3, value + 1))}>
          <Text style={styles.action}>Next stage</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setChapter(value => value === 'a' ? 'b' : 'a')}>
          <Text style={styles.action}>Switch vote</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSignals(value => value + 1)}>
          <Text style={styles.action}>+ Signal</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setNewVotes(value => value + 6)}>
          <Text style={styles.action}>Vote swing</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setShowLineMission(true)}>
          <Text style={styles.action}>Line mission</Text>
        </Pressable>
          </View>
          <LinePlayLiveRail crew={crewPrompt} projectTitle="Follow the signal" projectStage={stage}
            onOpenCrew={() => setStage(value => Math.min(3, value + 1))}
            onOpenProject={() => setShowLineMission(true)} />
        </View>}
      </View>
    </Wrapper>
    <ProjectMissionModal visible={showLineMission} project={previewProject} paused={false}
      pending={false} error={null} completedIds={new Set()} onClose={() => setShowLineMission(false)}
      onHidden={() => {}} onPlay={() => setShowLineMission(false)} onVote={setMyVote} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a74c8' },
  toolbar: { position: 'absolute', left: 12, right: 12, bottom: 56, padding: spacing.md,
    gap: spacing.sm, backgroundColor: '#07569e', borderRadius: 14, borderWidth: 2,
    borderColor: '#fff', zIndex: 40 },
  readout: { color: '#dff4ff', fontSize: 13, fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  action: { color: '#ffdf48', fontFamily: 'Knockout', fontSize: 17, paddingVertical: spacing.sm },
  scene: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  qaToggle: { position: 'absolute', left: 12, bottom: 12, borderRadius: 8,
    backgroundColor: '#07569e', borderWidth: 1, borderColor: '#fff', zIndex: 40,
    paddingHorizontal: 9, paddingVertical: 4 },
  qaToggleText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
