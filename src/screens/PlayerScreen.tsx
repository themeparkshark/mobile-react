import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getPlayer from '../api/endpoints/players/get';
import reportPlayer from '../api/endpoints/players/report';
import getVisitedParks from '../api/endpoints/players/visited-parks';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import Heading from '../components/Heading';
import PlayerButtons from '../components/PlayerButtons';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Subscribed from '../components/Subscribed';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import { AuthContext } from '../context/AuthProvider';
import { useFriendActions } from '../hooks/useFriends';
import { GameIcon, ICON_SOURCES, SharkLoader, confirmGame, gameAlert, showGameDialog } from '../ui';
import { effectiveStatus } from './social/socialModel';
import { SurfaceContext, takeJustFriended, useFriendOverrides } from './social/socialStore';
import { Burst } from './social/SocialFx';
import { Pill, SocialBackdrop, SocialError, kit } from './social/SocialKit';
import { BRAND } from '../ui/tokens';
import usePermissions from '../hooks/usePermissions';
import usePurchaseItem from '../hooks/usePurchaseItem';
import { ParkType } from '../models/park-type';
import { PermissionEnums } from '../models/permission-enums';
import { PlayerType } from '../models/player-type';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

export default function PlayerScreen({ route, navigation }: NativeStackScreenProps<ParamListBase, 'Player'>) {
  const { player } = route.params as { player: number };
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerType>();
  const [parks, setParks] = useState<ParkType[]>([]);
  const { purchaseItem, purchaseModal } = usePurchaseItem();
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const actions = useFriendActions();
  const overrides = useFriendOverrides();
  const { checkPermission } = usePermissions();
  const { player: authPlayer } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      if (authPlayer?.id === player) {
        navigation.navigate('Profile');
        return;
      }
    }, [])
  );

  // A failed load shows a retry instead of a spinner forever. Reloads when the
  // screen is reused for another player; an older answer is ignored.
  const loadSeq = useRef(0);
  useAsyncEffect(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setFailed(false);
    try {
      const next = await getPlayer(player);
      const visited = await getVisitedParks(player).catch(() => []);
      if (seq !== loadSeq.current) return;
      setCurrentPlayer(next);
      setParks(visited);
    } catch {
      if (seq === loadSeq.current) setFailed(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [player, reloadKey]);

  const status = currentPlayer ? effectiveStatus(currentPlayer, overrides) : 'none';
  const heroWidth = Dimensions.get('window').width - 28 - 6;
  const isFriend = status === 'friends';

  const buttons = currentPlayer
    ? [
        {
          image: require('../../assets/images/screens/player/gift.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.RedeemMascotGifts)) {
              await purchaseItem(currentPlayer.mascot.item);
            }
          },
          show: !!currentPlayer.mascot,
          text: 'Gift',
          permission: PermissionEnums.RedeemMascotGifts,
        },
        {
          image: require('../../assets/images/screens/player/compliment.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.CreateCompliments)) {
              await actions.cheer(currentPlayer);
            }
          },
          show: isFriend,
          text: 'Heart',
          permission: PermissionEnums.CreateCompliments,
        },
        {
          image: require('../../assets/images/screens/friends/remove_friend.png'),
          onPress: () => { void actions.remove(currentPlayer); },
          show: isFriend,
          text: 'Remove',
        },
        {
          // Always offered: the reason is a picture-word choice, then "Block them too?".
          image: ICON_SOURCES.info,
          onPress: async () => {
            if (!checkPermission(PermissionEnums.CreateReports)) return;
            const reasons = ['inappropriate_username', 'mean_to_me', 'something_else'] as const;
            const choice = await showGameDialog({
              title: `Tell us about ${currentPlayer.screen_name}`,
              message: 'A grown-up on our team will check it.',
              icon: 'info',
              // Three equal choices.
              // A picture per reason so a kid can pick without reading.
              buttons: [{ text: 'Mean name', icon: 'edit' }, { text: 'Mean to me', image: require('../../assets/images/screens/player/report_mean.png') }, { text: 'Something else', icon: 'info' }, { text: 'Cancel', style: 'cancel' }],
              equalChoices: true,
            });
            if (choice == null || choice > 2) return;
            try {
              await reportPlayer(currentPlayer.id, reasons[choice]);
            } catch {
              gameAlert("Couldn't send the report", 'Check your connection and try again.');
              return;
            }
            if (status !== 'blocked' && await confirmGame({ title: 'Thanks for telling us!', message: `Block ${currentPlayer.screen_name} too?`, confirmLabel: 'Block', cancelLabel: 'Not now', icon: 'check' })) {
              void actions.block(currentPlayer, true);
            }
          },
          text: 'Report',
          permission: PermissionEnums.CreateReports,
        },
        {
          // Block: a red no-entry sign. Unblock: the undo arrow. Neither is the No X.
          image: status === 'blocked' ? ICON_SOURCES.retry : require('../../assets/images/screens/friends/block.png'),
          onPress: () => { void (status === 'blocked' ? actions.unblock(currentPlayer) : actions.block(currentPlayer)); },
          text: status === 'blocked' ? 'Unblock' : 'Block',
        },
      ]
    : [];

  return (
    <SurfaceContext.Provider value={`profile-${player}`}>
      {purchaseModal}
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{currentPlayer?.screen_name}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <SocialBackdrop>
        {loading && <SharkLoader state="loading" tone="onBlue" title="Opening their profile" />}
        {!loading && failed && (
          <SocialError title="This profile didn't load" onRetry={() => setReloadKey(k => k + 1)} />
        )}
        {!loading && currentPlayer && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 140, gap: 12 }}>
            {/* The whole dressed shark, head to tail, framed like a trading card. */}
            <View style={[kit.card, { height: heroWidth * 1.131, padding: 0, backgroundColor: '#BFE5FF' }]}
              accessible accessibilityLabel={`${currentPlayer.screen_name}'s shark`}>
              <Playercard inventory={currentPlayer.inventory} style={{ width: heroWidth, height: heroWidth * 1.131 }} />
              {!!currentPlayer.title && (
                <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: '#182A39', borderRadius: 16,
                  paddingHorizontal: 16, paddingVertical: 7, borderWidth: 2, borderColor: '#F4CD72' }}>
                  <Text style={{ color: '#F4CD72', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center' }} numberOfLines={1}>{currentPlayer.title}</Text>
                </View>
              )}
            </View>
            <FriendPanel
              name={currentPlayer.screen_name}
              status={status}
              onAdd={() => { if (checkPermission(PermissionEnums.AddFriends)) void actions.add(currentPlayer); }}
              onYes={() => { void actions.accept(currentPlayer); }}
              onNo={() => { void actions.decline(currentPlayer); }}
              onUndo={() => { void actions.cancel(currentPlayer); }}
            />
            <View style={[kit.card, { paddingVertical: 10, backgroundColor: BRAND.cream }]}>
              <PlayerButtons buttons={buttons} />
            </View>
            {!!currentPlayer.featured_ride_coin && (
              <FeaturedRideCoinCard coin={currentPlayer.featured_ride_coin} />
            )}
            <Experience player={currentPlayer} />
            {(currentPlayer.is_subscribed || currentPlayer.verified_at) && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {currentPlayer.is_subscribed && <View style={{ flex: 1 }}><Subscribed /></View>}
                {currentPlayer.verified_at && <View style={{ flex: 1 }}><Verified /></View>}
              </View>
            )}
            {!isFriend && currentPlayer.id !== authPlayer?.id && (currentPlayer.profile_access ?? 'public') === 'public' ? (
              // Strangers see who they are, not six zeros.
              <View style={[kit.card, { padding: 16, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                accessible accessibilityLabel={`Friends only. Become friends with ${currentPlayer.screen_name} to see their stats and parks.`}>
                <View><GameIcon name="trophy" size={52} /><View style={{ position: 'absolute', right: -6, bottom: -6 }}><GameIcon name="lock" size={26} /></View></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Shark', fontSize: 20, color: '#05346e', textTransform: 'uppercase' }} maxFontSizeMultiplier={1.2}>Friends only</Text>
                  <Text style={{ fontFamily: 'Knockout', fontSize: 17, color: BRAND.navySoft }} maxFontSizeMultiplier={1.3}>Become friends to see their stats and parks.</Text>
                </View>
              </View>
            ) : (
            <View style={[kit.card, { padding: 12, backgroundColor: BRAND.cream }]}>
              <Heading text="Statistics" />
              <Stats player={currentPlayer} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <VisitedParks parks={parks} player={currentPlayer} />
                </>
              )}
            </View>
            )}
          </ScrollView>
        )}
      </SocialBackdrop>
    </SurfaceContext.Provider>
  );
}

