/**
 * Earned Tickets waiting to be claimed (core loop blueprint 4.1 "Claim" and must-fix 14 and 19).
 *
 * Out of Tickets, the guide card first claims Tickets the player already earned (stamps first),
 * in place, before today's free try and long before any shop. The Stamp Book is read only while
 * the player is at 0 Tickets at a park, at most once a minute.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { claimStampReward, getStamps } from '../../api/endpoints/me/stamps';
import { orderClaimSources, type ClaimSource } from '../../services/guide/freeTickets';
import { stampTicketSources } from './guideCoins';

const READ_EVERY_MS = 60_000;

export default function useClaimableTickets(enabled: boolean, tickets: number, playerId: number | null): {
  readonly sources: readonly ClaimSource[];
  /** Claim every waiting Ticket source, stamps first. Resolves with the Tickets claimed. */
  readonly claim: () => Promise<number>;
} {
  const [sources, setSources] = useState<readonly ClaimSource[]>([]);
  const lastRead = useRef<{ player: number | null; at: number }>({ player: null, at: 0 });
  const owner = useRef(playerId); owner.current = playerId;
  const read = useCallback(async (force = false) => {
    const player = owner.current;
    if (!force && lastRead.current.player === player && Date.now() - lastRead.current.at < READ_EVERY_MS) return;
    lastRead.current = { player, at: Date.now() };
    try {
      const book = await getStamps();
      if (owner.current === player) setSources(orderClaimSources(stampTicketSources(book?.stamps)));
    } catch { /* offline: the card goes on to the free try */ }
  }, []);
  useEffect(() => { setSources([]); lastRead.current = { player: null, at: 0 }; }, [playerId]);
  useEffect(() => {
    if (!enabled || playerId == null || tickets > 0) return;
    void read();
  }, [enabled, playerId, tickets, read]);
  const claim = useCallback(async () => {
    let claimed = 0;
    for (const source of orderClaimSources(sources)) {
      if (source.kind !== 'stamp' || source.id == null) continue;
      try {
        const result = await claimStampReward(Number(source.id));
        claimed += Number(result?.rewards?.tickets ?? 0) || 0;
      } catch { /* already claimed or offline: the next read shows the truth */ }
    }
    await read(true);
    return claimed;
  }, [sources, read]);
  return { sources, claim };
}
