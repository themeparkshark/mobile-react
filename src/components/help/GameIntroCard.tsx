import { Image } from 'expo-image';
import { useContext } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { GAME_INTROS, type MiniGameKind } from '../../services/help/helpTopics';
import { usePlayPrefs } from '../../services/playPrefs';
import { AuthContext } from '../../context/AuthProvider';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, type GameIconName } from '../../ui';

const ART = {
  shark: require('../../assets/games/whack/themes/park/pop.png'),
  angler: require('../../assets/games/whack/v2/angler.png'),
  cardBack: require('../../assets/games/memory/card-back.png'),
  cardShark: require('../../assets/games/memory/deck-ocean-shark.png'),
  bell: require('../../assets/games/trivia-duel/desk_bell.png'),
  basket: require('../../assets/games/banana-basket/v2/basket.png'),
  banana: require('../../assets/games/banana-basket/v2/banana.png'),
  ball: require('../../assets/games/banana-basket/v2/ball.png'),
  swimmer: require('../../assets/games/sharky/shark-swim-1.png'),
  quester: require('../../assets/games/current-quest/cq_shark_idle_swim.png'),
  chest: require('../../assets/games/current-quest/chest_closed.png'),
  drum: require('../../assets/games/rhythm/parade_drum.png'),
  note: require('../../assets/games/rhythm/note_drum.png'),
  /** The tap hand players already see on the map's prep items and in Parade Beat itself. */
  hand: require('../../../assets/images/ride-photo/tap-hand.webp'),
  /** A question bubble (the Community Center's "?"): "questions to read", on the Trivia strip and its toggle. */
  question: require('../../../assets/images/screens/community-center-question.png'),
} as const;

/**
 * One picture on the how-to strip: art (or an icon), with a check, a cross or nothing on its corner.
 * `line` draws Parade Beat's gold hit line across it, `tap` puts the tap hand on it, `hold` shows the
 * hand pressed down (a gold ring under the fingertip) and `up` an arrow pointing up beside the art.
 */
interface Pic {
  readonly art?: ImageSourcePropType; readonly icon?: GameIconName; readonly mark?: 'check' | 'close'; readonly wide?: boolean;
  readonly line?: boolean; readonly tap?: boolean; readonly hold?: boolean; readonly up?: boolean;
}
/** A step is one or two pictures; steps are joined by arrows. */
type Step = readonly Pic[];

/**
 * The picture row for each game: what to tap and what never to tap, before a
 * single word (blueprint 5.3: a 7-year-old understands with zero reading).
 * Only existing game art and Alex's icons, no new art.
 */
export const INTRO_PICTURES: Readonly<Record<MiniGameKind, readonly Step[]>> = {
  tap: [[{ art: ART.shark, mark: 'check' }], [{ art: ART.angler, mark: 'close' }]],
  memory: [[{ art: ART.cardBack }, { art: ART.cardBack }], [{ art: ART.cardShark }, { art: ART.cardShark, mark: 'check' }]],
  // Beat the Buzzer: a question, then the hand tapping the desk bell (read, then buzz in with the answer).
  trivia: [[{ art: ART.question }], [{ art: ART.bell, tap: true, mark: 'check' }]],
  // The ball is bounced, not dodged: it wears a check too, so a kid never steers away from it.
  banana: [[{ art: ART.basket }, { art: ART.banana, mark: 'check' }], [{ art: ART.ball, mark: 'check' }]],
  // Sharky Swim: the hand held down, then the shark rising (hold to swim up).
  shark: [[{ art: ART.hand, hold: true }], [{ art: ART.swimmer, up: true, mark: 'check' }]],
  current: [[{ art: ART.quester }], [{ art: ART.chest, mark: 'check' }]],
  // Parade Beat: a note on the gold line, then the hand tapping the drum (tap when the note hits the line).
  timing: [[{ art: ART.note, line: true }], [{ art: ART.drum, tap: true, mark: 'check' }]],
  photo: [[{ icon: 'camera', mark: 'check' }]],
};

function Picture({ pic }: { readonly pic: Pic }) {
  return (
    <View style={styles.pic}>
      {pic.line && <View style={styles.hitLine} />}
      {pic.hold && <View style={styles.holdRing} />}
      {pic.art ? <Image source={pic.art} style={[styles.picArt, pic.line && styles.onLine, pic.hold && styles.held]} contentFit="contain" />
        : pic.icon ? <GameIcon name={pic.icon} size={46} /> : null}
      {pic.tap && <Image source={ART.hand} style={styles.tapHand} contentFit="contain" />}
      {pic.up && <View style={styles.upArrow}><GameIcon name="arrow" size={24} /></View>}
      {pic.mark && <View style={[styles.mark, pic.mark === 'close' && styles.markNo]}>
        <GameIcon name={pic.mark} size={22} />
      </View>}
    </View>
  );
}

/**
 * Games whose pictures are a "do this, never that" pair, not steps in order: they sit side by side
 * with a gap, because an arrow from the shark to the anglerfish reads as "the shark turns into it".
 */
export const SIDE_BY_SIDE: ReadonlySet<MiniGameKind> = new Set<MiniGameKind>(['tap']);

