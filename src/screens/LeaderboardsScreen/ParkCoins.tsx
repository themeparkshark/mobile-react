import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import getPlayers from '../../api/endpoints/leaderboards/players';
import allParks from '../../api/endpoints/parks/allParks';
import getLeaderboards from '../../api/endpoints/parks/leaderboards/get';
import FloatingParticles from '../../components/FloatingParticles';
import StandingsPicker from '../../components/StandingsPicker';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { LeaderboardType } from '../../models/leaderboard-type';
import { ParkType } from '../../models/park-type';
import { PlayerType } from '../../models/player-type';
import { SharkLoader } from '../../ui';
import StandingsPodium from './StandingsPodium';
import { StandingsInvite, StandingsListCard, StandingsNudge, StandingsRow } from './StandingsRow';
import {
  defaultStandingsPark, pickDefaultLeaderboard, podiumSlots, STANDINGS_EMPTY_COPY, standingsStatus, type StandingsStatus,
} from './standingsModel';
import { standingsGeneration } from './standingsCache';

type Board = { readonly leaderboards: LeaderboardType[]; readonly leaderboardId?: number; readonly players: PlayerType[] };

// Survives tab switches, so returning to this tab shows the last board at once.
const cache: { parks: ParkType[]; parkId?: number; boards: Map<string, Board>; generation: number } =
  { parks: [], boards: new Map(), generation: standingsGeneration() };

const coinScore = (player: PlayerType) => Number(player.park_coins) || 0;

export default function ParkCoins() {
  const { player } = useContext(AuthContext);
  const { park: currentPark } = useContext(LocationContext);
  const [parks, setParks] = useState<ParkType[]>(cache.parks);
  const [chosenParkId, setChosenParkId] = useState<number | undefined>(cache.parkId);
  const [chosenBoardId, setChosenBoardId] = useState<number | undefined>();
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<StandingsStatus>('loading');
  const [reload, setReload] = useState(0);
  const request = useRef(0);

  const parkId = defaultStandingsPark({
    chosenParkId, locationParkId: currentPark?.id, playerParkId: player?.current_park_id, parkIds: parks.map(p => p.id),
  });

  // Parks list (once, then cached).
  useEffect(() => {
    if (cache.parks.length) return;
    let active = true;
    allParks().then(list => {
      if (!active) return;
      cache.parks = list ?? [];
      setParks(cache.parks);
      if (!cache.parks.length) setStatus('empty');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [reload]);

  // Board for the park and period. Every path ends in ready, empty or error.
  useEffect(() => {
    if (!parkId) return;
    if (cache.generation !== standingsGeneration()) {
      cache.boards.clear();
      cache.generation = standingsGeneration();
    }
    const key = `${parkId}:${chosenBoardId ?? 'default'}`;
    const cached = cache.boards.get(key);
    if (cached) {
      setBoard(cached);
      setStatus(standingsStatus({ players: cached.players }));
      return;
    }
    const id = ++request.current;
    setBoard(null);
    setStatus('loading');
    (async () => {
      const leaderboards = await getLeaderboards(parkId);
      const leaderboardId = chosenBoardId && leaderboards.some(b => b.id === chosenBoardId)
        ? chosenBoardId : pickDefaultLeaderboard(leaderboards);
      const players = leaderboardId ? await getPlayers(leaderboardId) : [];
      return { leaderboards: leaderboards ?? [], leaderboardId, players: players ?? [] };
    })().then(next => {
      if (id !== request.current) return;
      cache.boards.set(key, next);
      cache.parkId = parkId;
      setBoard(next);
      setStatus(standingsStatus({ players: next.players }));
    }).catch(() => {
      if (id === request.current) setStatus('error');
    });
  }, [parkId, chosenBoardId, reload]);

  const retry = () => { cache.boards.clear(); setReload(value => value + 1); };
  const slots = podiumSlots(board?.players);
  const copy = STANDINGS_EMPTY_COPY.coins;

  const pickers = (
    <View style={{ paddingTop: 16, paddingHorizontal: 16, flexDirection: 'row', zIndex: 20, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <StandingsPicker
          title="Select Park"
          value={parkId}
          onValueChange={value => { setChosenParkId(value); setChosenBoardId(undefined); cache.parkId = value; }}
          items={parks.map(p => ({ label: p.display_name ?? p.name, value: p.id }))}
        />
      </View>
      {!!board?.leaderboards.length && (
        <View style={{ flex: 1 }}>
          <StandingsPicker
            title="Time Period"
            value={board.leaderboardId}
            onValueChange={setChosenBoardId}
            items={board.leaderboards.map(item => ({ label: item.duration_text, value: item.id }))}
          />
        </View>
      )}
    </View>
  );

  if (status === 'error') {
    return <SharkLoader state="error" tone="onBlue" title="Standings didn't load" onRetry={retry} />;
  }
  if (status === 'loading' || !board) {
    return (
      <ScrollView>
        {pickers}
        <SharkLoader tone="onBlue" onRetry={retry} style={{ minHeight: 420 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView>
      <FloatingParticles count={10} />
      <StandingsPodium
        podium={slots.podium}
        scoreOf={coinScore}
        scoreIcon="coin"
        meId={player?.id}
        playKey={`${parkId}:${board.leaderboardId ?? 'none'}:${slots.count}`}
        header={pickers}
      />
      <StandingsListCard>
        {slots.count === 0 ? (
          <StandingsInvite title={copy.title} message={copy.message} actionLabel={copy.action}
            onAction={() => RootNavigation.navigate('Explore')} />
        ) : (
          <>
            {slots.rest.map((entry, index) => (
              <StandingsRow key={entry.id} player={entry} rank={index + 4} index={index} score={coinScore(entry)}
                scoreIcon="coin" isMe={entry.id === player?.id} />
            ))}
            {slots.count < 3 && <StandingsNudge text="Open spots on the podium. Win a ride challenge here to claim one." />}
          </>
        )}
      </StandingsListCard>
    </ScrollView>
  );
}
