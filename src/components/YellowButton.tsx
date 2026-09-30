import GameButton from '../ui/GameButton';
import type { GameIconName } from '../ui/iconNames';

/**
 * Legacy name for the primary gold call to action. Now renders GameButton
 * (58pt, Shark 24 fixed, 4pt lip, press collapse, haptic) instead of the old
 * image button with 72pt shrink-to-fit text. Prefer GameButton in new code.
 */
export default function YellowButton({
  disabled = false,
  text,
  onPress,
  icon,
  loading,
}: {
  readonly disabled?: boolean;
  readonly text: string;
  readonly onPress?: () => void;
  readonly icon?: GameIconName;
  readonly loading?: boolean;
}) {
  return <GameButton label={text} onPress={onPress} disabled={disabled} icon={icon} loading={loading} />;
}