export function IntroPictures({ kind }: { readonly kind: MiniGameKind }) {
  const steps = INTRO_PICTURES[kind] ?? [];
  const pair = SIDE_BY_SIDE.has(kind);
  return (
    <View style={styles.strip} accessible={false} importantForAccessibility="no-hide-descendants">
      {steps.map((step, i) => (
        <View key={i} style={styles.step}>
          {i > 0 && (pair ? <View style={styles.pairGap} /> : <View style={styles.arrow}><GameIcon name="arrow" size={22} /></View>)}
          {step.map((pic, j) => <Picture key={j} pic={pic} />)}
        </View>
      ))}
    </View>
  );
}

/**
 * How to play one mini-game, shown once per game type before it starts.
 * Pictures first (shark with a check, anglerfish with a cross), then one short
 * line. The game has not started yet, so nothing is interrupted; the timer
 * only begins after Play. The Trivia card offers "Can't read yet? Picture
 * games" (a question bubble with a cross, then the shark) whenever the server deals
 * picture games: it turns on Picture games only for this player.
 */
export default function GameIntroCard({ kind, onStart, name, win }: {
  readonly kind: MiniGameKind;
  readonly onStart: () => void;
  /** The game's name where it differs by place (the paid trivia game is Beat the Buzzer). */
  readonly name?: string;
  /** The win line where it differs by place (a paid ride: "2 right answers win the coin."). */
  readonly win?: string;
}) {
  const reduced = useReducedGameMotion();
  const intro = GAME_INTROS[kind];
  const { player } = useContext(AuthContext);
  const play = usePlayPrefs(player?.id ?? null);
  const offerPictures = kind === 'trivia' && play.available;
  return (
    <View style={styles.fill} accessibilityViewIsModal>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={styles.card}>
        <Text style={styles.kicker}>HOW TO PLAY</Text>
        <Text accessibilityRole="header" style={styles.title}>{name ?? intro.name}</Text>
        <IntroPictures kind={kind} />
        <Text style={styles.body} accessibilityLabel={`${intro.how} ${win ?? intro.win}`}>{intro.how}</Text>
        <Text style={styles.win} importantForAccessibility="no">{win ?? intro.win}</Text>
        {offerPictures && (
          <Pressable onPress={() => play.setPictureOnly(!play.prefs.pictureOnly)} accessibilityRole="switch"
            accessibilityState={{ checked: play.prefs.pictureOnly }}
            accessibilityLabel="Can't read yet? Picture games only. Your next tries deal picture games, never trivia."
            style={({ pressed }) => [styles.pictureToggle, play.prefs.pictureOnly && styles.pictureOn, pressed && styles.pressed]}>
            <View style={styles.toggleArt}>
              <Picture pic={{ art: ART.question, mark: 'close' }} />
              <GameIcon name="arrow" size={18} />
              <Picture pic={{ art: ART.shark, mark: 'check' }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Can't read yet?</Text>
              <Text style={styles.toggleLine}>{play.prefs.pictureOnly ? 'Picture games: on. Next try is a picture game.' : 'Picture games'}</Text>
            </View>
            <GameIcon name={play.prefs.pictureOnly ? 'check' : 'arrow'} size={24} />
          </Pressable>
        )}
        <GameButton label="Play" icon="play" onPress={onStart} accessibilityHint="Starts the game and its timer" />
      </Animated.View>
    </View>
  );
}

const PIC = 64;
const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: BRAND.scrim },
  card: {
    width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.xl,
    borderWidth: 4, borderColor: BRAND.white, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, ...SHADOW.card,
  },
  kicker: { fontFamily: 'Knockout', fontSize: 14, letterSpacing: 1.2, color: BRAND.navySoft },
  title: { fontFamily: 'Shark', fontSize: 30, color: BRAND.navy, textAlign: 'center', marginBottom: 6 },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10,
    backgroundColor: BRAND.white, borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 10, alignSelf: 'stretch' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { marginHorizontal: 4 },
  pairGap: { width: 28 },
  pic: { width: PIC, height: PIC, alignItems: 'center', justifyContent: 'center' },
  picArt: { width: PIC, height: PIC },
  mark: { position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.green, alignItems: 'center', justifyContent: 'center' },
  markNo: { borderColor: BRAND.red },
  hitLine: { position: 'absolute', left: -6, right: -6, top: PIC / 2 - 3, height: 6, borderRadius: 3, backgroundColor: BRAND.gold },
  onLine: { width: PIC * 0.8, height: PIC * 0.8 },
  holdRing: { position: 'absolute', bottom: 0, width: 34, height: 34, borderRadius: 17, borderWidth: 4, borderColor: BRAND.gold,
    backgroundColor: '#fff4cc' },
  held: { width: PIC * 0.9, height: PIC * 0.9, marginTop: -10 },
  tapHand: { position: 'absolute', width: 34, height: 34, top: -10, left: -6 },
  upArrow: { position: 'absolute', left: -12, top: 18, transform: [{ rotate: '-90deg' }] },
  body: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navy, textAlign: 'center' },
  win: { fontFamily: 'Knockout', fontSize: 16, lineHeight: 21, color: BRAND.blue, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  pictureToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginBottom: 12,
    backgroundColor: BRAND.white, borderRadius: RADIUS.lg, borderWidth: 3, borderColor: BRAND.sky, paddingVertical: 6, paddingHorizontal: 8 },
  pictureOn: { borderColor: BRAND.gold, backgroundColor: '#fff4cc' },
  pressed: { transform: [{ scale: 0.98 }] },
  toggleArt: { flexDirection: 'row', alignItems: 'center', transform: [{ scale: 0.7 }], marginHorizontal: -14 },
  toggleTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  toggleLine: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
});
