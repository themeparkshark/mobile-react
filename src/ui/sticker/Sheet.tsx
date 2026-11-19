/**
 * Sheet: a floating Page with Alex's ribbon title on its top edge, cream cards inside, and the wave
 * foot that always holds the way out (DIRECTION.md kit: Sheet; kit.png "Sheet and dialog").
 * Drawn by the one LayerHost, queued behind any layer before it, stuck on when it arrives, peeled
 * off when it leaves. Its body scrolls when it is taller than the room; the foot never moves.
 *
 *   <Sheet visible={open} title="REWARDS" wayOut={{ label: 'BACK TO MAP', art: 'back', onPress: close }}>...</Sheet>
 */
import { memo, type ReactNode } from 'react';
import GhostButton from './GhostButton';
import { useLayer } from './Overlay';
import Page from './Page';

export type WayOut = {
  /** The ghost words in the wave foot ("BACK TO MAP", "Not now"). */
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  /** Alex's arrow before the words (a way back). */
  readonly art?: 'back';
};

export type SheetProps = {
  readonly visible: boolean;
  /** The ribbon's words (short: they shrink to fit one line). */
  readonly title: string;
  readonly wayOut: WayOut;
  /** In the wave foot instead of the ghost way out (a price, the main action); the way out still answers the scrim, escape and back. */
  readonly foot?: ReactNode;
  /** A scrim tap takes the way out (default true). */
  readonly dismissible?: boolean;
  readonly testID?: string;
  readonly children: ReactNode;
};

export const SheetBody = memo(function SheetBody({ title, wayOut, foot, children }: Pick<SheetProps, 'title' | 'wayOut' | 'foot' | 'children'>) {
  return (
    <Page floating arrive scroll ribbon={{ text: title, kind: 'page' }}
      foot={{ children: foot ?? <GhostButton label={wayOut.label} accessibilityLabel={wayOut.accessibilityLabel} size="large" art={wayOut.art} onPress={wayOut.onPress} /> }}>
      {children}
    </Page>
  );
});

function SheetImpl({ visible, title, wayOut, foot, dismissible = true, testID, children }: SheetProps) {
  useLayer(visible, <SheetBody title={title} wayOut={wayOut} foot={foot}>{children}</SheetBody>, { wayOut: wayOut.onPress, dismissible, testID });
  return null;
}

const Sheet = memo(SheetImpl);
export default Sheet;
