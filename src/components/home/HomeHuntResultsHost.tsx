/**
 * Mounts the Monday results through the PresentationQueue, after the daily
 * chest. The queue allows 2 full-screen moments per app open; results past the
 * cap wait as a badge dot on the Standings tab. `enabled` is false until the
 * map is ready for a full-screen moment (chest done, no find open).
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { getHomeHuntResults, type HomeHuntResult } from '../../api/endpoints/me/homeHunt';
import { AuthContext } from '../../context/AuthProvider';
import { usePresentationQueue } from '../../hooks/usePresentationQueue';
import { presentationQueue } from '../../services/presentation/PresentationQueue';
import { homeHuntEnabled, loadHomeHuntWeek } from '../../screens/LeaderboardsScreen/homeHuntWeekCache';
import HomeHuntResultsModal from './HomeHuntResultsModal';
import { RESULTS_BADGE_TARGET, RESULTS_QUEUE_KIND, presentableResults, resultPresentationId } from './homeHuntResultsModel';

export default function HomeHuntResultsHost({ enabled }: { readonly enabled: boolean }) {
  const { player } = useContext(AuthContext);
  const state = usePresentationQueue();
  const [results, setResults] = useState<readonly HomeHuntResult[]>([]);
  const queuedFor = useRef<string | null>(null);
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!enabled || playerId == null) return;
    const session = `${playerId}`;
    if (queuedFor.current === session) return;
    queuedFor.current = session;
    let live = true;
    loadHomeHuntWeek(playerId).then(week => {
      if (!live || !homeHuntEnabled(week)) return null;
      return getHomeHuntResults();
    }).then(data => {
      if (!live || !data) return;
      // Claimable first, so a held result never takes a slot from a reward.
      const list = [...presentableResults(data.results)].sort((a, b) => Number(b.status === 'claimable') - Number(a.status === 'claimable'));
      setResults(list);
      list.forEach(result => presentationQueue.enqueue({
        id: resultPresentationId(result), kind: RESULTS_QUEUE_KIND, badge: RESULTS_BADGE_TARGET,
      }));
    }).catch(() => { queuedFor.current = null; });
    return () => { live = false; };
  }, [enabled, playerId]);

  const current = results.find(result => resultPresentationId(result) === state.current?.id) ?? null;
  const id = current ? resultPresentationId(current) : null;
  return (
    <HomeHuntResultsModal result={current} visible={current != null}
      onClose={() => { if (id) presentationQueue.dismiss(id); }}
      onClaimed={() => { if (id) presentationQueue.dismiss(id); }} />
  );
}
