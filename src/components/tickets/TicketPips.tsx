/**
 * TicketPips (T1, arcade plan Nov 20 2026): a ride's price as 1 to 3 of Alex's Ticket pictures.
 * Filled for Tickets held, outlined for Tickets short. Same look at every price: no glow,
 * no sparkle, no color change by price. Sizes: island (under a map coin), card (coin card),
 * button (on PLAY! and TRY AGAIN). A missing price draws nothing.
 */
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND, FONT } from '../../ui/tokens';
import { TICKET_ART_RATIO, TICKET_PIP_WIDTH, ticketPipsModel, type TicketPipSize } from './ticketPipsModel';

export const TICKET_ART = require('../../../assets/images/ticket-icon.png');

export type TicketPipsProps = {
  /** The served price (task.ticket_cost). Missing hides the pips. */
  readonly price: unknown;
  /** Tickets the player holds. Unknown draws every pip filled. */
  readonly held?: number | null;
  readonly size?: TicketPipSize;
  /** Adds the number beside the pictures, for grown-ups (card size). */
  readonly showNumber?: boolean;
  /** Text color for the number on dark or blue grounds. */
  readonly tone?: 'onLight' | 'onDark';
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export default function TicketPips({ price, held, size = 'card', showNumber = false, tone = 'onLight', style, testID }: TicketPipsProps) {
  const model = ticketPipsModel(price, held);
  if (!model) return null;
  const width = TICKET_PIP_WIDTH[size];
  const height = Math.round(width * TICKET_ART_RATIO);
  const gap = size === 'island' ? 1 : size === 'button' ? 2 : 4;
  // The outline is Alex's own Ticket shape: a navy silhouette with a pale fill inset inside it.
  const inset = size === 'island' ? 1.5 : 2;
  return <View testID={testID} style={[styles.row, { gap }, style]} accessible accessibilityRole="text"
    accessibilityLabel={model.label} pointerEvents="none">
    {model.pips.map(pip => <View key={pip.key} style={{ width, height }}>
      {pip.filled
        ? <Image source={TICKET_ART} style={{ width, height }} resizeMode="contain" />
        : <>
          <Image source={TICKET_ART} style={[styles.abs, { width, height, tintColor: BRAND.navy }]} resizeMode="contain" />
          <Image source={TICKET_ART} style={[styles.abs, { left: inset, top: inset, width: width - inset * 2,
            height: height - inset * 2, tintColor: BRAND.cream, opacity: 0.92 }]} resizeMode="contain" />
        </>}
    </View>)}
    {showNumber ? <Text maxFontSizeMultiplier={1.3}
      style={[styles.number, size === 'island' ? styles.numberSmall : null, tone === 'onDark' ? styles.numberOnDark : null]}>
      {model.held == null || model.canPay ? `${model.price}` : `${model.held} of ${model.price}`}
    </Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  abs: { position: 'absolute', left: 0, top: 0 },
  number: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy, marginLeft: 4 },
  numberSmall: { fontSize: 11, marginLeft: 2 },
  numberOnDark: { color: BRAND.white },
});
