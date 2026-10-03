import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import InformationModal from '../components/InformationModal';
import { InformationModalEnums } from '../models/information-modal-enums';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import Experience from './LeaderboardsScreen/Experience';
import ParkCoins from './LeaderboardsScreen/ParkCoins';
import RideStandings from './LeaderboardsScreen/RideStandings';
import HomeHunt from './LeaderboardsScreen/HomeHunt';
import { cachedHomeHuntWeek, homeHuntEnabled, loadHomeHuntWeek } from './LeaderboardsScreen/homeHuntWeekCache';
import { initialStandingsTab, standingsTabSizing, standingsTabs, type StandingsTabSpec } from './LeaderboardsScreen/homeHuntModel';
import { AuthContext } from '../context/AuthProvider';
import { usePresentationBadges } from '../hooks/usePresentationQueue';
import { BRAND, GameIcon } from '../ui';
import StandingsBoardV2 from './LeaderboardsScreen/StandingsBoardV2';
import { prefetchBoards, standingsV2Missing } from './LeaderboardsScreen/standingsV2Store';
import { onStandingsDemo, startStandingsDemo } from './LeaderboardsScreen/standingsDemo';
import { initialStandingsV2Tab, standingsV2Tabs, type StandingsV2Tab } from './LeaderboardsScreen/standingsV2Model';
import useUiReducedMotion from '../ui/useUiReducedMotion';

const whooshSound = require('../../assets/sounds/whoosh.mp3');

/**
 * Three tabs on a blue rail (four when the Home Hunt board is on); a white
 * pill springs under the chosen one. A dot on Home Hunt means unclaimed results.
 */
function TabLabel({ label, index, pillX, fontSize }: {
  readonly label: string; readonly index: number; readonly pillX: SharedValue<number>; readonly fontSize: number;
}) {
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(pillX.value - index)), [0, 1], [BRAND.navy, BRAND.white]),
  }));
  return <Animated.Text numberOfLines={1} adjustsFontSizeToFit style={[{ fontFamily: 'Shark', fontSize }, style]}>{label}</Animated.Text>;
}

function StandingsTabs({ tabs, active, onChange, dot }: {
  readonly tabs: readonly (StandingsTabSpec | StandingsV2Tab)[]; readonly active: number; readonly onChange: (index: number) => void; readonly dot: boolean;
}) {
  const size = standingsTabSizing(tabs.length);
  const reduced = useUiReducedMotion();
  const [width, setWidth] = useState(0);
  const segment = width / tabs.length;
  // One shared position drives the pill and every label's color, so a label is
  // navy exactly while the white pill is under it (never white on white mid-slide).
  const pillX = useSharedValue(active);
  useEffect(() => {
    pillX.value = reduced ? active : withSpring(active, { damping: 17, stiffness: 230 });
  }, [active, reduced, pillX]);
  const pill = useAnimatedStyle(() => ({
    width: Math.max(0, segment - 8),
    transform: [{ translateX: pillX.value * segment }],
  }), [segment]);
  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{
      flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 4, borderRadius: 18,
      backgroundColor: 'rgba(5,52,110,0.35)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    }}>
      {width > 0 && <Animated.View style={[{
        position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 14, backgroundColor: BRAND.white,
        borderBottomWidth: 3, borderBottomColor: BRAND.sky,
      }, pill]} />}
      {tabs.map((tab, index) => {
        const selected = active === index;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }}
            onPress={() => { if (!selected) void Haptics.selectionAsync().catch(() => undefined); onChange(index); }}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', flexDirection: size.stacked ? 'column' : 'row', gap: size.stacked ? 0 : 6 }}>
            <GameIcon name={tab.icon} size={size.icon} />
            <TabLabel label={tab.label} index={index} pillX={pillX} fontSize={size.font} />
            {tab.key === 'hunt' && dot && !selected && (
              <View accessibilityLabel="Unclaimed results" style={{ position: 'absolute', top: 4, right: 10, width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND.red, borderWidth: 2, borderColor: BRAND.white }} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Standings. v2 (next-wave/standings-v2/PROPOSAL.md): three boards with one
 * number each (This Week, Friends, All-Time) plus Home Hunt behind its flag.
 * A signed-out viewer, or a server without GET /me/standings, gets the legacy
 * boards so an OTA can never land on a broken screen.
 */
export default function LeaderboardScreen() {
  const { player } = useContext(AuthContext);
  const [v2Missing, setV2Missing] = useState(standingsV2Missing);
  if (!player || v2Missing) return <LegacyStandings />;
  return <StandingsV2 meId={player.id} onMissing={() => setV2Missing(true)} />;
}

function StandingsShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn>
          <TopbarText>Standings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.LeaderboardScreen} />
        </TopbarColumn>
      </Topbar>
      <View style={{ marginTop: -8, flex: 1 }}>
        <ImageBackground style={{ flex: 1 }} source={require('../../assets/images/screens/leaderboard/standings-bg.png')}>
          {children}
        </ImageBackground>
      </View>
    </Wrapper>
  );
}

function StandingsV2({ meId, onMissing }: { readonly meId: number; readonly onMissing: () => void }) {
  const route = useRoute();
  const tabParam = (route.params as { tab?: string } | undefined)?.tab;
  const [huntOn, setHuntOn] = useState(() => homeHuntEnabled(cachedHomeHuntWeek()));
  const tabs = standingsV2Tabs(huntOn);
  const [activeTab, setActiveTab] = useState(() => initialStandingsV2Tab(tabParam, tabs));
  const { playSound } = useContext(SoundEffectContext);
  const resultsWaiting = usePresentationBadges('standings').length > 0;
  useEffect(() => {
    let live = true;
    void loadHomeHuntWeek(meId).then(week => { if (live) setHuntOn(homeHuntEnabled(week)); });
    // The other boards load in the background so the first switch is instant.
    prefetchBoards(meId, [{ board: 'week' }, { board: 'friends' }, { board: 'all_time' }]);
    return () => { live = false; };
  }, [meId]);
  useEffect(() => {
    if (tabParam) setActiveTab(initialStandingsV2Tab(tabParam, tabs));
  }, [tabParam, huntOn]);
  useEffect(() => { if (activeTab >= tabs.length) setActiveTab(0); }, [tabs.length, activeTab]);
  // Dev-only capture tour (EXPO_PUBLIC_STANDINGS_DEMO=1); a no-op otherwise.
  useEffect(() => {
    const off = onStandingsDemo(event => { if (event.type === 'tab') { playSound(whooshSound); setActiveTab(event.index); } });
    const stop = startStandingsDemo();
    return () => { off(); stop(); };
  }, [playSound]);
  const key = tabs[activeTab]?.key ?? 'week';

  return (
    <StandingsShell>
      <StandingsTabs tabs={tabs} dot={resultsWaiting} active={activeTab} onChange={index => {
        if (activeTab !== index) playSound(whooshSound);
        setActiveTab(index);
      }} />
      {/* The three boards stay mounted (hidden when not chosen), so a tab switch never paints a
          blank frame: faces, barrels and rows are already decoded. */}
      <View style={{ flex: 1 }}>
        {(['week', 'friends', 'all_time'] as const).map(board => (
          <View key={board} pointerEvents={key === board ? 'box-none' : 'none'}
            accessibilityElementsHidden={key !== board} importantForAccessibility={key === board ? 'auto' : 'no-hide-descendants'}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: key === board ? 1 : 0, zIndex: key === board ? 1 : 0 }}>
            <StandingsBoardV2 board={board} meId={meId} onMissing={onMissing} active={key === board} />
          </View>
        ))}
        {key === 'hunt' && <HomeHunt />}
      </View>
    </StandingsShell>
  );
}

