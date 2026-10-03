import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useState } from 'react';
import { ImageBackground, Pressable } from 'react-native';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import getPlayer from '../api/endpoints/players/get';
import reportPlayer from '../api/endpoints/players/report';
import getVisitedParks from '../api/endpoints/players/visited-parks';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import ProfileShortcuts, { type ProfileShortcut } from '../components/profile/ProfileShortcuts';
import StatusBadges from '../components/profile/StatusBadges';
import TitlePill from '../components/profile/TitlePill';
import ProfileEventChip from '../components/profile/ProfileEventChip';
import useCardOnScreen from '../components/profile/useCardOnScreen';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import VisitedParks from '../components/VisitedParks';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { useFriendActions } from '../hooks/useFriends';
import { confirmGame, gameAlert } from '../ui';
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

/** The shark stage: 315 pt on tall phones, shorter on 6.1" ones so the shortcut row shows on first view. */
const STAGE_H = Math.round(Math.max(270, Math.min(315, Dimensions.get('window').height * 0.33)));

export default function PlayerScreen({ route, navigation }: NativeStackScreenProps<ParamListBase, 'Player'>) {
  const { player } = route.params as { player: number };
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerType>();
  const [parks, setParks] = useState<ParkType[]>([]);
  const { purchaseItem, purchaseModal } = usePurchaseItem();
  const actions = useFriendActions();
  const overrides = useFriendOverrides();
  const { checkPermission, hasPermission } = usePermissions();
  const [failed, setFailed] = useState(false);
  const focused = useIsFocused();
  const levelCard = useCardOnScreen();
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

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    let loaded: PlayerType;
    try {
      loaded = await getPlayer(player);
      setCurrentPlayer(loaded);
    } catch {
      setFailed(true);
      setLoading(false);
      return;
    }
    // Parks are a bonus, and only fetched for friends (a stranger never gets a child's park history).
    try {
      setParks(loaded.is_friend ? await getVisitedParks(player) : []);
    } catch {
      setParks([]);
    }
    setLoading(false);
  }, [player]);

  useEffect(() => { void load(); }, [load]);

  // Social v2: optimistic friend state (Add, Asked, Yes/No, Block) layered over the server's answer.
  const status = currentPlayer ? effectiveStatus(currentPlayer, overrides) : 'none';
  const isFriend = status === 'friends';

  const report = async () => {
    if (!currentPlayer || !checkPermission(PermissionEnums.CreateReports)) return;
    if (!(await confirmGame({ title: vsprintf(prompts.report_username, [currentPlayer.screen_name]), confirmLabel: 'Report', icon: 'info' }))) return;
    try {
      await reportPlayer(currentPlayer.id);
      gameAlert(messages.report_created || 'Report sent.', 'Thanks! A grown-up on our team will check it.', undefined, { icon: 'check', haptic: 'success' });
    } catch {
      gameAlert("Couldn't send the report", 'Check your connection and try again.');
    }
  };

  // Friendly actions first; Unfriend always last. Adding or answering a friend
  // request lives in the FriendPanel above the row.
  const shortcuts: ProfileShortcut[] = currentPlayer
    ? [
        ...(status !== 'blocked' ? [{
          key: 'compliment',
          label: 'Heart',
          image: require('../../assets/images/screens/player/compliment.png'),
          hint: `Sends ${currentPlayer.screen_name} a heart`,
          locked: !hasPermission(PermissionEnums.CreateCompliments),
          onPress: async () => {
            if (checkPermission(PermissionEnums.CreateCompliments)) {
              await actions.cheer(currentPlayer);
            }
          },
        }] : []),
        ...(currentPlayer.mascot ? [{
          key: 'gift',
          label: 'Gift',
          image: require('../../assets/images/screens/player/gift.png'),
          hint: `Sends ${currentPlayer.screen_name} a gift`,
          locked: !hasPermission(PermissionEnums.RedeemMascotGifts),
          onPress: async () => {
            if (checkPermission(PermissionEnums.RedeemMascotGifts)) {
              await purchaseItem(currentPlayer.mascot.item);
            }
          },
        }] : []),
        ...(isFriend ? [{
          key: 'remove-friend',
          label: 'Unfriend',
          image: require('../../assets/images/screens/friends/remove_friend.png'),
          hint: `Removes ${currentPlayer.screen_name} from your friends`,
          onPress: () => { void actions.remove(currentPlayer); },
        }] : []),
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
        <Loading state="error" message="This shark's page didn't load." onRetry={() => { void load(); }} />
      )}
      {!loading && currentPlayer && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
            backgroundColor: '#dff4ff',
          }}
          {...levelCard.scrollProps}
        >
          <View
            ref={levelCard.contentRef}
            onLayout={levelCard.remeasure}
            style={{
              paddingBottom: 56,
            }}
          >
            <ImageBackground
              source={currentPlayer.inventory?.background_item?.paper_url ? {
                uri: currentPlayer.inventory.background_item.paper_url,
              } : require('../../assets/images/seaweed_background.png')}
              resizeMode="cover"
              style={{
                height: STAGE_H,
                overflow: 'hidden',
                position: 'relative',
              }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${currentPlayer.screen_name}'s shark`}
            >
              <Playercard
                showBackground={false}
                inventory={currentPlayer.inventory}
                style={{
                  position: 'absolute',
                  width: Dimensions.get('window').width,
                  height: 455,
                  marginTop: -55 - (315 - STAGE_H) / 2,
                }}
              />
            </ImageBackground>
            <View
              style={{
                backgroundColor: '#dff4ff',
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
              }}
            >
              <View style={{ marginBottom: 12 }}>
                <TitlePill title={currentPlayer.title}
                  trophy={<ProfileEventChip playerId={currentPlayer.id} />} />
              </View>
              {!!currentPlayer.featured_ride_coin && (
                <FeaturedRideCoinCard coin={currentPlayer.featured_ride_coin} />
              )}
              <View ref={levelCard.cardRef} onLayout={levelCard.remeasure} style={{ paddingTop: 4 }}>
                <Experience player={currentPlayer} own={false} paused={!focused || levelCard.offscreen} />
              </View>
              <FriendPanel
                name={currentPlayer.screen_name}
                status={status}
                onAdd={() => { if (checkPermission(PermissionEnums.AddFriends)) void actions.add(currentPlayer); }}
                onYes={() => { void actions.accept(currentPlayer); }}
                onNo={() => { void actions.decline(currentPlayer); }}
                onUndo={() => { void actions.cancel(currentPlayer); }}
              />
              <View style={{ marginTop: 18 }}>
                <ProfileShortcuts items={shortcuts} />
              </View>
              <StatusBadges isVip={!!currentPlayer.is_subscribed} isVerified={!!currentPlayer.verified_at} own={false} />
              <Heading text="Statistics" />
              <Stats player={currentPlayer} />
              {/* Park history is for friends only; strangers see the shark, title, level and stats. */}
              {isFriend && parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      borderRadius: 18,
                      padding: 16,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                  >
                    <VisitedParks parks={parks} player={currentPlayer} />
                  </View>
                </>
              )}
              {Boolean(currentPlayer.username) && (
                <Pressable
                  onPress={() => { void report(); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${currentPlayer.screen_name}`}
                  style={{ alignSelf: 'center', marginTop: 28, minHeight: 44, paddingHorizontal: 16,
                    justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#526477',
                    textDecorationLine: 'underline' }}>
                    Report this player
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { void (status === 'blocked' ? actions.unblock(currentPlayer) : actions.block(currentPlayer)); }}
                accessibilityRole="button"
                accessibilityLabel={`${status === 'blocked' ? 'Unblock' : 'Block'} ${currentPlayer.screen_name}`}
                style={{ alignSelf: 'center', marginTop: 4, minHeight: 44, paddingHorizontal: 16,
                  justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#526477',
                  textDecorationLine: 'underline' }}>
                  {status === 'blocked' ? 'Unblock this player' : 'Block this player'}
                </Text>
              </Pressable>
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
