/**
 * The loss card's buttons (T4, arcade plan Nov 20 2026): TRY AGAIN with the price as Ticket pictures and
 * BACK TO MAP, the same size side by side. The soft stop (2 losses here today) makes BACK TO MAP the big
 * button and TRY AGAIN a small link. "Practice this game free" is a quiet link under them.
 */
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TicketPips from './TicketPips';
import { BRAND, FONT } from '../../ui/tokens';
/** The same words as every other card's map button. */
const BACK_TO_MAP = 'Back to Map';

export interface LossActionsProps {
  readonly armed: boolean;
  /** The price TRY AGAIN shows (null on today's server's free retry: no pictures). */
  readonly price: number | null;
  readonly held: number;
  readonly short: boolean;
  readonly soft: boolean;
  /** TRY AGAIN cannot start yet (finding the player). */
  readonly retryBusy?: boolean;
  readonly onRetry: () => void;
  readonly onMap: () => void;
  readonly practiceLabel?: string | null;
  readonly onPractice?: () => void;
}

export default function LossActions({ armed, price, held, short, soft, retryBusy = false, onRetry, onMap, practiceLabel, onPractice }: LossActionsProps) {
  const retryA11y = price == null ? 'Try again. No new Ticket.'
    : short ? `Try again costs ${price} Ticket${price === 1 ? '' : 's'}. You have ${held}. See ways to get Tickets.`
      : `Try again for ${price} Ticket${price === 1 ? '' : 's'}. You have ${held}.`;
  const retryDisabled = !armed || (retryBusy && !short);
  const pips = price == null ? null : <TicketPips price={price} held={held} size="button" />;
  return <View style={styles.wrap}>
    {soft ? <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={BACK_TO_MAP} disabled={!armed} onPress={onMap}
        style={[styles.btn, styles.gold, styles.full]}>
        <Text style={styles.goldText} numberOfLines={1} adjustsFontSizeToFit>{BACK_TO_MAP.toUpperCase()}</Text>
      </TouchableOpacity>
      <Pressable accessibilityRole="button" accessibilityLabel={retryA11y} disabled={retryDisabled} onPress={onRetry}
        hitSlop={10} style={({ pressed }) => [styles.link, (pressed || retryDisabled) && styles.dim]}>
        <Text style={styles.linkText}>Try again</Text>
        {pips}
      </Pressable>
    </> : <View style={styles.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={retryA11y} disabled={retryDisabled} onPress={onRetry}
        style={[styles.btn, styles.gold, styles.half, retryDisabled && styles.dim]}>
        <Text style={styles.goldText} numberOfLines={1} adjustsFontSizeToFit>TRY AGAIN</Text>
        {pips ? <View style={styles.pips}>{pips}</View> : null}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={BACK_TO_MAP} disabled={!armed} onPress={onMap}
        style={[styles.btn, styles.white, styles.half]}>
        <Text style={styles.whiteText} numberOfLines={2} adjustsFontSizeToFit>{BACK_TO_MAP.toUpperCase()}</Text>
      </TouchableOpacity>
    </View>}
    {practiceLabel && onPractice ? <Pressable accessibilityRole="button" accessibilityLabel={`${practiceLabel}. No Tickets.`}
      disabled={!armed} onPress={onPractice} hitSlop={10} style={({ pressed }) => [styles.link, pressed && styles.dim]}>
      <Text style={styles.practiceText}>{practiceLabel}</Text>
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', marginTop: 6 },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn: { minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: BRAND.navy,
    borderBottomWidth: 6, paddingHorizontal: 8, paddingVertical: 6 },
  half: { flex: 1 },
  full: { alignSelf: 'stretch' },
  gold: { backgroundColor: BRAND.gold },
  white: { backgroundColor: BRAND.white },
  goldText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy },
  whiteText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, textAlign: 'center' },
  pips: { marginTop: 3 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 6, paddingHorizontal: 12 },
  linkText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.white, textDecorationLine: 'underline' },
  practiceText: { fontFamily: FONT.body, fontSize: 16, color: BRAND.goldLight, textDecorationLine: 'underline' },
  dim: { opacity: 0.55 },
});
