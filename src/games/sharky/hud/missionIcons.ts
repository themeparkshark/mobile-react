/**
 * missionIcons: one picture per Sharky mission, so the results card shows
 * missions as picture plus bar (the words are spoken only). Sharky's own art
 * where a mission has a matching thing in the game, a GameIcon otherwise.
 */

import type { GameIconName } from '../../../ui/GameIcon';
import { SHARKY_ART } from '../assets';

export interface MissionIcon {
  art?: number;
  name?: GameIconName;
}

const ICONS: Record<string, MissionIcon> = {
  skim10: { art: SHARKY_ART.jelly },
  close5: { art: SHARKY_ART.puffer },
  perfect3: { art: SHARKY_ART.ring },
  frenzy1: { art: SHARKY_ART.finBadge },
  tokens3: { art: SHARKY_ART.tokenGold },
  chomp5: { art: SHARKY_ART.prizeBox },
  score5000: { name: 'star' },
  gates3: { art: SHARKY_ART.tideGate },
  coins60: { art: SHARKY_ART.coin },
  overdrive3: { name: 'rush' },
  clean: { name: 'heart' },
};

export function missionIcon(id: string): MissionIcon {
  return ICONS[id] ?? { name: 'star' };
}
