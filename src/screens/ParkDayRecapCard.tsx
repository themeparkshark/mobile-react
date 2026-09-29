import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useRef, useState } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { AuthContext } from '../context/AuthProvider';
import ParkDayShareCard, { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '../components/ParkDayShareCard';
import { Alert, Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getParkDayRecap, type ParkDayRecap } from '../api/endpoints/me/park-day-recap';
import { parkDayCaptureSize } from '../components/parkDayShareMetrics';
import * as RootNavigation from '../RootNavigation';

interface Props {
  readonly parkId: number;
  readonly atPark: boolean;
  readonly refreshVersion: number;
  readonly loadRecap?: typeof getParkDayRecap;
  readonly initiallyExpanded?: boolean;
}

export default function ParkDayRecapCard({ parkId, atPark, refreshVersion, loadRecap = getParkDayRecap,
  initiallyExpanded = false }: Props) {
  const [recap, setRecap] = useState<ParkDayRecap | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [artworkReady, setArtworkReady] = useState(false);
  const shareBusy = useRef(false);
  const shareRef = useRef<View>(null);
  const { player } = useContext(AuthContext);

  // Capture the off-screen Story card at 1080x1920 and hand it to the share
  // sheet (Instagram Stories, Messages, save to Photos).
  const shareDay = async () => {
    if (shareBusy.current || !shareRef.current || !artworkReady) return;
    shareBusy.current = true;
    setSharing(true);
    try {
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing unavailable', 'This device cannot open a share sheet right now.');
        return;
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, ...parkDayCaptureSize(Platform.OS, PixelRatio.get()) });
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your park day' });
    } catch {
      Alert.alert('Could not make your park card', 'Your game moments are saved. Try sharing again.');
    } finally {
      shareBusy.current = false;
      setSharing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    let current = true;
    setRecap(null);
    setArtworkReady(false);
    setError(false);
    void loadRecap(parkId, selectedDay ?? undefined).then(result => {
      if (current) setRecap(result);
    }).catch(() => {
      if (current) setError(true);
    });
    return () => { current = false; };
  }, [parkId, refreshVersion, retry, selectedDay, loadRecap]));

  if (!recap) {
    if (!error || !atPark) return null;
    return <Pressable style={styles.card} accessibilityRole="button" onPress={() => setRetry(value => value + 1)}>
      <Text style={styles.title}>TODAY'S PARK STORY</Text>
      <Text style={styles.copy}>Could not load your day. Tap to retry.</Text>
    </Pressable>;
  }

  const hasActivity = recap.moments.length > 0;
  if (!hasActivity && !atPark && !recap.previous_active_day) return null;

  const showEarlier = (day: string | null) => {
    setExpanded(false);
    setSelectedDay(day);
  };

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.kicker}>{recap.park_day} · {recap.park_name}</Text>
        <Text style={styles.title}>{selectedDay ? 'PARK DAY STORY' : "TODAY'S PARK STORY"}</Text>
      </View>
      <Image source={require('../../assets/images/screens/pin-collections/shark.png')}
        resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
    </View>
    {hasActivity ? <>
      <View style={styles.statStrip}>
        <View style={styles.stat}><Text style={styles.statValue}>{recap.distinct_rides_won}</Text><Text style={styles.statLabel}>RIDES WON</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{recap.new_coins}</Text><Text style={styles.statLabel}>NEW COINS</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{recap.coin_upgrades}</Text><Text style={styles.statLabel}>UPGRADES</Text></View>
      </View>
      {recap.line_play_sessions > 0 && <Text style={styles.copy}>
        {recap.eligible_line_minutes} verified queue minutes · {recap.ride_parts_earned} Ride Parts
      </Text>}
      {recap.park_project_points > 0 && <Text style={styles.copy}>
        +{recap.park_project_points} points toward the shared Park Project
      </Text>}
      <Pressable style={styles.action} accessibilityRole="button" onPress={() => setExpanded(value => !value)}>
        <Text style={styles.actionText}>{expanded ? 'Hide moments' : 'See recent moments'}</Text>
      </Pressable>
      {expanded && recap.moments.map((moment, index) => <View key={`${moment.at}-${index}`}
        style={[styles.moment, moment.story_memento?.chapter_title ? styles.storyMoment : null]}>
        {moment.story_memento?.chapter_title && <Image
          source={require('../../assets/images/screens/lineplay/queue-recap-shark.png')}
          resizeMode="contain" style={styles.storyShark} />}
        <View style={styles.momentCopy}>
          {moment.story_memento?.chapter_title && <Text style={styles.storyKicker}>QUEUE STORY SAVED</Text>}
          {moment.story_memento?.chapter_title && <Text style={styles.storyTitle}>
            {moment.story_memento.chapter_title}
          </Text>}
          {moment.story_memento?.route_name && <Text style={styles.storyRoute}>
            Your route: {moment.story_memento.route_name}
          </Text>}
          <Text style={styles.momentTitle}>{moment.title}</Text>
        </View>
        <Text style={styles.momentTime}>{new Date(moment.at).toLocaleTimeString([], {
          hour: 'numeric', minute: '2-digit', timeZone: recap.timezone,
        })}</Text>
      </View>)}
      {recap.distinct_rides_won > 0 && <Pressable style={styles.shareButton} accessibilityRole="button"
        accessibilityLabel="Share your park day as an image" onPress={() => void shareDay()} disabled={sharing || !artworkReady}
        accessibilityState={{ disabled: sharing || !artworkReady, busy: sharing || !artworkReady }}>
        <Text style={styles.shareText}>{sharing ? 'Making your card…' : !artworkReady ? 'Preparing artwork…' : 'SHARE MY DAY'}</Text>
      </Pressable>}
      <Pressable style={styles.link} accessibilityRole="button" onPress={() => RootNavigation.navigate('CoinShelf')}>
        <Text style={styles.linkText}>See your Ride Coins →</Text>
      </Pressable>
      {recap.distinct_rides_won > 0 && <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ParkDayShareCard ref={shareRef} recap={recap} sharkName={player?.username}
          avatarUrl={player?.avatar_url} onReadyChange={setArtworkReady} />
      </View>}
    </> : <Text style={styles.copy}>
      {atPark ? "Your first ride challenge will start this day's story. LinePlay and coin upgrades add more moments."
        : 'No confirmed game moments here today. Your earlier park story is still available.'}
    </Text>}
    {recap.previous_active_day && <Pressable style={styles.link} accessibilityRole="button"
      onPress={() => showEarlier(recap.previous_active_day!)}>
      <Text style={styles.linkText}>Earlier park day: {recap.previous_active_day} →</Text>
    </Pressable>}
    {selectedDay && <Pressable style={styles.link} accessibilityRole="button" onPress={() => showEarlier(null)}>
      <Text style={styles.linkText}>Back to today →</Text>
    </Pressable>}
    <Text style={styles.note}>Your game wins and verified queue time form this story. Ride memories live in your ride journal.</Text>
  </View>;
}

