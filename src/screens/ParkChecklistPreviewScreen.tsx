import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Image as NativeImage, ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import PreviewMap from '../dev/PreviewMap';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import ParkCollectionHeader from './ParkCollectionHeader';
import UnfoundCoinModal from '../components/UnfoundCoinModal';
import TaskCoinModal from '../components/TaskCoinModal';
import ParkShelfArtwork from '../components/ParkShelfArtwork';
import ParkRideDirectory from './ParkRideDirectory';
import TaskMarker from './ExploreScreen/TaskMarker';
import type { TaskType } from '../models/task-type';

const rides = ['Space Mountain', 'Pirates of the Caribbean', 'Haunted Mansion', 'Jungle Cruise', 'it’s a small world', 'Seven Dwarfs Mine Train', 'Big Thunder Mountain Railroad', 'Main Street, U.S.A.'];
const sampleTasks: TaskType[] = rides.map((name, index) => ({
  id: index + 1, name, ticket_cost: 1,
  coin_url: index === 0 ? NativeImage.resolveAssetSource(require('../../assets/images/coingold.png')).uri : '',
  coin_level: index === 0 ? 3 : undefined,
  coins: 25, experience: 50, energy_reward: 10, ride_parts_reward: 1,
  completion_goal: 1, latitude: '28.4194', longitude: '-81.5778',
  times_completed: 0,
}));
const disneylandRideNames = [
  'Astro Blasters', 'Autopia', 'Haunted Mansion', "It's A Small World",
  'Jungle Cruise', 'Mad Tea Party', 'Matterhorn', 'Mr. Toad', 'Pirates',
  'Smugglers', 'Space Mountain', 'Star Tours', 'Submarine Voyage',
  'The Many Adventures Of Pooh', 'Thunder Mountain',
];
const disneylandRideIds = [58, 121, 64, 65, 66, 120, 68, 119, 70, 72, 73, 74, 62, 75, 57];
const disneylandTasks: TaskType[] = [
  ...disneylandRideNames.map((name, index) => ({
    ...sampleTasks[0], id: disneylandRideIds[index], name,
    latitude: '33.8115', longitude: '-117.9190',
    coin_level: undefined, coin_url: '',
  })),
  { ...sampleTasks[0], id: 67, name: 'Main Street, U.S.A.',
    latitude: '33.8115', longitude: '-117.9190', coin_level: undefined, coin_url: '' },
];

