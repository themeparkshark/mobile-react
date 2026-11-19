/**
 * Fix w4 T102: the one host for level-up moments (services/rewards/levelUps). A short reward toast with the XP
 * picture says the new level, and when Level Chests are on for this player (the daily rung is open and the switch
 * is on) it points to the chest in Rewards. Draws nothing itself: the toast is the shared kit's (ToastProvider).
 */
import { useEffect } from 'react';
import { useToast } from '../Toast';
import { haptic } from '../../gamekit/Haptics';
import { levelUpLine, onLevelUp, takeLevelMoment } from '../../services/rewards/levelUps';
import { retentionFlagsNow } from '../../services/retention/flags';
import { rungState } from '../../services/reveal/revealLadder';

export default function LevelUpMoment() {
  const { showToast } = useToast();
  useEffect(() => onLevelUp(() => {
    const level = takeLevelMoment();
    if (!level) return;
    const chestWaits = retentionFlagsNow()?.levelChests === true && rungState('daily').open;
    showToast({ type: 'reward', icon: 'xp', message: levelUpLine(level, chestWaits), duration: 3200 });
    haptic('success');
  }), [showToast]);
  return null;
}
