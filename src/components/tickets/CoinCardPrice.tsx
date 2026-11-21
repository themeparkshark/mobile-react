/**
 * The coin card's arcade rows (T3, arcade plan Nov 20 2026): this ride's game, what a win and a loss pay,
 * the price as Ticket pictures with its number, and a limited coin's leave date. No reading needed: the
 * game's picture, the coin and Parts pictures, the Ticket pictures.
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { withNumberFont } from '../../ui/numberText';
import TicketPips from './TicketPips';
import type { CoinCardPrice as Model, DealtGame } from './coinCardPriceModel';

const GAME_ART: Readonly<Record<DealtGame, number>> = {
  tap: require('../../../assets/images/screens/lineplay/arcade/whack.png'),
  memory: require('../../../assets/images/screens/lineplay/arcade/memory.png'),
  trivia: require('../../../assets/images/screens/lineplay/arcade/trivia.png'),
};

export default function CoinCardPrice({ model, held, coinUri }: {
  readonly model: Model;
  readonly held: number;
  readonly coinUri?: string | null;
}) {
  return <View style={styles.wrap}>
    {model.game && <View style={styles.game} accessible accessibilityLabel={`This ride's game: ${model.game.name}`}>
      <Image source={GAME_ART[model.game.id]} style={styles.gameArt} contentFit="contain" />
      <View style={styles.gameWords}>
        <Text style={styles.kicker}>THIS RIDE'S GAME</Text>
        <Text style={styles.gameName} numberOfLines={1} adjustsFontSizeToFit>{model.game.name}</Text>
        {/* T9: Memory Match is one game of 3 boards: one board picture each, never "tries". */}
        {model.boards && <View style={styles.boards} accessible accessibilityLabel={model.boards.text}>
          {Array.from({ length: model.boards.count }, (_, i) => <Image key={i} source={GAME_ART[model.game!.id]} style={styles.board} contentFit="contain" />)}
          <Text style={styles.boardsText}>{withNumberFont(model.boards.text)}</Text>
        </View>}
      </View>
    </View>}
    <View style={styles.prizes}>
      <View style={[styles.prize, styles.win]} accessible accessibilityLabel={`Win: ${model.win.text}`}>
        <Text style={styles.prizeHead}>WIN</Text>
        <View style={styles.prizeArt}>
          {coinUri ? <Image source={{ uri: coinUri }} style={styles.coin} contentFit="contain" /> : <GameIcon name="coin" size={26} />}
          {model.win.parts ? <><GameIcon name="parts" size={22} /><Text style={styles.prizeNum}>{withNumberFont(`+${model.win.parts}`)}</Text></> : null}
        </View>
      </View>
      {model.lose && <View style={styles.prize} accessible accessibilityLabel={`Lose: ${model.lose.text}`}>
        <Text style={styles.prizeHead}>LOSE</Text>
        <View style={styles.prizeArt}>
          <GameIcon name="parts" size={22} /><Text style={styles.prizeNum}>{withNumberFont(`+${model.lose.parts}`)}</Text>
        </View>
      </View>}
    </View>
    {model.price != null && <View style={styles.price}>
      <TicketPips price={model.price} held={held} size="card" showNumber tone="onDark" />
    </View>}
    {model.leaves && <Text style={styles.leaves}>{withNumberFont(model.leaves)}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', gap: 8, marginTop: 8 },
  game: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', backgroundColor: BRAND.cream, borderRadius: 14,
    borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 4, paddingHorizontal: 8 },
  gameArt: { width: 46, height: 46 },
  gameWords: { flexShrink: 1 },
  kicker: { fontFamily: FONT.body, fontSize: 13, color: BRAND.navySoft, letterSpacing: 0.5 },
  gameName: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy },
  boards: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  board: { width: 20, height: 20 },
  boardsText: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft, marginLeft: 4 },
  prizes: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  prize: { flex: 1, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 3, borderColor: BRAND.navy,
    paddingVertical: 4 },
  win: { backgroundColor: BRAND.goldLight },
  prizeHead: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  prizeArt: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30 },
  coin: { width: 28, height: 28 },
  prizeNum: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  price: { alignItems: 'center' },
  leaves: { fontFamily: FONT.body, fontSize: 15, color: BRAND.white },
});
