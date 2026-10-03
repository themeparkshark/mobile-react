/**
 * The profile's one event trophy chip (fright-nights/CONTRACT.md section 5).
 *
 * Wired to the Fin-ister Nights `FrightCardChip` (src/components/fright).
 * It fetches GET /fright/cards for this player, renders nothing when the list
 * is empty or the endpoint is missing, and opens the read-only FrightCard
 * screen (works on friends' profiles), so the profile never shows a dead chip.
 */
import { FrightCardChip } from '../fright';

export default function ProfileEventChip({ playerId }: { readonly playerId?: number | null }) {
  return <FrightCardChip playerId={playerId} />;
}
