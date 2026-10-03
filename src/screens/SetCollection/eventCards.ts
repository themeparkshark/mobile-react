/**
 * Events in the collection book (fright-nights CONTRACT section 6): one
 * set card per yearly event card the player has earned anything on, placed
 * after the Home Hunt sets. Tapping it opens the fright app's
 * FrightCardScreen (route "FrightCard"); the book never re-implements the
 * yearly card.
 *
 * Every name comes from the server (`card_title`, `title`). A missing
 * endpoint (404, older server) or an empty list means no Events card at all.
 * Pure parsing lives here so it is unit tested without the network.
 */
import client from '../../api/client';

export interface EventCard {
  readonly eventSlug: string;
  readonly title: string;
  readonly cardTitle: string;
  readonly parkName: string;
  readonly art: string | null;
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
  /** Every haunt in one night: a gold rim. */
  readonly tenInOne: boolean;
  readonly year: number;
}

export interface EventShelf {
  readonly cards: readonly EventCard[];
  /** Lifetime haunts survived across every year and both coasts. */
  readonly lifetimeHaunts: number;
}

const EMPTY: EventShelf = { cards: [], lifetimeHaunts: 0 };
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function parseEventShelf(payload: unknown): EventShelf {
  const body = payload && typeof payload === 'object' ? payload as { data?: unknown; lifetime?: { haunts_survived?: unknown } } : null;
  if (!body || !Array.isArray(body.data)) return EMPTY;
  const cards = body.data.flatMap(raw => {
    const card = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    const slug = str(card?.event_slug);
    const cardTitle = str(card?.card_title);
    if (!card || !slug || !cardTitle) return [];
    const art = card.art && typeof card.art === 'object' ? str((card.art as { card?: unknown }).card) : null;
    return [{
      eventSlug: slug, cardTitle, title: str(card.title) ?? cardTitle, parkName: str(card.park_name) ?? '', art,
      done: num(card.haunts_done), total: num(card.haunts_total), complete: card.completed === true,
      tenInOne: card.ten_in_one === true, year: num(card.year),
    }];
  });
  // Newest year first; the row grows as future events arrive.
  cards.sort((a, b) => b.year - a.year || a.cardTitle.localeCompare(b.cardTitle));
  return { cards, lifetimeHaunts: num(body.lifetime?.haunts_survived) };
}

let unsupported = false;

/** GET /fright/cards. Never throws; a server without the endpoint means no Events cards this session. */
export async function getEventShelf(): Promise<EventShelf> {
  if (unsupported) return EMPTY;
  try {
    const { data } = await client.get('/fright/cards', { timeout: 8000 });
    return parseEventShelf(data);
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) unsupported = true;
    return EMPTY;
  }
}
