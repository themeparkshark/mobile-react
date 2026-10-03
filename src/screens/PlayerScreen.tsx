import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import { vsprintf } from 'sprintf-js';
import getPlayer from '../api/endpoints/players/get';
import reportPlayer from '../api/endpoints/players/report';
import getVisitedParks from '../api/endpoints/players/visited-parks';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import PlayerButtons from '../components/PlayerButtons';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Subscribed from '../components/Subscribed';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { useFriendActions } from '../hooks/useFriends';
import { ICON_SOURCES, SharkLoader, confirmGame, gameAlert } from '../ui';
import { effectiveStatus } from './social/socialModel';
import { useFriendOverrides } from './social/socialStore';
import { Pill } from './social/SocialKit';
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
  const { prompts, messages } = useCrumbs();

  useFocusEffect(
    useCallback(() => {
      if (authPlayer?.id === player) {
        navigation.navigate('Profile');
        return;
      }
    }, [])
  );

  // A failed load shows a retry instead of a spinner forever.
  useAsyncEffect(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setCurrentPlayer(await getPlayer(player));
      setParks(await getVisitedParks(player).catch(() => []));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [reloadKey]);

  const status = currentPlayer ? effectiveStatus(currentPlayer, overrides) : 'none';
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
          show: status !== 'blocked',
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
          show: Boolean(currentPlayer.username),
          image: ICON_SOURCES.info,
          onPress: async () => {
            if (!checkPermission(PermissionEnums.CreateReports)) return;
            if (!(await confirmGame({ title: vsprintf(prompts.report_username, [currentPlayer.screen_name]), confirmLabel: 'Report', icon: 'info' }))) return;
            try {
              await reportPlayer(currentPlayer.id);
              gameAlert(messages.report_created || 'Report sent.', 'Thanks! A grown-up on our team will check it.', undefined, { icon: 'check', haptic: 'success' });
            } catch {
              gameAlert("Couldn't send the report", 'Check your connection and try again.');
            }
          },
          text: 'Report',
          permission: PermissionEnums.CreateReports,
        },
        {
          image: ICON_SOURCES.lock,
          onPress: () => { void (status === 'blocked' ? actions.unblock(currentPlayer) : actions.block(currentPlayer)); },
          text: status === 'blocked' ? 'Unblock' : 'Block',
        },
      ]
    : [];

  return (
    <>
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
      {loading && <Loading />}
      {!loading && failed && (
        <SharkLoader state="error" title="This profile didn't load" onRetry={() => setReloadKey(k => k + 1)} />
      )}
      {!loading && currentPlayer && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Playercard
                inventory={currentPlayer.inventory}
                style={{
                  position: 'absolute',
                  width: Dimensions.get('window').width,
                  height: 455,
                  marginTop: -55,
                }}
              />
            </View>
            <View
              style={{
                borderTopWidth: 5,
                borderTopColor: config.primary,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 24,
              }}
            >
              {!!currentPlayer.title && (
                <View style={{ alignSelf: 'center', backgroundColor: '#182A39', borderRadius: 16,
                  paddingHorizontal: 16, paddingVertical: 7, marginBottom: 14 }}>
                  <Text style={{ color: '#F4CD72', fontFamily: 'Knockout', fontSize: 17,
                    textAlign: 'center' }} numberOfLines={1}>{currentPlayer.title}</Text>
                </View>
              )}
              {!!currentPlayer.featured_ride_coin && (
                <FeaturedRideCoinCard coin={currentPlayer.featured_ride_coin} />
              )}
              <Experience player={currentPlayer} />
              <FriendPanel
                name={currentPlayer.screen_name}
                status={status}
                onAdd={() => { if (checkPermission(PermissionEnums.AddFriends)) void actions.add(currentPlayer); }}
                onYes={() => { void actions.accept(currentPlayer); }}
                onNo={() => { void actions.decline(currentPlayer); }}
                onUndo={() => { void actions.cancel(currentPlayer); }}
              />
              <PlayerButtons buttons={buttons} />
              {(currentPlayer.is_subscribed || currentPlayer.verified_at) && (
                <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 8, gap: 8 }}>
                  {currentPlayer.is_subscribed && (
                    <View style={{ flex: 1 }}>
                      <Subscribed />
                    </View>
                  )}
                  {currentPlayer.verified_at && (
                    <View style={{ flex: 1 }}>
                      <Verified />
                    </View>
                  )}
                </View>
              )}
              <Heading text="Statistics" />
              <Stats player={currentPlayer} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <VisitedParks parks={parks} player={currentPlayer} />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </>
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
  if (status === 'blocked') return null;
  return (
    <View style={{ alignItems: 'center', marginTop: 14, marginBottom: 4 }}>
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
      {status === 'none' && <Pill tone="gold" icon="shark" label="Add friend" onPress={onAdd} accessibilityLabel={`Add ${name} as a friend`} />}
      {status === 'outgoing' && <Pill tone="grey" icon="timer" label="Asked" onPress={onUndo} accessibilityLabel={`You asked ${name}. Tap to take it back`} />}
      {status === 'friends' && <Pill tone="green" icon="check" label="Friends" accessibilityLabel={`${name} is your friend`} />}
    </View>
  );
}
