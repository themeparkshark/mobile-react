/**
 * Fix w4 T102: the one host for level-up moments (services/rewards/levelUps). A short reward toast with the XP
 * picture says the new level, and when Level Chests are on for this player (the daily rung is open and the switch
 * is on) it points to the chest in Rewards. Draws nothing itself: the toast is the shared kit's (ToastProvider).
 * The toast layer sits under native sheets, so a level reached inside one (a stamp claim in Rewards) waits until
 * every sheet is gone, then plays a beat later on the screen the player is looking at (device run, Nov 19).
 */
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { useToast } from '../Toast';
import { haptic } from '../../gamekit/Haptics';
import { levelUpLine, notePlayerLevel, onLevelUp, takeLevelMoment } from '../../services/rewards/levelUps';
import { retentionFlagsNow } from '../../services/retention/flags';
import { rungState } from '../../services/reveal/revealLadder';
import { useAnyModalLayer } from '../../ui/modalLayers';

/** The beat after the last sheet leaves before the toast comes in. */
export const LEVEL_UP_SETTLE_MS = 600;

export default function LevelUpMoment() {
  const { showToast } = useToast();
  const sheetUp = useAnyModalLayer();
  const [level, setLevel] = useState<number | null>(null);
  // A level that rose between two reads of the player counts too (home treats add XP with no level line).
  const { player } = useContext(AuthContext);
  const playerLevel = player?.experience_level?.level ?? null;
  useEffect(() => { notePlayerLevel(player?.id ?? null, playerLevel); }, [player?.id, playerLevel]);
  useEffect(() => onLevelUp(() => {
    const next = takeLevelMoment();
    if (next) setLevel(current => Math.max(current ?? 0, next));
  }), []);
  useEffect(() => {
    if (!level || sheetUp) return undefined;
    const timer = setTimeout(() => {
      const chestWaits = retentionFlagsNow()?.levelChests === true && rungState('daily').open;
      showToast({ type: 'reward', icon: 'xp', message: levelUpLine(level, chestWaits), duration: 3200 });
      haptic('success');
      setLevel(null);
    }, LEVEL_UP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [level, sheetUp, showToast]);
  return null;
}
