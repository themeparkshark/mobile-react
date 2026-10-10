/**
 * Event art by the server's art_key. Alex-style art made with GPT Image via
 * Codex (director/art/ART_QA.md). An unknown key falls back to the Golden Reef
 * set, so a new event with new art never shows a blank.
 */
export type EventArt = { readonly emblem: number; readonly chestClosed: number; readonly chestOpen: number };

const GOLDEN_REEF: EventArt = {
  emblem: require('../../../assets/images/events/golden-reef-emblem.webp'),
  chestClosed: require('../../../assets/images/events/reef-chest-closed.webp'),
  chestOpen: require('../../../assets/images/events/reef-chest-open.webp'),
};

const ART: Record<string, EventArt> = { golden_reef: GOLDEN_REEF };

export function eventArt(key: string | null | undefined): EventArt {
  return (key && ART[key]) || GOLDEN_REEF;
}

/** Event colours: the server may tint an event; Golden Reef is the house blue and gold. */
export function eventColors(theme: { primary?: string; accent?: string; deep?: string } | null | undefined) {
  return {
    primary: theme?.primary ?? '#0b7fd1',
    accent: theme?.accent ?? '#ffc629',
    deep: theme?.deep ?? '#05346e',
  };
}
