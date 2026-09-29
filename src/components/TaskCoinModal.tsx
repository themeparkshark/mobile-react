import { Image } from 'expo-image';
import { type ReactNode, useContext, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from '../helpers/haptics';
import Button from '../components/Button';
import CoinLevelingModal from './CoinLevelingModal';
import { AuthContext } from '../context/AuthProvider';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import getRideCoins from '../api/endpoints/me/ride-coins';
import levelUpRideCoin from '../api/endpoints/me/ride-coins/level-up';
import featureRideCoin from '../api/endpoints/me/ride-coins/feature';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

export default function TaskCoinModal({
  task,
  trigger,
  readOnly = false,
  timesCompleted,
  onPlayInLine,
  size = 60,
}: {
  readonly isSecretTask?: boolean;
  readonly task: TaskType | SecretTaskType;
  readonly timesCompleted?: number;
  readonly trigger?: ReactNode;
  readonly readOnly?: boolean;
  readonly onPlayInLine?: () => void;
  readonly size?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [rideCoin, setRideCoin] = useState<RideCoinLevelType | null>(null);
  const [loading, setLoading] = useState(false);
  const [coinUnavailable, setCoinUnavailable] = useState(false);
  const [playAfterClose, setPlayAfterClose] = useState(false);
  const { player, refreshPlayer } = useContext(AuthContext);

  const fetchCoin = async () => {
    const response = await getRideCoins(5_000);
    return response.data.find((coin) =>
      task.asset_id ? coin.id === task.asset_id : coin.coin_url === task.coin_url
    ) ?? null;
  };

  const handleOpen = async () => {
    if (loading) return;
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (readOnly) {
      setCoinUnavailable(false);
      setVisible(true);
      return;
    }
    setLoading(true);
    try {
      const coin = await fetchCoin();
      if (!coin) {
        if (onPlayInLine) {
          setCoinUnavailable(true);
          setVisible(true);
        } else {
          Alert.alert('Coin not collected', 'Complete this ride challenge to add its coin to your shelf.');
        }
        return;
      }
      setCoinUnavailable(false);
      setRideCoin(coin);
      setVisible(true);
    } catch {
      if (onPlayInLine) {
        setCoinUnavailable(true);
        setVisible(true);
      } else {
        Alert.alert('Coin unavailable', 'Your coin could not be loaded. Try again when your connection returns.');
      }
    } finally {
      setLoading(false);
    }
  };

  const level = rideCoin?.current_level ?? 1;
  const publicLevel = 'coin_level' in task && typeof task.coin_level === 'number'
    ? task.coin_level : null;
  const viewedLevel = Math.max(1, Math.min(5, Number(publicLevel) || 1));
  const viewedTier = ['Basic', 'Silver', 'Gold', 'Prismatic', 'Legendary'][viewedLevel - 1];

  return (
    <>
      <Button onPress={handleOpen} accessibilityLabel={readOnly
        ? `${task.name} ride coin, collected${publicLevel ? ` at level ${viewedLevel}` : ''}. View collection details`
        : `${task.name} ride coin, collected. View mastery and upgrades`}>
        {trigger ?? <Image
          source={task.coin_url}
          style={{
            width: size,
            height: size,
            borderWidth: (readOnly ? viewedLevel : level) >= 4 ? 3 : 2,
            borderColor:
              (readOnly ? viewedLevel : level) >= 5 ? '#fb923c' :
              (readOnly ? viewedLevel : level) >= 4 ? '#c4b5fd' :
              (readOnly ? viewedLevel : level) >= 3 ? '#fbbf24' :
              (readOnly ? viewedLevel : level) >= 2 ? '#cbd5e1' : '#fff',
            borderRadius: 50,
            ...(Platform.OS === 'ios' && (readOnly ? viewedLevel : level) >= 3 ? {
              shadowColor: (readOnly ? viewedLevel : level) >= 5 ? '#fb923c' :
                (readOnly ? viewedLevel : level) >= 4 ? '#c4b5fd' : '#fbbf24',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 6,
            } : {}),
          }}
        />}
      </Button>

      {readOnly || coinUnavailable ? <Modal isVisible={visible} onBackdropPress={() => setVisible(false)}
        onModalHide={() => {
          if (playAfterClose) {
            setPlayAfterClose(false);
            onPlayInLine?.();
          }
        }}
        onSwipeComplete={() => setVisible(false)} swipeDirection="down"
        animationIn="zoomIn" animationOut="zoomOut" backdropOpacity={0.85}>
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <View style={{ width: '88%', alignItems: 'center' }}>
            <Ribbon text="Ride Coin" />
            <View style={{ alignItems: 'center', alignSelf: 'stretch',
              backgroundColor: '#0878be', borderColor: '#fff', borderWidth: 3,
              borderRadius: 20, padding: 18, paddingTop: 25, marginTop: -12 }}>
              {!!task.coin_url && <Image source={task.coin_url} contentFit="contain"
                style={{ width: 116, height: 116, marginBottom: 12 }} />}
              <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 21,
                textAlign: 'center' }}>{task.name}</Text>
              {coinUnavailable && <Text style={{ color: '#e4f7ff', fontFamily: 'Knockout',
                fontSize: 15, textAlign: 'center', marginTop: 12 }}>
                Upgrade details are unavailable. Queue games are still ready to play.
              </Text>}
              {!coinUnavailable && <View style={{ backgroundColor: '#ffcf3b', borderRadius: 12,
                paddingHorizontal: 15, paddingVertical: 8, marginTop: 12 }}>
                <Text style={{ fontFamily: 'Shark', color: '#075083', fontSize: 17 }}>
                  {publicLevel ? `LEVEL ${viewedLevel} · ${viewedTier.toUpperCase()}` : 'COLLECTED'}
                </Text>
              </View>}
              {!coinUnavailable && typeof timesCompleted === 'number' && <Text style={{ fontFamily: 'Knockout', color: '#e4f7ff',
                fontSize: 16, marginTop: 12, marginBottom: 17 }}>
                Collected {timesCompleted} {timesCompleted === 1 ? 'time' : 'times'}
              </Text>}
              {coinUnavailable && onPlayInLine && <Pressable accessibilityRole="button"
                accessibilityLabel={`Play LinePlay for ${task.name}`}
                onPress={() => { setPlayAfterClose(true); setVisible(false); }}
                style={{ backgroundColor: '#ffcf3b', borderRadius: 12,
                  paddingVertical: 12, paddingHorizontal: 20, marginTop: 18,
                  marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Shark', color: '#075083', fontSize: 17 }}>
                  Play in Line
                </Text>
              </Pressable>}
              <YellowButton text="Close" onPress={() => setVisible(false)} />
            </View>
          </View>
        </View>
      </Modal> : <CoinLevelingModal
        visible={visible}
        rideCoin={rideCoin}
        playerEnergy={player?.energy ?? 0}
        playerParts={rideCoin?.available_parts ?? 0}
        onClose={() => {
          setVisible(false);
          fetchCoin().then((updated) => {
            if (updated) setRideCoin(updated);
          }).catch(() => undefined);
        }}
        onLevelUp={async (id) => {
          if (!rideCoin) return false;
          try {
            const result = await levelUpRideCoin(id, rideCoin.current_level);
            return result.success && result.ride_coin.current_level > rideCoin.current_level;
          } catch (error) {
            // A response can be lost after the atomic upgrade commits. Read it
            // back before offering a retry of the same expected level.
            try {
              const latest = await getRideCoins(5_000);
              if (latest.data.some(coin => coin.id === id && coin.current_level > rideCoin.current_level))
                return true;
            } catch { /* Preserve the original failure for the retry surface. */ }
            throw error;
          }
        }}
        onFeature={async (assetId) => {
          let saved = false;
          try {
            await featureRideCoin(assetId);
            saved = true;
          } catch (err) {
            console.warn('Could not feature ride coin:', err);
          }
          try {
            const latest = await getRideCoins();
            saved = assetId === null
              ? latest.data.every(coin => !coin.is_featured)
              : latest.data.some(coin => coin.id === assetId && coin.is_featured);
          } catch {
            // Keep the confirmed write result if readback is temporarily unavailable.
          }
          if (saved) await refreshPlayer().catch(() => undefined);
          return saved;
        }}
        onPlayInLine={onPlayInLine}
      />}
    </>
  );
}