/** Sample-only view of the park collection entry and real mystery-coin modal. */
export default function ParkChecklistPreviewScreen() {
  // Capture fixture: the audit's real split (15/35 coins, 9 of 25 rides, 0 of 5 limited).
  const coinSplitPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_COIN_SPLIT_PREVIEW === '1';
  const cleanArrivalPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_PREVIEW === '1';
  const cleanRescueGoalPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_RESCUE_GOAL_PREVIEW === '1';
  const cleanDownPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_DOWN_PREVIEW === '1';
  const cleanPassportPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_PASSPORT_PREVIEW === '1';
  const cleanCompletePreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_PASSPORT_COMPLETE_PREVIEW === '1';
  // Capture fixture: the audit's real split (15/35 coins, 9 of 25 rides, 0 of 5 limited).
  const [previewMode, setPreviewMode] = useState(cleanDownPreview || cleanRescueGoalPreview || cleanArrivalPreview ? 1 : 0);
  const [reportedDown, setReportedDown] = useState(cleanDownPreview);
  const [rideOnly, setRideOnly] = useState(cleanPassportPreview);
  const scrollRef = useRef<ScrollView>(null);
  const didScrollToPassport = useRef(false);
  const didScrollToArt = useRef(false);
  const [mapRide, setMapRide] = useState<TaskType | null>(null);
  const fanView = previewMode === 3;
  const showSavedGoal = previewMode === 1 || previewMode === 2;
  const ownsGoal = previewMode >= 2;
  const disneylandPreview = cleanDownPreview || cleanPassportPreview || cleanCompletePreview || coinSplitPreview;
  const previewTasks = disneylandPreview ? disneylandTasks : sampleTasks;
  const parkName = disneylandPreview ? 'Disneyland' : 'Magic Kingdom';
  const goalTask = disneylandPreview ? disneylandTasks[10] : sampleTasks[0];
  const nearbyTask = cleanCompletePreview ? disneylandTasks[15]
    : disneylandPreview ? disneylandTasks[2] : sampleTasks[2];
  const collectedTasks = cleanCompletePreview
    ? disneylandTasks.slice(0, 15).map(task => ({ ...task, times_completed: 1 }))
    : ownsGoal ? [{ ...goalTask, times_completed: 2 }] : [];
  if (mapRide) return <Wrapper previewMode>
    <Topbar>
      <TopbarColumn stretch={false}><Pressable accessibilityRole="button"
        onPress={() => setMapRide(null)}><Text style={{ color: '#fff', fontFamily: 'Shark', fontSize: 22 }}>‹</Text></Pressable></TopbarColumn>
      <TopbarColumn><TopbarText>PARK MAP</TopbarText></TopbarColumn>
      <TopbarColumn stretch={false} />
    </Topbar>
    <PreviewMap style={{ flex: 1 }} initialRegion={{ latitude: Number(mapRide.latitude),
      longitude: Number(mapRide.longitude), latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
      <TaskMarker task={mapRide} isSelected onPress={() => setMapRide(null)} />
    </PreviewMap>
  </Wrapper>;
  return <Wrapper previewMode>
    <Topbar>
      <TopbarColumn stretch={false} />
      <TopbarColumn><TopbarText>{parkName.toUpperCase()}</TopbarText></TopbarColumn>
      <TopbarColumn stretch={false} />
    </Topbar>
    <ImageBackground source={require('../../assets/images/screens/park/background-new.png')}
      style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 15 }}
        onContentSizeChange={() => {
          if (__DEV__ && process.env.EXPO_PUBLIC_PARK_SHELF_ART_PREVIEW === '1' && !didScrollToArt.current) {
            didScrollToArt.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}>
        {!fanView && !cleanArrivalPreview && !cleanRescueGoalPreview && !cleanDownPreview && !cleanPassportPreview && !cleanCompletePreview && <Pressable accessibilityRole="button" onPress={() => setPreviewMode(value => (value + 1) % 4)}
          style={{ alignSelf: 'flex-start', backgroundColor: '#ffcb3e', padding: 9, borderRadius: 9 }}>
          <Text style={{ color: '#073e79', fontFamily: 'Knockout', fontSize: 14 }}>
            {previewMode === 0 ? 'Show saved ride goal' : previewMode === 1
              ? 'Show collected goal' : previewMode === 2 ? 'View fan collection' : 'Show nearby suggestion'}
          </Text>
        </Pressable>}
        {previewMode === 1 && !cleanArrivalPreview && !cleanRescueGoalPreview && !cleanDownPreview && !cleanPassportPreview && !cleanCompletePreview && <Pressable accessibilityRole="button"
          onPress={() => setReportedDown(value => !value)}
          style={{ alignSelf: 'flex-start', backgroundColor: '#ffcb3e', padding: 9, borderRadius: 9 }}>
          <Text style={{ color: '#073e79', fontFamily: 'Knockout', fontSize: 14 }}>
            {reportedDown ? 'Show ride operating' : 'Show reported ride downtime'}
          </Text>
        </Pressable>}
        <ParkCollectionHeader parkName={parkName} available={coinSplitPreview ? 35 : previewTasks.length} isOwnPark={!fanView}
          completionRate={cleanCompletePreview ? 94 : ownsGoal ? 14 : 0}
          collected={coinSplitPreview ? 15 : cleanCompletePreview ? 15 : ownsGoal ? 1 : 0}
          ridePassportAvailable={coinSplitPreview ? 25 : disneylandPreview ? 15 : 7}
          ridePassportCollected={coinSplitPreview ? 9 : cleanCompletePreview ? 15 : ownsGoal ? 1 : 0}
          limitedCollected={coinSplitPreview ? 0 : undefined} limitedAvailable={coinSplitPreview ? 5 : undefined}
          onOpenRidePassport={() => setRideOnly(true)}
          onOpenStampBook={cleanCompletePreview ? () => {} : undefined}
          nextRideName={showSavedGoal ? 'Space Mountain' : null} nextRideOwned={ownsGoal}
          ownedGoalHint={ownsGoal ? '1 Ride Part at this ride · 0 Energy to upgrade.' : null}
          nearbyRideName={fanView || showSavedGoal ? null : nearbyTask.name} ticketsNeeded={1}
          rescuePassAvailable={cleanRescueGoalPreview || cleanArrivalPreview}
          goalReportedDown={previewMode === 1 && reportedDown}
          alternateRideName={previewMode === 1 && reportedDown ? nearbyTask.name : null}
          parkCoins={cleanRescueGoalPreview || cleanArrivalPreview ? 0 : 28}
          taskMilestones={cleanRescueGoalPreview || cleanArrivalPreview ? 0 : 10}
          secretMilestones={cleanRescueGoalPreview || cleanArrivalPreview ? 0 : 2} />
        <View onLayout={event => {
          if (cleanPassportPreview && !didScrollToPassport.current) {
            didScrollToPassport.current = true;
            const checklistY = event.nativeEvent.layout.y;
            setTimeout(() => scrollRef.current?.scrollTo({ y: checklistY, animated: false }), 250);
          }
        }} style={{ backgroundColor: '#075d9c', borderWidth: 2, borderColor: '#fff',
          borderRadius: 18, padding: 12 }}>
          <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 24, textAlign: 'center' }}>
            {rideOnly ? 'RIDE PASSPORT CHECKLIST' : 'PARK COIN CHECKLIST'}
          </Text>
          <ParkRideDirectory rides={previewTasks} completed={collectedTasks} isOwnPark={!fanView}
            rideTaskIds={disneylandPreview ? disneylandRideIds : previewTasks.slice(0, 7).map(task => task.id)}
            rideOnly={rideOnly} onRideOnlyChange={setRideOnly}
            goalTaskId={showSavedGoal ? goalTask.id : null}
            nearbyRideId={previewMode === 1 && reportedDown ? nearbyTask.id : fanView || showSavedGoal ? null : nearbyTask.id}
            nearbyRideReportedOpen={previewMode === 1 && reportedDown}
            savedGoalReportedDown={previewMode === 1 && reportedDown}
            onChooseGoal={fanView ? undefined : async () => {}}
            onPlayInLine={fanView ? undefined : () => {}}
            onShowOnMap={fanView ? undefined : setMapRide} />
          <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 19,
            textAlign: 'center', marginTop: 18 }}>COIN SHELF</Text>
          {Array.from({ length: Math.ceil(previewTasks.length / 5) }, (_, index) => (
            <View key={index} style={{ height: 110, justifyContent: 'center' }}>
              <ParkShelfArtwork />
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {previewTasks.slice(index * 5, index * 5 + 5).map(task =>
                  ownsGoal && task.id === goalTask.id
                    ? <TaskCoinModal key={task.id} task={task} readOnly={fanView}
                        onPlayInLine={fanView ? undefined : () => {}}
                        timesCompleted={collectedTasks[0]?.times_completed} />
                    : <UnfoundCoinModal key={task.id} task={task}
                        onPlayInLine={fanView ? undefined : () => {}}
                        onChooseGoal={fanView ? undefined : async () => {}}
                        onShowOnMap={fanView ? undefined : () => setMapRide(task)} />)}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ImageBackground>
  </Wrapper>;
}
