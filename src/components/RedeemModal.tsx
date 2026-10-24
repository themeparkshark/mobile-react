import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { nearbyOpportunityOpen, nearbyRideClosedReason, type NearbyClosedReason } from '../screens/ExploreScreen/mapOpportunityTiming';
import { restingLabel } from '../screens/ExploreScreen/mapMarkerPresentation';
import type { GameIconName } from '../ui/iconNames';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import RedeemCurrentRedeemableModal from './RedeemCurrentRedeemableModel';
import RedeemKeyModal from './RedeemKeyModal';
import RedeemRedeemableModal from './RedeemRedeemableModal';
import RedeemVaultModal from './RedeemVaultModal';
import YellowButton from './YellowButton';
import { TaskType } from '../models/task-type';
import { BRAND, GameIcon } from '../ui';

/**
 * PLAY RIDE's wrapper sits 50 pt below the map's bottom edge (ExploreScreen); the group rests 120 pt
 * up from there. Its entrance starts 24 pt lower, still clear of the footer compass, and fully clear.
 */
const PLAY_RIDE_REST_Y = -120;
const PLAY_RIDE_ENTER_FROM = -96;

export default function RedeemModal({
  redeemable,
  park,
  onPress,
  onTaskFailed,
  onTaskCompleted,
  selectedTaskId = null,
  liveStatus = null,
  onOpenChange,
  onShownChange,
}: {
  /** PLAY RIDE (or the closed-ride sign) is up or gone: the map keeps its art out from under it. */
  readonly onShownChange?: (shown: boolean) => void;
  /** The live feed's status for the ride in range (DOWN, CLOSED...): no PLAY RIDE on a closed ride. */
  readonly liveStatus?: string | null;
  /** The ride selected on the map; PLAY RIDE hides while a different ride is selected. */
  readonly selectedTaskId?: number | null;
  /** The challenge flow opened or closed (for the map's one-overlay-at-a-time queue). */
  readonly onOpenChange?: (open: boolean) => void;
  readonly redeemable?: CurrentRedeemableType;
  readonly park: ParkType;
  readonly onPress: () => void;
  readonly onTaskFailed?: (taskId: number) => void;
  readonly onTaskCompleted?: (taskId: number, isSecretTask: boolean) => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  // Nearby opportunities can refresh or disappear as soon as a win is confirmed.
  // The opened challenge owns its snapshot until the player closes its reward flow.
  const [openedRedeemable, setOpenedRedeemable] = useState<CurrentRedeemableType | null>(null);
  const reducedMotion = useReducedGameMotion();
  const lastAnnounced = useRef<string | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  // PLAY RIDE is one piece: the yellow pill, its label and the ride chip under it stay hidden until
  // the pill art has drawn, then slide up together (never words or a chip on the bare map first).
  const [pillReady, setPillReady] = useState(false);

  const openChange = useRef(onOpenChange); openChange.current = onOpenChange;
  useEffect(() => { openChange.current?.(modalVisible); }, [modalVisible]);
  useEffect(() => () => openChange.current?.(false), []);
  const task = redeemable?.type === 'task' ? redeemable.model as TaskType : null;
  // Selecting a different ride on the map means the player is looking elsewhere.
  const otherSelected = !!task && selectedTaskId !== null && selectedTaskId !== task.id;
  // A ride resting until "Back 2:00 PM", or one the live feed shows closed, never offers
  // PLAY RIDE, even when the server still counts the player in range.
  const available = !otherSelected && nearbyOpportunityOpen(redeemable, liveStatus);
  // Standing at a ride that is not open: the same spot says why (and when it is back), never a blank.
  const closedReason = !otherSelected && !available ? nearbyRideClosedReason(redeemable, liveStatus) : null;
  const closedLabel = closedReason ? closedRideCopy(closedReason) : null;
  const shown = (available && pillReady) || !!closedLabel;
  const identity = redeemable ? `${redeemable.type}:${redeemable.model.id}` : null;
  const shownChange = useRef(onShownChange); shownChange.current = onShownChange;
  useEffect(() => { shownChange.current?.(shown); }, [shown]);
  useEffect(() => () => shownChange.current?.(false), []);
  // The pill unmounts when the ride stops being available: its next showing waits for its art again.
  useEffect(() => { if (!available) setPillReady(false); }, [available]);
  // The "you're in range" cue lands with the pill itself (never before the button is on screen).
  const pillShown = available && pillReady;
  useEffect(() => {
    if (pillShown && identity !== lastAnnounced.current) {
      lastAnnounced.current = identity;
      void playSound(require('../../assets/sounds/in_redeem_zone.mp3'));
    } else if (!available) {
      lastAnnounced.current = null;
    }
  }, [pillShown, available, identity, playSound]);
  // Entrance: the group fades and springs up into its resting spot (a short 24 pt rise, 0.9 to 1),
  // starting well above the footer, so it never draws over the compass or the MAP label. Hidden,
  // it is fully transparent. Native driver; Reduce Motion places it at once.
  useEffect(() => {
    enter.stopAnimation();
    if (reducedMotion) enter.setValue(shown ? 1 : 0);
    else if (shown) Animated.spring(enter, { toValue: 1, stiffness: 260, damping: 20, mass: 1, useNativeDriver: true }).start();
    else Animated.timing(enter, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    return () => enter.stopAnimation();
  }, [shown, identity, reducedMotion, enter]);
  const entrance = {
    opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [PLAY_RIDE_ENTER_FROM, PLAY_RIDE_REST_Y] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  };

  return (
    <>
      {redeemable && available && (
        <Animated.View style={entrance}>
          <YellowButton
            onArtReady={() => setPillReady(true)}
            onPress={async () => {
              setOpenedRedeemable(redeemable);
              setModalVisible(true);
            }}
            text={redeemable.type === 'task' ? 'Play Ride!'
              : redeemable.type === 'secret_task' ? 'Play Secret!' : 'Redeem'}
          />
          {task && <View pointerEvents="none" style={styles.caption} accessible
            accessibilityLabel={`${task.name}. Costs ${task.ticket_cost ?? 1} ${(task.ticket_cost ?? 1) === 1 ? 'Ticket' : 'Tickets'}.`}>
            <Text style={styles.captionText} numberOfLines={1}>{task.name}</Text>
            <View style={styles.cost}>
              <GameIcon name="ticket" size={16} />
              <Text style={styles.captionText}>{task.ticket_cost ?? 1}</Text>
            </View>
          </View>}
        </Animated.View>
      )}
      {task && !available && closedLabel && (
        <Animated.View pointerEvents="none" style={entrance} accessible
          accessibilityLabel={`${task.name}. ${closedLabel.a11y}`}>
          <View style={styles.closedPill}>
            <GameIcon name={closedLabel.icon} size={30} />
            <Text style={styles.closedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{closedLabel.text}</Text>
          </View>
          <View style={styles.caption}>
            <Text style={styles.captionText} numberOfLines={1}>{task.name}</Text>
          </View>
        </Animated.View>
      )}
      {openedRedeemable && (
        <>
          {openedRedeemable?.type === 'redeemable' && (
            <RedeemCurrentRedeemableModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable.model as RedeemableType}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'key' && (
            <RedeemKeyModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'vault' && (
            <RedeemVaultModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {(openedRedeemable?.type === 'coin' ||
            openedRedeemable?.type === 'task' ||
            openedRedeemable?.type === 'item' ||
            openedRedeemable?.type === 'pin' ||
            openedRedeemable?.type === 'secret_task') && (
            <RedeemRedeemableModal
              open={modalVisible}
              redeemable={openedRedeemable}
              close={() => setModalVisible(false)}
              park={park}
              onPress={() => onPress()}
              onTaskFailed={onTaskFailed}
              onTaskCompleted={onTaskCompleted}
            />
          )}
        </>
      )}
    </>
  );
}

/** What the PLAY RIDE spot says at a ride that is not open: a picture and a few big words. */
export function closedRideCopy(reason: NearbyClosedReason): { icon: GameIconName; text: string; a11y: string } {
  switch (reason.kind) {
    case 'resting': {
      const back = restingLabel(reason.at);
      return { icon: 'timer', text: back, a11y: `Resting now. ${back}.` };
    }
    case 'down': return { icon: 'wrench', text: 'Ride is down', a11y: 'This ride is down right now. Try again soon.' };
    case 'repairs': return { icon: 'wrench', text: 'Closed for repairs', a11y: 'This ride is closed for repairs.' };
    default: return { icon: 'lock', text: 'Closed now', a11y: 'This ride is closed right now.' };
  }
}

const styles: Record<'caption' | 'cost' | 'closedPill', ViewStyle> & { captionText: TextStyle; closedText: TextStyle } = {
  // A ride that is not open: a soft, untappable cream pill in the PLAY RIDE spot (not a button).
  closedPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%',
    backgroundColor: '#FFF5D3', borderRadius: 26, borderWidth: 3, borderColor: BRAND.navy,
    paddingHorizontal: 20, paddingVertical: 10, marginBottom: 8 },
  closedText: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, flexShrink: 1 },
  // Ride name and price under PLAY RIDE, on a white tab with his navy outline.
  caption: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, maxWidth: '100%',
    backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 3 },
  captionText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, flexShrink: 1 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
};
