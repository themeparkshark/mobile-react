import { useEffect, useRef, useState } from 'react';
import { type AttackResult } from '../api/endpoints/parks/raid';
import { bossAttackRecovery, type BossAttackCheckpoint, type BossAttackRecovery } from '../services/boss/attackRecovery';

export default function useBossAttackRecovery({ playerId, parkId, onResult, recovery = bossAttackRecovery }: {
  playerId: number | null;
  parkId: number | null;
  onResult: (checkpoint: BossAttackCheckpoint, result: AttackResult) => void;
  recovery?: BossAttackRecovery;
}) {
  const key = playerId && parkId ? `${playerId}:${parkId}` : null;
  const scope = useRef(key), mounted = useRef(false), callback = useRef(onResult);
  scope.current = key;
  callback.current = onResult;
  const [selection, setSelection] = useState<{
    key: string | null; snapshot: ReturnType<BossAttackRecovery['snapshot']> | null;
  }>({ key: null, snapshot: null });
  const delivered = useRef<string | null>(null);
  const snapshot = key && playerId && parkId
    ? (selection.key === key ? selection.snapshot : recovery.snapshot(playerId, parkId)) : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    delivered.current = null;
    if (!key || !playerId || !parkId) return;
    const update = () => {
      if (mounted.current && scope.current === key) setSelection({ key, snapshot: recovery.snapshot(playerId, parkId) });
    };
    const unsubscribe = recovery.subscribe(playerId, parkId, update);
    update();
    void recovery.load(playerId, parkId);
    return unsubscribe;
  }, [key, recovery]);

  useEffect(() => {
    const receipt = snapshot?.receipt;
    if (!receipt || !key || scope.current !== key ||
      (!receipt.result.ok && receipt.result.error === 'network')) return;
    const requestId = receipt.checkpoint.body.client_request_id;
    if (delivered.current === requestId) return;
    delivered.current = requestId;
    callback.current(receipt.checkpoint, receipt.result);
  }, [snapshot?.receipt, key]);

  const maySubmit = () => mounted.current && key !== null && scope.current === key;
  return {
    snapshot,
    canStart: () => {
      if (!playerId || !parkId || !maySubmit()) return false;
      const current = recovery.snapshot(playerId, parkId);
      return current.loaded && current.phase === 'ready' && current.pending === null;
    },
    capture: (checkpoint: BossAttackCheckpoint) => {
      if (checkpoint.playerId !== playerId || checkpoint.parkId !== parkId || !maySubmit()) return Promise.resolve();
      return recovery.capture(checkpoint, maySubmit);
    },
    retry: () => playerId && parkId && maySubmit()
      ? recovery.retry(playerId, parkId, maySubmit) : Promise.resolve(),
  };
}
