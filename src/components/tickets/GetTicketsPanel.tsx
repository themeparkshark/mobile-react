/**
 * Get Tickets (T7, arcade plan Nov 20 2026): the same panel wherever a player is short (PLAY!, TRY AGAIN).
 * The price as Ticket pictures and "You have 1 of 3", then only the rows that work right now, each a
 * picture, a few words and one button. Ends with "Tomorrow at any park: +3". No countdown, no red,
 * no pack art; the grown-up row asks the grown-up gate before Supplies opens.
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { withNumberFont } from '../../ui/numberText';
import TicketPips from './TicketPips';
import type { GetTicketsRow, GetTicketsRowKind } from './getTicketsModel';

const ROW_ICON: Readonly<Record<GetTicketsRowKind, GameIconName>> = {
  claim: 'star', line: 'line', trail: 'gift', near: 'coin', pick: 'heart', grownups: 'lock',
};

export default function GetTicketsPanel({ price, tickets, have, rows, footer, busy, onRow, coinUri, saved }: {
  readonly price: number | null;
  readonly tickets: number;
  readonly have: string;
  readonly rows: readonly GetTicketsRow[];
  readonly footer: string | null;
  /** A row is working (claiming): its button waits. */
  readonly busy?: GetTicketsRowKind | null;
  readonly onRow: (kind: GetTicketsRowKind) => void;
  /** The coin this card is about, beside the price (when the big coin picture gives its room to the rows). */
  readonly coinUri?: string | null;
  /** P14: this coin's saved Parts line ("9 Parts saved. Win it to grow it."), from the server only. */
  readonly saved?: string | null;
}) {
  return <View style={styles.panel} testID="get-tickets">
    <View style={styles.head}>
      <Text style={styles.title}>GET TICKETS</Text>
      <View style={styles.price}>
        {coinUri ? <Image source={{ uri: coinUri }} style={styles.coin} contentFit="contain" /> : null}
        <TicketPips price={price} held={tickets} size="button" />
        <Text style={styles.have}>{withNumberFont(have)}</Text>
      </View>
      {saved ? <View style={styles.saved} accessible accessibilityLabel={saved}>
        <GameIcon name="parts" size={20} /><Text style={styles.savedText}>{withNumberFont(saved)}</Text>
      </View> : null}
    </View>
    {rows.map(row => <View key={row.kind} style={styles.row} accessible={!row.action} accessibilityLabel={row.action ? undefined : row.a11y}>
      <View style={styles.icon}><GameIcon name={ROW_ICON[row.kind]} size={26} /></View>
      <Text style={styles.rowText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{withNumberFont(row.text)}</Text>
      {row.action ? <Pressable accessibilityRole="button" accessibilityLabel={row.a11y} disabled={busy === row.kind}
        onPress={() => onRow(row.kind)} hitSlop={6}
        style={({ pressed }) => [styles.btn, row.kind === 'grownups' && styles.btnQuiet, (pressed || busy === row.kind) && styles.pressed]}>
        <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{busy === row.kind ? '...' : row.action}</Text>
      </Pressable> : null}
    </View>)}
    {footer ? <View style={styles.footer} accessible accessibilityLabel={footer}>
      <GameIcon name="moon" size={20} />
      <Text style={styles.footerText}>{withNumberFont(footer)}</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy,
    padding: 10, gap: 6, marginTop: 6 },
  head: { alignItems: 'center', gap: 2 },
  title: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  price: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coin: { width: 40, height: 40 },
  have: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedText: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.white, borderRadius: 14, borderWidth: 2.5,
    borderColor: BRAND.navy, paddingVertical: 4, paddingHorizontal: 8, minHeight: 46 },
  icon: { width: 30, alignItems: 'center' },
  rowText: { flex: 1, fontFamily: FONT.body, fontSize: 16, lineHeight: 19, color: BRAND.navy },
  btn: { backgroundColor: BRAND.gold, borderRadius: 11, borderWidth: 2.5, borderColor: BRAND.navy, borderBottomWidth: 4,
    paddingHorizontal: 10, paddingVertical: 5, maxWidth: 170, minHeight: 38, justifyContent: 'center' },
  btnQuiet: { backgroundColor: BRAND.sky },
  btnText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  pressed: { opacity: 0.7 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  footerText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
});
