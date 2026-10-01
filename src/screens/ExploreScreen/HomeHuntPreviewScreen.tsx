import { useState } from 'react';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PreviewMap from '../../dev/PreviewMap';
import { Marker } from '../../components/map/Marker';
import type { TripGoalData } from '../../api/endpoints/me/trip-goal';
import type { ParkProject } from '../../api/endpoints/me/park-projects';
import type { PrepItemType } from '../../models/prep-item-type';
import type redeemPrepItem from '../../api/endpoints/me/prep-items/redeem';
import PrepItemRedeemModal from '../../components/PrepItemRedeemModal';
import * as RootNavigation from '../../RootNavigation';
import Wrapper from '../../components/Wrapper';
import Topbar from '../../components/Topbar';
import TopbarText from '../../components/Topbar/TopbarText';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import HomeHuntCard from './HomeHuntCard';
import HomeMapStatusCard from './HomeMapStatusCard';
import PrepItemMarker from './PrepItem';
import TripGoalCard from './TripGoalCard';
import HomeFocusCard from './HomeFocusCard';
import ParkProjectWidget from './ParkProjectWidget';
import TeacherShark from '../../components/Tutorial/TeacherShark';
import SpotlightOverlay from '../../components/Tutorial/SpotlightOverlay';
import { getStepsForSequence } from '../../components/Tutorial/steps';

// Home hunt preview uses a neighborhood well away from a park geofence.
const center = { latitude: 34.1808, longitude: -118.3089 };
const sample: PrepItemType = {
  id: 39, pivot_id: 10, name: 'Golden Churro', variant_slug: 'churro_39',
  description: 'A legendary find', icon_url: null, rarity: 5,
  energy_reward: 20, ticket_reward: 1, experience_reward: 50,
  is_new_variant: true, set_name: 'Churro Collection', set_slug: 'churro_collection',
  latitude: 34.1818, longitude: -118.3089,
  active_to: new Date(Date.now() + 20 * 60_000).toISOString(),
};
const goalData: TripGoalData = {
  rides: [{ task_id: 1, asset_id: 1, park_id: 1, park_name: 'Magic Kingdom',
    ride_name: 'Space Mountain', coin_url: '', coin_owned: false, coin_level: null }],
  goal: { task_id: 1, asset_id: 1, park_id: 1, park_name: 'Magic Kingdom',
    ride_name: 'Space Mountain', coin_url: '', coin_owned: false, coin_level: null },
  goal_unavailable: false, goal_plan: null,
  wallet: { tickets: 1, energy: 12, ticket_cost: 2, tickets_needed: 1 },
};
const loadGoal = async () => goalData;
const saveGoal = async () => goalData;
const loadCollections = async () => [];
const project: ParkProject = {
  id: 1, park_id: 1, park_name: 'Magic Kingdom', slug: 'lost-current-pilot', title: 'The Lost Current',
  description: 'A park-wide shark story', story_text: 'Follow the shark signal.',
  personal_clue: null, chapter_a_title: 'Follow the lighthouse',
  chapter_b_title: 'Dive under the reef', starts_at: '2026-09-24T00:00:00Z',
  ends_at: '2026-10-01T00:00:00Z', goal_points: 100, total_points: 47,
  stage: 1, ended: false, my_points: 2, participated: true, my_chapter: null,
  targeted: true, can_vote: false, chapter_a_votes: 0, chapter_b_votes: 0,
  leading_chapter: null, play_chapter: null,
  play_mission: { title: 'Follow the signal', prompt: 'Solve the signal.', game_id: 'memory' },
  final_chapter: null, personal_clue_open: false, contributors: 18,
};
const loadProjects = async () => ({ active: [project], history: [] });
const fakeRedeem: typeof redeemPrepItem = async () => ({ success: true, data: {
  rewards: { energy: 20, tickets: 1, coins: 0, experience: 50 },
  streak: { current: 3, multiplier: 1.2 }, is_new_variant: true,
  project_update: { project_id: 1, title: 'The Lost Current', points_awarded: 1,
    total_points: 48, goal_points: 100 },
  set_progress: { total: 40, collected: 19, percentage: 48, is_complete: false,
    collected_ids: [...Array.from({ length: 18 }, (_, index) => index + 1), 39],
    spare_count: 3, exchange_cost: 4, rewards_claimed: false,
    starter_milestone: { target: 8, collected: 8, is_unlocked: true,
      rewards_claimed: false, rewards: { energy: 30, tickets: 3, experience: 250 } } },
  item: { id: 39, name: 'Golden Churro', rarity: 5, rarity_label: 'Legendary' },
} });

