import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import all from '../../api/endpoints/players/all';
import FloatingParticles from '../../components/FloatingParticles';
import { AuthContext } from '../../context/AuthProvider';
import { PlayerType } from '../../models/player-type';
import { GameButton, SharkLoader } from '../../ui';
import StandingsPodium from './StandingsPodium';
import { StandingsInvite, StandingsListCard, StandingsNudge, StandingsRow } from './StandingsRow';
import {
  experienceScore, podiumSlots, STANDINGS_EMPTY_COPY, standingsStatus, vipNeutralStandingsEnabled, type StandingsStatus,
} from './standingsModel';

const PAGE_SIZE_HINT = 15;
// Read by name so Expo inlines the public env value at build time.
const VIP_NEUTRAL = vipNeutralStandingsEnabled({ EXPO_PUBLIC_VIP_NEUTRAL_STANDINGS: process.env.EXPO_PUBLIC_VIP_NEUTRAL_STANDINGS });

// Survives tab switches, so returning to this tab shows the last board at once.
const cache: { players: PlayerType[]; page: number; more: boolean } = { players: [], page: 1, more: true };

const xpScore = (player: PlayerType) => experienceScore(player as PlayerType & { base_total_experience?: number }, VIP_NEUTRAL);

export default function Experience() {
  const { player } = useContext(AuthContext);
  const [players, setPlayers] = useState<PlayerType[]>(cache.players);
  const [status, setStatus] = useState<StandingsStatus>(cache.players.length ? 'ready' : 'loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (cache.players.length) return;
    const id = ++request.current;
    setStatus('loading');
    all(1).then(list => {
      if (id !== request.current) return;
      cache.players = list ?? [];
      cache.page = 1;
      cache.more = (list?.length ?? 0) >= PAGE_SIZE_HINT;
      setPlayers(cache.players);
      setStatus(standingsStatus({ players: cache.players }));
    }).catch(() => { if (id === request.current) setStatus('error'); });
  }, [reload]);

  const loadMore = async () => {
    if (loadingMore || !cache.more) return;
    setLoadingMore(true);
    try {
      const next = await all(cache.page + 1);
      cache.page += 1;
      cache.more = (next?.length ?? 0) >= PAGE_SIZE_HINT;
      const seen = new Set(cache.players.map(p => p.id));
      cache.players = [...cache.players, ...(next ?? []).filter(p => !seen.has(p.id))];
      setPlayers(cache.players);
    } catch {
      // Keep what is shown; the button stays so the player can try again.
    } finally {
      setLoadingMore(false);
    }
  };

  const retry = () => { cache.players = []; setReload(value => value + 1); };

  if (status === 'error') return <SharkLoader state="error" tone="onBlue" title="Standings didn't load" onRetry={retry} />;
  if (status === 'loading') return <SharkLoader tone="onBlue" onRetry={retry} />;

  const slots = podiumSlots(players);
  const copy = STANDINGS_EMPTY_COPY.xp;

  return (
    <ScrollView>
      <FloatingParticles count={10} />
      <StandingsPodium
        podium={slots.podium}
        scoreOf={xpScore}
        scoreIcon="xp"
        meId={player?.id}
        playKey={`xp:${slots.podium.map(p => p?.id ?? 0).join(',')}`}
        header={<View style={{ height: 24 }} />}
      />
      <StandingsListCard>
        {slots.count === 0 ? (
          <StandingsInvite title={copy.title} message={copy.message} actionLabel={copy.action}
            onAction={() => RootNavigation.navigate('Explore')} />
        ) : (
          <>
            {slots.rest.map((entry, index) => (
              <StandingsRow key={entry.id} player={entry} rank={index + 4} index={index} score={xpScore(entry)}
                scoreIcon="xp" isMe={entry.id === player?.id} />
            ))}
            {slots.count < 3 && <StandingsNudge text="Open spots on the podium. Play to earn XP and claim one." />}
            {cache.more && slots.count >= PAGE_SIZE_HINT && (
              <GameButton variant="ghost" label={loadingMore ? 'Loading' : 'Show more'} loading={loadingMore}
                onPress={() => void loadMore()} style={{ marginTop: 8 }} />
            )}
          </>
        )}
      </StandingsListCard>
    </ScrollView>
  );
}
