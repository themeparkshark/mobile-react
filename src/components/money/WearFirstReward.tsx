/**
 * A reward card that asks "Wear it now" or "Not now" before it offers Share, so a kid who
 * taps Share first never loses the wear. Used by the Shark Pass reward card and its dev preview.
 * The order and words come from wearFirstButtons and wearFirstCaption (unit tested).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Playercard from '../Playercard';
import type { InventoryType } from '../../models/inventory-type';
import { BRAND } from '../../ui';
import { GotIt } from './moneyUi';
import { wearFirstButtons, wearFirstCaption, wearThenRefresh, type WearChoice } from '../../services/money/sharkPassModel';

/** The Wear button's icon on a Shark Pass reward: the kid's shark. */
export const WEAR_ICON = 'shark' as const;

export type WearAction = {
  readonly label: string;
  /** The save. Only this can fail (it times out after 8 s). */
  readonly run: () => Promise<unknown>;
  /** Fetch the fresh look after the save (raced, never a failure). */
  readonly refresh?: () => unknown;
};

export default function WearFirstReward({ title, picture, wornPicture, footer, caption, wear, frame = false, share, onDone, resetOn }: {
  readonly title: string;
  readonly picture: ReactNode;
  /** Once worn: the kid's shark wearing the piece (it pops in), so "wearing it now" is shown, not just said. */
  readonly wornPicture?: ReactNode;
  readonly footer?: ReactNode;
  /** The first line under the title (what the reward is). */
  readonly caption: string;
  readonly wear: WearAction;
  /** A profile frame says "Your frame shows on your profile now." when worn. */
  readonly frame?: boolean;
  /** The Share pill. It shows only after the choice; a function gets whether the piece is on. */
  readonly share?: ReactNode | ((worn: boolean) => ReactNode);
  /** Closes the card after the choice. */
  readonly onDone: () => void;
  /** A new reward on the same card starts the choice again. */
  readonly resetOn?: unknown;
}) {
  const [chosen, setChosen] = useState<WearChoice>(null);
  const live = useRef(true);
  const run = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { run.current += 1; setChosen(null); }, [resetOn]);

  const putOn = useCallback(() => {
    const mine = ++run.current;
    setChosen('saving');
    // Wait (a little) for the fresh look, so the share picture shows the shark wearing it. A slow
    // refresh never shows "That didn't work" for a wear that saved.
    // A save that lands after the 8 s timeout flips Try again to worn (only if nothing newer started).
    const late = () => { if (live.current && run.current === mine) setChosen(c => (c === 'failed' ? 'worn' : c)); };
    void wearThenRefresh(wear.run, wear.refresh, undefined, undefined, late)
      .then(result => { if (live.current && run.current === mine) setChosen(result); });
  }, [wear]);

  const b = wearFirstButtons(chosen);
  const shown = chosen === 'worn' && wornPicture ? <Animated.View entering={ZoomIn.springify().damping(12)}>{wornPicture}</Animated.View> : picture;
  const pill = typeof share === 'function' ? share(chosen === 'worn') : share;
  return (
    <GotIt grants={{}} art="gift" title={title} picture={shown} footer={chosen ? undefined : footer}
      caption={wearFirstCaption(chosen, caption, frame)}
      busyLabel={b.busy ? 'Putting it on...' : undefined} busyIcon={WEAR_ICON} wide
      // The shark icon says "put it on your shark" (the red map pin read as "go to the map").
      action={b.action ? { label: b.action === 'retry' ? 'Try again' : wear.label, icon: b.action === 'retry' ? 'retry' : WEAR_ICON, onPress: putOn } : undefined}
      doneLabel={b.doneLabel}
      onDone={b.doneKeeps ? () => setChosen('kept') : onDone}
      share={b.share ? pill : undefined} />
  );
}

/**
 * The worn picture: the kid's own shark wearing the new pin, with the pin's art as a small sticker
 * beside it (a pin is small on the shark; the sticker says which one just went on).
 */
export function WornLook({ inventory, art, still }: { readonly inventory: InventoryType; readonly art: number | string | null; readonly still?: boolean }) {
  return (
    <View style={worn.box}>
      <Playercard inventory={inventory} showBackground={false} pinAnchor="body" still={still} style={StyleSheet.absoluteFill} />
      {art != null && (
        <View style={worn.sticker}>
          <Image source={typeof art === 'string' ? { uri: art } : art} style={worn.art} contentFit="contain" />
        </View>
      )}
    </View>
  );
}

const worn = StyleSheet.create({
  box: { width: 210, height: 210 },
  sticker: {
    position: 'absolute', right: 0, bottom: 6, width: 66, height: 66, borderRadius: 33, backgroundColor: BRAND.white,
    borderWidth: 3, borderColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }],
  },
  art: { width: 50, height: 50 },
});
