import { useContext, useEffect } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { setLinePlayRecoverySignedIn, subscribeLinePlayRewardRecovery } from './rewardRecovery';

/** Drains pending LinePlay receipts after sign-in, even if LinePlay is never reopened. */
export default function LinePlayRewardRecovery() {
  const { player, refreshPlayer } = useContext(AuthContext);
  useEffect(() => {
    const unsubscribe = subscribeLinePlayRewardRecovery(() => {
      void refreshPlayer().catch(() => undefined);
    });
    setLinePlayRecoverySignedIn(player != null);
    return () => {
      setLinePlayRecoverySignedIn(false);
      unsubscribe();
    };
  }, [player?.id]);
  return null;
}
