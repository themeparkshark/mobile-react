import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { reactToThread, removeReaction } from '../../api/endpoints/social';
import { ForumContext } from '../../context/ForumProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import type { ThreadType } from '../../models/thread-type';
import { emitSocial } from './socialEvents';
import { pickerReactions, toggleReaction, type ReactionState } from './socialModel';

const POP = require('../../../assets/sounds/tap.mp3');

function initialState(thread: ThreadType): ReactionState {
  const counts = thread.reaction_counts
    ?? (thread.reactions ?? []).map((reaction) => ({ reaction_type_id: reaction.reaction_type.id, count: 1 }));
  return {
    counts,
    mine: thread.current_user_reaction?.reaction_type?.id ?? null,
    total: thread.reactions_count ?? counts.reduce((sum, row) => sum + row.count, 0),
  };
}

/**
 * Optimistic shark reactions for one thread: the face pops and the count
 * moves at once, the server call follows, and a failure puts it back.
 */
export default function useReactions(thread: ThreadType, enabled: boolean) {
  const { reactionTypes } = useContext(ForumContext);
  const { playSound } = useContext(SoundEffectContext);
  const [state, setState] = useState<ReactionState>(() => initialState(thread));
  const reactionId = useRef<number | null>(thread.current_user_reaction?.id ?? null);
  const busy = useRef(false);

  // Re-read only when the server's reaction data for this post changes, not
  // whenever the post object does (a new reply must not undo my tap).
  const serverKey = `${thread.id}:${thread.current_user_reaction?.id ?? 0}:${thread.reactions_count ?? 0}:${JSON.stringify(thread.reaction_counts ?? null)}`;
  useEffect(() => {
    setState(initialState(thread));
    reactionId.current = thread.current_user_reaction?.id ?? null;
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const offered = useMemo(() => pickerReactions(reactionTypes ?? []), [reactionTypes]);
  const extra = useMemo(() => (reactionTypes ?? []).filter((type) => !offered.includes(type)), [reactionTypes, offered]);

  const toggle = useCallback(async (typeId: number) => {
    if (!enabled || busy.current) return;
    busy.current = true;
    const before = state;
    const after = toggleReaction(before, typeId);
    setState(after);
    playSound(POP, { volume: 0.6, rate: after.mine ? 1.15 : 0.9 });
    try {
      if (after.mine === null && reactionId.current) {
        await removeReaction(reactionId.current);
        reactionId.current = null;
      } else if (after.mine !== null) {
        const created = await reactToThread(thread.id, typeId);
        reactionId.current = created?.id ?? null;
      }
      // Keep the feed and the post screen showing the same faces.
      const type = reactionTypes.find((item) => item.id === after.mine);
      emitSocial({
        type: 'thread-updated',
        thread: {
          id: thread.id,
          reaction_counts: [...after.counts],
          reactions_count: after.total,
          current_user_reaction: (after.mine && reactionId.current && type
            ? { id: reactionId.current, reaction_type: type }
            : null) as ThreadType['current_user_reaction'],
        },
      });
    } catch {
      setState(before);
    } finally {
      busy.current = false;
    }
  }, [enabled, state, thread.id, playSound, reactionTypes]);

  return { state, toggle, offered, extra };
}
