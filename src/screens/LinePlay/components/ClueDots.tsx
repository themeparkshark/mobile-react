/**
 * The chapter's 3 clues as 3 mini bubbles: the one a kid is on is gold, a done
 * one shows a check, the rest are plain blue. The same look as the chapter
 * page's 1 2 3 bubbles, so the clue count reads one way on every screen (no
 * "CLUE 1/3" text next to bubbles).
 */
import { StyleSheet, Text, View } from 'react-native';
import { BRAND, GameIcon } from '../../../ui';

interface Props {
  /** One entry per clue: true once that clue is done. */
  readonly done: readonly boolean[];
  /** The clue on screen now (0 based), or -1 for none. */
  readonly current: number;
  /** Bubble size in points. */
  readonly size?: number;
  readonly accessibilityLabel?: string;
  /**
   * Drawn on a gold strip (the iPhone SE PLAY strip): the bubbles sit on a small navy capsule and
   * the current one gets a white ring, so "you are here" reads at arm's length, not gold on gold.
   */
  readonly onGold?: boolean;
}

export default function ClueDots({ done, current, size = 20, accessibilityLabel, onGold = false }: Props) {
  return <View style={[styles.row, onGold && styles.capsule]} accessible accessibilityRole="text"
    accessibilityLabel={accessibilityLabel ?? `${done.filter(Boolean).length} of ${done.length} clues done`}>
    {done.map((complete, index) => {
      const now = index === current;
      return <View key={index} style={[styles.dot, { width: size, height: size, borderRadius: size / 2 },
        now && styles.dotNow, now && onGold && styles.dotNowOnGold, complete && !now && styles.dotDone]}>
        {complete ? <GameIcon name="check" size={Math.round(size * 0.7)} />
          : <Text style={[styles.number, { fontSize: Math.round(size * 0.55) }, now && styles.numberNow]}>{index + 1}</Text>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.blueBright,
    borderWidth: 2, borderColor: BRAND.navy },
  capsule: { alignSelf: 'flex-start', backgroundColor: BRAND.navy, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 2 },
  dotNow: { backgroundColor: BRAND.gold },
  dotNowOnGold: { borderColor: '#ffffff' },
  dotDone: { backgroundColor: '#ffffff' },
  number: { color: '#ffffff', fontFamily: 'Shark', marginTop: 1 },
  numberNow: { color: BRAND.navy },
});