/**
 * The one big friend button a kid needs on a profile: Add friend, Asked
 * (tap to take it back), Yes! / No when they asked you, or a happy
 * "Friends" badge. Blocked shows nothing here (Unblock is in the buttons).
 */
function FriendPanel({ name, status, onAdd, onYes, onNo, onUndo }: {
  readonly name: string;
  readonly status: string;
  readonly onAdd: () => void;
  readonly onYes: () => void;
  readonly onNo: () => void;
  readonly onUndo: () => void;
}) {
  const [burst, setBurst] = useState(false);
  if (status === 'blocked') return null;
  return (
    <View style={[kit.card, { alignItems: 'center', padding: 14, backgroundColor: status === 'friends' ? '#E5F8E9' : BRAND.cream }]}>
      <FriendMoment status={status} name={name} onBurst={setBurst} />
      {burst && <Burst style={{ left: '50%', top: 30 }} onDone={() => setBurst(false)} />}
      {status === 'incoming' && (
        <>
          <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#05346e', textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}
            maxFontSizeMultiplier={1.2}>{name} wants to be friends!</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pill tone="grey" icon="close" label="No" onPress={onNo} accessibilityLabel={`Say no to ${name}`} />
            <Pill tone="green" icon="check" label="Yes!" onPress={onYes} accessibilityLabel={`Say yes to ${name}`} />
          </View>
        </>
      )}
      {status === 'none' && <Pill tone="gold" image={require('../../assets/images/screens/friends/add_friend.png')} label="Add friend" onPress={onAdd} accessibilityLabel={`Add ${name} as a friend`} />}
      {status === 'outgoing' && <Pill tone="grey" icon="timer" label="Asked" onPress={onUndo} accessibilityLabel={`You asked ${name}. Tap to take it back`} />}
      {status === 'friends' && <Pill tone="green" icon="check" label="Friends" accessibilityLabel={`${name} is your friend`} />}
    </View>
  );
}

/** Plays the new-friend burst once, when a Yes happens on this screen. */
function FriendMoment({ status, name, onBurst }: { readonly status: string; readonly name: string; readonly onBurst: (on: boolean) => void }) {
  const { params } = useRoute() as { params?: { player?: number } };
  const id = Number(params?.player);
  const surface = useContext(SurfaceContext);
  useEffect(() => {
    if (status === 'friends' && id && takeJustFriended(id, surface)) onBurst(true);
  }, [status, id, onBurst, surface]);
  return status === 'friends' ? (
    <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#237A3B', textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}
      maxFontSizeMultiplier={1.2}>You and {name} are friends!</Text>
  ) : null;
}
