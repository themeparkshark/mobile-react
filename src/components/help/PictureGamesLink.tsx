import { useContext } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { usePlayPrefs } from '../../services/playPrefs';
import { GameButton } from '../../ui';

/** The words of the Welcome link (fix round w4 T038), kept here so a test reads them. */
export const PICTURE_LINK_COPY = {
  off: 'Little one playing? Picture games',
  on: 'Picture games on',
  hintOff: 'Ride tries deal picture games, never reading trivia',
  hintOn: 'Ride tries deal picture games. Tap to turn off',
} as const;

/**
 * A small grown-up link on Welcome (T038): a family with a child who cannot read yet turns Picture games
 * on before the first ride try, so the very first game is Whack-a-Shark or Memory Match, never reading
 * trivia. The same setting as Settings and the Beat the Buzzer card (a choice, so a default never undoes
 * it). Hidden while the server's picture_games switch is off.
 */
export default function PictureGamesLink() {
  const { player } = useContext(AuthContext);
  const play = usePlayPrefs(player?.id ?? null);
  if (!play.available || player?.id == null) return null;
  const on = play.prefs.pictureOnly;
  return (
    <GameButton label={on ? PICTURE_LINK_COPY.on : PICTURE_LINK_COPY.off} variant="ghost" tone="onBlue" fullWidth={false}
      icon={on ? 'check' : 'shark'} onPress={() => play.setPictureOnly(!on)}
      accessibilityHint={on ? PICTURE_LINK_COPY.hintOn : PICTURE_LINK_COPY.hintOff} testID="welcome-picture-games" />
  );
}