const styles = StyleSheet.create({
  shareButton: { marginTop: 12, backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  shareText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  offscreen: { position: 'absolute', left: -2000, top: 0, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  card: { backgroundColor: '#bdeaff', borderWidth: 3, borderColor: '#fff', borderRadius: 20,
    padding: 13, marginBottom: 16, shadowColor: '#064b89', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 4 },
  header: { backgroundColor: '#0875c9', borderRadius: 14, minHeight: 78,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingLeft: 12 },
  headerCopy: { flex: 1, zIndex: 1 },
  shark: { width: 90, height: 90, marginRight: -10 },
  kicker: { color: '#c2ecff', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.4 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 20, marginTop: 3,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  statStrip: { flexDirection: 'row', backgroundColor: '#fff8dc', borderWidth: 2, borderColor: '#ffce3a',
    borderRadius: 13, marginTop: 10, marginBottom: 5, paddingVertical: 7 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#0b5598', fontFamily: 'Shark', fontSize: 23 },
  statLabel: { color: '#285c83', fontFamily: 'Knockout', fontSize: 11 },
  copy: { color: '#153e67', fontFamily: 'Knockout', fontSize: 15, lineHeight: 21, marginTop: 8 },
  action: { alignSelf: 'flex-start', backgroundColor: '#ffca30', borderWidth: 2,
    borderColor: '#fff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10 },
  actionText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 18 },
  moment: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 8, padding: 9, marginTop: 5,
    flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  storyMoment: { backgroundColor: '#fff8df', borderWidth: 2, borderColor: '#f3be32',
    borderRadius: 13, alignItems: 'center', marginTop: 9 },
  storyShark: { width: 46, height: 58 },
  momentCopy: { flex: 1 },
  momentTitle: { color: '#153e67', fontFamily: 'Knockout', fontSize: 14 },
  storyKicker: { color: '#9b6600', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.6 },
  storyTitle: { color: '#075b9b', fontFamily: 'Shark', fontSize: 16, marginTop: 2 },
  storyRoute: { color: '#376888', fontFamily: 'Knockout', fontSize: 13, marginTop: 1, marginBottom: 4 },
  momentTime: { color: '#427a9d', fontFamily: 'Knockout', fontSize: 12 },
  link: { alignSelf: 'flex-start', paddingVertical: 8 },
  linkText: { color: '#005da4', fontFamily: 'Knockout', fontSize: 16 },
  note: { color: '#376888', fontFamily: 'Knockout', fontSize: 12, lineHeight: 16, marginTop: 8 },
});
