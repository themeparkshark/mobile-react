import { useEffect, useState } from 'react';
import { balanceLine, LOCAL_GLOSSARY, type GlossaryKey, type GlossaryTerm } from '../../services/help/glossary';
import { HELP_LIMITS, wordCount } from '../../services/help/helpSheets';
import HelpSheet, { type HelpSheetContent } from './HelpSheet';

/** Words whose sheet links to Supplies (the money stream's ask). */
export const GET_MORE_KEYS: readonly GlossaryKey[] = ['coins', 'tickets'];

/** A server line only when it is as short as the sheet's rule; otherwise the local line. */
function brief(line: string, local: string, key: GlossaryKey): string {
  // The Coins you spend are not the ride coins you collect: never let a server line mix them up.
  if (key === 'coins' && /ride coin/i.test(line)) return local;
  return wordCount(line) <= HELP_LIMITS.pointWords ? line : local;
}

/** The word's sheet: its art and your count up top, then what it does and how to get it. */
export function termSheetContent(term: GlossaryTerm, count?: number | null): HelpSheetContent {
  const balance = balanceLine(term, count);
  const local = LOCAL_GLOSSARY[term.key] ?? term;
  return {
    id: `term:${term.key}`,
    name: term.label,
    pages: [{
      key: 'term', hero: 'term', headline: term.label,
      heroData: { icon: term.icon, caption: balance && (count ?? 0) > 0 ? balance.replace(/\.$/, '') : null },
      points: [
        { icon: term.icon, text: brief(term.what, local.what, term.key) },
        { icon: 'gift', text: brief(term.earn, local.earn, term.key) },
      ],
    }],
  };
}

/**
 * "What's this?" for one term (tap a currency, badge or game word). Same
 * HelpSheet as every "?" in the app.
 */
export default function TermSheet({ visible, term, count, onClose, onOpenGuide, onGetMore }: {
  readonly visible: boolean;
  readonly term: GlossaryTerm | null;
  readonly count?: number | null;
  readonly glossary?: Readonly<Record<GlossaryKey, GlossaryTerm>>;
  readonly onOpenTerm?: (key: GlossaryKey) => void;
  readonly onOpenGuide?: () => void;
  /** Coins and Tickets: open Supplies at that pack (only when the store can sell). */
  readonly onGetMore?: (key: GlossaryKey) => void;
  readonly onClose: () => void;
}) {
  // Keep the last word on screen while the sheet slides away.
  const [shown, setShown] = useState<{ term: GlossaryTerm; count: number | null } | null>(term ? { term, count: count ?? null } : null);
  useEffect(() => { if (term) setShown({ term, count: count ?? null }); }, [term, count]);
  return (
    <HelpSheet visible={visible && !!term} sheet={shown ? termSheetContent(shown.term, shown.count) : null} onClose={onClose}
      links={[
        ...(onGetMore && shown && GET_MORE_KEYS.includes(shown.term.key) ? [{ label: 'Get more', onPress: () => onGetMore(shown.term.key) }] : []),
        ...(onOpenGuide ? [{ label: 'How to play', onPress: onOpenGuide }] : []),
      ]} />
  );
}
