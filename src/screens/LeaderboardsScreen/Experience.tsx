import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import { allWithMeta } from '../../api/endpoints/players/all';
import FloatingParticles from '../../components/FloatingParticles';
import { AuthContext } from '../../context/AuthProvider';
import { PlayerType } from '../../models/player-type';
import { BRAND, GameButton, GameIcon, SharkLoader } from '../../ui';
import StandingsPodium from './StandingsPodium';
import { StandingsInvite, StandingsListCard, StandingsNudge, StandingsRow } from './StandingsRow';
import {
  experienceScore, podiumSlots, STANDINGS_EMPTY_COPY, standingsStatus, xpIncludesVipBonus, xpVipNote, type StandingsStatus,
} from './standingsModel';
import { standingsGeneration } from './standingsCache';

const PAGE_SIZE_HINT = 15;

// Survives tab switches, so returning to this tab shows the last board at once.
// vipNote is remembered across every loaded page: a VIP player first seen on page 2 still turns the line on.
const cache: { players: PlayerType[]; page: number; more: boolean; generation: number; vipBonus: boolean; vipNote: string | null } =
  { players: [], page: 1, more: true, generation: standingsGeneration(), vipBonus: true, vipNote: null };

/** The number the server ranked this list by (see experienceScore). */
const xpScore = (player: PlayerType) => experienceScore(player);

export default function Experience() {
  const { player } = useContext(AuthContext);
  const [players, setPlayers] = useState<PlayerType[]>(cache.players);
  const [status, setStatus] = useState<StandingsStatus>(cache.players.length ? 'ready' : 'loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (cache.players.length && cache.generation === standingsGeneration()) return;
    cache.generation = standingsGeneration();
    const id = ++request.current;
    setStatus('loading');
    allWithMeta(1).then(({ players: list, meta }) => {
      if (id !== request.current) return;
      cache.vipBonus = xpIncludesVipBonus(meta);
      cache.players = list ?? [];
      cache.vipNote = xpVipNote(cache.players, cache.vipBonus);
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
      const { players: next, meta } = await allWithMeta(cache.page + 1);
      cache.vipBonus = xpIncludesVipBonus(meta);
      cache.page += 1;
      cache.more = (next?.length ?? 0) >= PAGE_SIZE_HINT;
      const seen = new Set(cache.players.map(p => p.id));
      cache.players = [...cache.players, ...(next ?? []).filter(p => !seen.has(p.id))];
      cache.vipNote = xpVipNote(cache.players, cache.vipBonus);
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
  // Honest board: while VIP bonus XP counts in this ranking, one plain line says so.
  const vipNote = cache.vipNote ?? xpVipNote(players, cache.vipBonus);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
      <FloatingParticles count={10} />
      <StandingsPodium
        podium={slots.podium}
        scoreOf={xpScore}
        scoreIcon="xp"
        meId={player?.id}
        playKey={`xp:${slots.podium.map(p => p?.id ?? 0).join(',')}`}
        header={<View style={{ height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {/* A soft navy pill keeps the white line readable over the podium's bright light rays. */}
          {vipNote && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '94%', height: 24,
            paddingLeft: 4, paddingRight: 10, borderRadius: 12, backgroundColor: 'rgba(7, 61, 119, 0.72)' }}>
            <GameIcon name="member" size={16} />
            <Text accessibilityRole="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
              style={{ fontFamily: 'Knockout', fontSize: 14, color: BRAND.white, flexShrink: 1 }}>{vipNote}</Text>
          </View>}
        </View>}
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
