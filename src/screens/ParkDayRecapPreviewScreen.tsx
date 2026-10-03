import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getParkDayRecap, type ParkDayRecap } from '../api/endpoints/me/park-day-recap';
import ParkDayRecapCard from './ParkDayRecapCard';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';

const prior: ParkDayRecap = {
  park_id: 1, park_name: 'Universal Studios Hollywood', park_day: '2026-09-23',
  previous_active_day: null, timezone: 'America/New_York',
  ride_wins: 7, distinct_rides_won: 7, new_coins: 3, line_play_sessions: 2,
  coins: [{"asset_id": 11, "ride_name": "DinoPlay", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/YcExEGuduIZNjtBCnEPVgnenzhSzvMSs7ZA2QOgC.png", "new": true}, {"asset_id": 13, "ride_name": "Forbidden Journey", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/6ZfzpRsqfroNih4XHDBmgoDwoPxxjlBvp4cU2vwc.png", "new": true}, {"asset_id": 19, "ride_name": "Mummy", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/d4jDw5cL1wtDEHFh3Ym5TeajiwG4WN94kSWP34jW.png", "new": true}, {"asset_id": 23, "ride_name": "Secret Life of Pets", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/yi8KkOCMksLVHRslaLxbUs7VzNMTyctVniTKK9TC.png", "new": false}, {"asset_id": 26, "ride_name": "Super Silly", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/UXqhHc939YhJNsHTYks7Ewrik7eq1pNMUt797lqI.png", "new": false}, {"asset_id": 28, "ride_name": "The Simpsons Ride", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/GoVjPLa6bSIVH1dtu3kYZwZpbSQocBpHnve0SCKC.png", "new": false}, {"asset_id": 32, "ride_name": "World Famous Studio Tour", "coin_url": "https://assets.themeparkshark.com/mobile/production/assets/ygI0Sc27wIMd3blodsXWO2PjNcAtaifOvwsxL6Zp.png", "new": false}],
  eligible_line_minutes: 36, ride_parts_earned: 4, coin_upgrades: 1,
  park_project_points: 5,
  moments: [
    { type: 'new_coin', title: 'Collected Space Mountain coin', at: '2026-09-23T14:10:00Z' },
    { type: 'line_play', title: 'Finished Space Mountain LinePlay · +2 Parts', at: '2026-09-23T14:50:00Z',
      story_memento: { chapter_title: 'The Lost Star Chart', route_name: 'Follow the stars' } },
    { type: 'upgrade', title: 'Space Mountain reached level 2', at: '2026-09-23T15:01:00Z' },
    { type: 'project', title: 'Helped The Missing Signal · +2 signal', at: '2026-09-23T15:02:00Z' },
    { type: 'new_coin', title: 'Collected Pirates of the Caribbean coin', at: '2026-09-23T18:13:00Z' },
  ],
};

const today: ParkDayRecap = {
  ...prior, park_day: '2026-09-24', previous_active_day: '2026-09-23',
  ride_wins: 0, distinct_rides_won: 0, new_coins: 0, line_play_sessions: 0,
  eligible_line_minutes: 0, ride_parts_earned: 0, coin_upgrades: 0,
  park_project_points: 0, moments: [],
};

/** Development-only visual check of the real recap card and its day navigation. */
export default function ParkDayRecapPreviewScreen() {
  const live = __DEV__ && process.env.EXPO_PUBLIC_PARK_DAY_RECAP_LIVE === '1';
  const [atPark, setAtPark] = useState(true);
  const [busyToday, setBusyToday] = useState(true);
  const [version, setVersion] = useState(0);
  const loadRecap = useCallback(async (_parkId: number, date?: string) => {
    if (live) return getParkDayRecap(_parkId, date);
    return date ? prior : busyToday ? { ...prior, park_day: '2026-09-24', previous_active_day: '2026-09-23' } : today;
  }, [busyToday, live]);

  return <Wrapper previewMode onNavigate={() => {}}>
    <Topbar>
      <TopbarColumn stretch={false} />
      <TopbarColumn><TopbarText>Ride Coins</TopbarText></TopbarColumn>
      <TopbarColumn stretch={false} />
    </Topbar>
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.context}>{live ? 'LOCAL PLAYER QA · confirmed park day' : 'Universal Studios Hollywood · sample park day'}</Text>
      <ParkDayRecapCard parkId={1} atPark={atPark} refreshVersion={version}
        loadRecap={loadRecap} initiallyExpanded={!live} />
      {!live && <View style={styles.toolbar}>
        <Pressable onPress={() => { setAtPark(value => !value); setVersion(value => value + 1); }}>
          <Text style={styles.action}>{atPark ? 'At park' : 'At home'}</Text>
        </Pressable>
        <Pressable onPress={() => { setBusyToday(value => !value); setVersion(value => value + 1); }}>
          <Text style={styles.action}>{busyToday ? 'Busy day' : 'Empty day'}</Text>
        </Pressable>
      </View>}
    </ScrollView>
  </Wrapper>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#a9e4ff' },
  toolbar: { paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', gap: 12 },
  action: { color: '#075b9b', fontFamily: 'Knockout', fontSize: 14, paddingVertical: 8 },
  content: { padding: 16, paddingBottom: 100 },
  context: { color: '#074980', fontFamily: 'Shark', fontSize: 21, marginBottom: 16 },
});