/** Dev-only layout review for new-variant guidance on a real map. */
export default function HomeHuntPreviewScreen() {
  const tutorialPreview = __DEV__ && process.env.EXPO_PUBLIC_TUTORIAL_PREVIEW === '1';
  const cleanPreview = __DEV__ && process.env.EXPO_PUBLIC_HOME_HUNT_CLEAN_PREVIEW === '1';
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const tutorialSteps = getStepsForSequence('onboarding');
  const tutorialStep = tutorialPreview ? tutorialSteps[tutorialIndex] : null;
  const [distance, setDistance] = useState(112);
  const [showNew, setShowNew] = useState(true);
  const [previewMode, setPreviewMode] = useState<'hunt' | 'empty' | 'error' | 'loading' | 'saved'>(
    __DEV__ && process.env.EXPO_PUBLIC_HOME_SAVED_PREVIEW === '1' ? 'saved'
      : __DEV__ && process.env.EXPO_PUBLIC_HOME_EMPTY_PREVIEW === '1' ? 'empty' : 'hunt');
  const [showControls, setShowControls] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(0);
  const previewItem = { ...sample, pivot_id: showNew ? 10 : 11, is_new_variant: showNew };
  const redeemPreview: typeof redeemPrepItem = async () => {
    const result = await fakeRedeem(previewItem.id, previewItem.pivot_id!, center.latitude, center.longitude);
    return { ...result, data: { ...result.data, is_new_variant: showNew,
      replayed: confirmed > 0,
      set_progress: { ...result.data.set_progress!, spare_count: showNew ? 3 : 4 } } };
  };
  return <Wrapper><View style={styles.root}>
    <PreviewMap style={StyleSheet.absoluteFillObject} initialRegion={{ ...center,
      latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
      {(previewMode === 'hunt' || previewMode === 'saved') &&
        <Marker coordinate={{ latitude: sample.latitude!, longitude: sample.longitude! }}>
          <PrepItemMarker prepItem={previewItem} onExpire={() => {}} inRange={distance < 28 && previewMode !== 'saved'} />
        </Marker>}
    </PreviewMap>
    <Topbar>
      {cleanPreview ? <>
        <TopbarColumn><View style={styles.headerCurrency}>
          <Image source={require('../../../assets/images/coingold.png')} style={styles.headerIcon} contentFit="contain" />
          <Text style={styles.headerCount}>25</Text>
        </View></TopbarColumn>
        <TopbarColumn><Text style={styles.travelMode}>TRAVEL MODE</Text></TopbarColumn>
        <TopbarColumn><View style={styles.headerCurrency}>
          <Image source={require('../../../assets/images/ticket-icon.png')} style={styles.headerIcon} contentFit="contain" />
          <Text style={styles.headerCount}>1</Text>
        </View></TopbarColumn>
      </> : <>
        <TopbarColumn stretch={false} />
        <TopbarColumn><TopbarText>HOME HUNT</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </>}
    </Topbar>
    <ParkProjectWidget parkId={null} refreshVersion={0} loadProjects={loadProjects}
      topOffset={125 + Constants.statusBarHeight} />
    {!tutorialPreview && !cleanPreview && <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle preview controls"
        onPress={() => setShowControls(value => !value)} style={styles.previewToggle}>
        <Text style={styles.previewToggleText}>PREVIEW {showControls ? '−' : '+'}</Text>
      </Pressable>
      {showControls && <View style={styles.controls}>
      <Text style={styles.title}>CONFIRMED {confirmed}</Text>
      <Pressable accessibilityRole="button" onPress={() => setDistance(value => value === 112 ? 18 : 112)}>
        <Text style={styles.switch}>{distance === 112 ? 'Make nearby' : 'Move away'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setShowNew(value => !value)}>
        <Text style={styles.switch}>{showNew ? 'Show spare' : 'Show new'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setPreviewMode(value => value === 'hunt'
        ? 'empty' : value === 'empty' ? 'error' : value === 'error' ? 'loading'
          : value === 'loading' ? 'saved' : 'hunt')}>
        <Text style={styles.switch}>{previewMode === 'hunt' ? 'Show empty'
          : previewMode === 'empty' ? 'Show error' : previewMode === 'error' ? 'Show loading'
            : previewMode === 'loading' ? 'Show saved' : 'Show hunt'}</Text>
      </Pressable>
      </View>}
    </View>}
    <HomeFocusCard set={{ slug: 'churro_collection', name: 'Churro Collection',
      theme: 'classic', available_now: true, collected_count: 19, total_items: 40 }} onPress={() => {}}
      topOffset={125 + Constants.statusBarHeight} />
    {previewMode !== 'hunt' ? <HomeMapStatusCard mode={previewMode}
      onOpenCollections={() => RootNavigation.navigate('SetCollectionPreview')}
      onRetry={() => setPreviewMode('hunt')} />
      : <View style={{ position: 'absolute', bottom: 192, left: 16, right: 16, zIndex: 10 }}>
        <HomeHuntCard target={{ item: previewItem, distanceMeters: distance,
          kind: showNew ? 'new' : 'spare' }} findsUntilTicket={confirmed > 0 ? 3 : 2}
          setProgress={{ collected: 19, total: 40 }} onPress={() => setPickupOpen(true)} />
      </View>}
    <TripGoalCard refreshVersion={0} loadGoal={loadGoal} saveGoal={saveGoal}
      removeGoal={loadGoal} loadCollections={loadCollections} />
    <PrepItemRedeemModal visible={pickupOpen} prepItem={previewItem} pivotId={previewItem.pivot_id!}
      redeemItem={redeemPreview} onClose={() => setPickupOpen(false)}
      onViewSet={(slug) => RootNavigation.navigate('SetCollectionPreview', { slug })}
      onCollected={() => setConfirmed(count => count + 1)} />
    {tutorialStep && <>
      <SpotlightOverlay target={null} opacity={0.62} onPress={() => setTutorialIndex(index => index + 1)} />
      <TeacherShark text={tutorialStep.text} subtitle={tutorialStep.subtitle}
        mood={tutorialStep.sharkMood} position={tutorialStep.sharkPosition}
        nextText={tutorialStep.nextText} showSkip={tutorialStep.showSkip}
        stepIndex={tutorialIndex} totalSteps={tutorialSteps.length}
        onNext={() => setTutorialIndex(index => index + 1)}
        onSkip={() => setTutorialIndex(tutorialSteps.length)} />
    </>}
  </View></Wrapper>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0875c9' },
  headerCurrency: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  headerIcon: { width: 28, height: 28 },
  headerCount: { color: '#fff', fontFamily: 'Shark', fontSize: 22 },
  travelMode: { color: '#fff', fontFamily: 'Shark', fontSize: 16, letterSpacing: 2,
    textAlign: 'center', textTransform: 'uppercase' },
  top: { position: 'absolute', top: 275, left: 16, zIndex: 20, alignItems: 'flex-start' },
  previewToggle: { backgroundColor: '#0879ca', borderRadius: 10, borderWidth: 2,
    borderColor: '#fff', paddingHorizontal: 9, paddingVertical: 5 },
  previewToggleText: { color: '#fff', fontFamily: 'Knockout', fontSize: 12 },
  controls: { marginTop: 6, backgroundColor: '#fff', borderRadius: 10,
    padding: 9, borderWidth: 2, borderColor: '#0879ca', gap: 4 },
  title: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
  switch: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
});