/** The pre-v2 boards (Coins Won, Rides, Experience), kept for older servers and guests. */
function LegacyStandings() {
  const { player } = useContext(AuthContext);
  const route = useRoute();
  const tabParam = (route.params as { tab?: string } | undefined)?.tab;
  // The Home Hunt tab exists only when the server flag says so (GET /me/home-hunt/week, cached).
  const [huntOn, setHuntOn] = useState(() => homeHuntEnabled(cachedHomeHuntWeek()));
  const tabs = standingsTabs(huntOn);
  const [activeTab, setActiveTab] = useState(() => initialStandingsTab(tabParam, tabs));
  const { playSound } = useContext(SoundEffectContext);
  const resultsWaiting = usePresentationBadges('standings').length > 0;
  useEffect(() => {
    let live = true;
    void loadHomeHuntWeek(player?.id ?? null).then(week => { if (live) setHuntOn(homeHuntEnabled(week)); });
    return () => { live = false; };
  }, [player?.id]);
  // A deep link to the Home Hunt tab lands once the flag answer arrives.
  useEffect(() => {
    if (tabParam) setActiveTab(initialStandingsTab(tabParam, tabs));
  }, [tabParam, huntOn]);
  useEffect(() => { if (activeTab >= tabs.length) setActiveTab(0); }, [tabs.length, activeTab]);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn>
          <TopbarText>Standings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.LeaderboardScreen} />
        </TopbarColumn>
      </Topbar>
      <View
        style={{
          marginTop: -8,
          flex: 1,
        }}
      >
        <ImageBackground
          style={{
            flex: 1,
          }}
          source={require('../../assets/images/screens/leaderboard/standings-bg.png')}
        >
          <StandingsTabs tabs={tabs} dot={resultsWaiting} active={activeTab} onChange={index => {
            if (activeTab !== index) playSound(whooshSound);
            setActiveTab(index);
          }} />

          {/* Tab content remounts for fresh animations; cached data skips the loader. */}
          <View style={{ flex: 1 }}>
            {tabs[activeTab]?.key === 'coins' ? <ParkCoins /> : tabs[activeTab]?.key === 'rides' ? <RideStandings />
              : tabs[activeTab]?.key === 'hunt' ? <HomeHunt /> : <Experience />}
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
