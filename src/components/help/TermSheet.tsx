import { useEffect, useState } from 'react';
import { balanceLine, type GlossaryKey, type GlossaryTerm } from '../../services/help/glossary';
import HelpSheet, { type HelpSheetContent } from './HelpSheet';

/** The word's sheet: its art and your count up top, then what it does and how to get it. */
export function termSheetContent(term: GlossaryTerm, count?: number | null): HelpSheetContent {
  const balance = balanceLine(term, count);
  return {
    id: `term:${term.key}`,
    name: term.label,
    pages: [{
      key: 'term', hero: 'term', headline: term.label,
      heroData: { icon: term.icon, caption: balance ? balance.replace(/\.$/, '') : null },
      points: [
        { icon: term.icon, text: term.what },
        { icon: 'gift', text: term.earn },
      ],
    }],
  };
}

/**
 * "What's this?" for one term (tap a currency, badge or game word). Same
 * HelpSheet as every "?" in the app.
 */
export default function TermSheet({ visible, term, count, onClose, onOpenGuide }: {
  readonly visible: boolean;
  readonly term: GlossaryTerm | null;
  readonly count?: number | null;
  readonly glossary?: Readonly<Record<GlossaryKey, GlossaryTerm>>;
  readonly onOpenTerm?: (key: GlossaryKey) => void;
  readonly onOpenGuide?: () => void;
  readonly onClose: () => void;
}) {
  // Keep the last word on screen while the sheet slides away.
  const [shown, setShown] = useState<{ term: GlossaryTerm; count: number | null } | null>(term ? { term, count: count ?? null } : null);
  useEffect(() => { if (term) setShown({ term, count: count ?? null }); }, [term, count]);
  return (
    <HelpSheet visible={visible && !!term} sheet={shown ? termSheetContent(shown.term, shown.count) : null} onClose={onClose}
      more={onOpenGuide ? { label: 'How to play', onPress: onOpenGuide } : undefined} />
  );
}
