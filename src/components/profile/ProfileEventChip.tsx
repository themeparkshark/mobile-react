/**
 * The profile's one event trophy chip (fright-nights/CONTRACT.md section 5).
 *
 * The chip itself belongs to the Fin-ister Nights lead: `FrightCardChip`
 * from src/components/fright (branch claude/fright-nights). It fetches
 * GET /fright/cards for this player, renders nothing when the list is empty
 * or the endpoint is missing, and opens the read-only FrightCard screen
 * (works on friends' profiles).
 *
 * MERGE STEP (one line, when claude/fright-nights and claude/profile-v2 meet):
 *   replace the body below with
 *     import { FrightCardChip } from '../fright';
 *     export default function ProfileEventChip({ playerId }: { readonly playerId?: number | null }) {
 *       return <FrightCardChip playerId={playerId} />;
 *     }
 * Until then the slot renders nothing, so the profile never shows a dead chip.
 */
export default function ProfileEventChip(_props: { readonly playerId?: number | null }) {
  return null;
}
