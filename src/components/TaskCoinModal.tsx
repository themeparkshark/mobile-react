import { type ReactNode, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from '../helpers/haptics';
import Button from '../components/Button';
import CoinLevelingModal from './CoinLevelingModal';
import ShelfCoin from './collection/ShelfCoin';
import { AuthContext } from '../context/AuthProvider';
import { loadCoin, loadCoinCollection, setFeaturedCoin, upsertCoin } from '../context/CoinCollection';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import levelUpRideCoin from '../api/endpoints/me/ride-coins/level-up';
import featureRideCoin from '../api/endpoints/me/ride-coins/feature';
import { coinLevelLabel } from '../constants/coinTiers';
import { gameAlert } from '../ui/GameDialog';
import GameIcon from '../ui/GameIcon';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

export default function TaskCoinModal({
  task,
  trigger,
  readOnly = false,
  timesCompleted,
  level,
  onPlayInLine,
  size = 60,
  phase = 0,
  openRequestKey,
  igniteKey,
}: {
  readonly isSecretTask?: boolean;
  readonly task: TaskType | SecretTaskType;
  readonly timesCompleted?: number;
  /** The coin's level from the park shelf data (owner or visitor). */
  readonly level?: number | null;
  readonly trigger?: ReactNode;
  readonly readOnly?: boolean;
  readonly onPlayInLine?: () => void;
  readonly size?: number;
  /** Slot index, spreads the shared shelf shimmer. */
  readonly phase?: number;
  /** An explicit action from this coin’s shelf-arrival card. */
  readonly openRequestKey?: number;
  /** Plays the slot ignite (a coin just landed here). */
  readonly igniteKey?: number | string;
}) {
  const [visible, setVisible] = useState(false);
  const [rideCoin, setRideCoin] = useState<RideCoinLevelType | null>(null);
  const [coinUnavailable, setCoinUnavailable] = useState(false);
  const [playAfterClose, setPlayAfterClose] = useState(false);
  const [upgradedKey, setUpgradedKey] = useState(0);
  const upgradedDuringVisit = useRef(false);
  const { player, refreshPlayer } = useContext(AuthContext);
  const mounted = useRef(true), opening = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchCoin = async (force = false) => {
    if (!player?.id) return null;
    if (task.asset_id) return loadCoin(player.id, task.asset_id, { force });
    // Older task payloads carry only the coin image: match it in the shared collection.
    if (!task.coin_url) return null;
    const coins = await loadCoinCollection(player.id, { force });
    const match = coins.find(coin => coin.coin_url === task.coin_url);
    return match ? loadCoin(player.id, match.id, { force }) : null;
  };

  const handleOpen = async (stillRequested: () => boolean = () => true) => {
    if (opening.current || !mounted.current || !stillRequested()) return;
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (readOnly) {
      setCoinUnavailable(false);
      setVisible(true);
      return;
    }
    opening.current = true;
    try {
      // The detail sheet reads its one coin fresh (with the Your rides journal).
      const coin = await fetchCoin(true);
      if (!mounted.current || !stillRequested()) return;
      if (!coin) {
        if (onPlayInLine) {
          setCoinUnavailable(true);
          setVisible(true);
        } else {
          gameAlert('Not collected yet', 'Win this ride challenge to add its coin to your shelf.', undefined, { icon: 'coin' });
        }
        return;
      }
      setCoinUnavailable(false);
      setRideCoin(coin);
      upgradedDuringVisit.current = false;
      setVisible(true);
    } catch {
      if (!mounted.current || !stillRequested()) return;
      if (onPlayInLine) {
        setCoinUnavailable(true);
        setVisible(true);
      } else {
        gameAlert('Coin unavailable', 'Your coin could not load. Try again when your connection returns.', undefined, { icon: 'retry' });
      }
    } finally {
      opening.current = false;
    }
  };

  const openedRequest = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!openRequestKey || openedRequest.current === openRequestKey) return;
    openedRequest.current = openRequestKey;
    let active = true;
    void handleOpen(() => active);
    return () => { active = false; };
    // One explicit request opens this exact task; data changes never replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestKey]);

  // The owner's live level wins; otherwise the shelf's own level. Never a blanket Level 1.
  const publicLevel = 'coin_level' in task && typeof task.coin_level === 'number' ? task.coin_level : null;
  const shownLevel = Math.max(1, Math.min(5, Number(rideCoin?.current_level ?? level ?? publicLevel) || 1));
  const knownLevel = rideCoin?.current_level ?? level ?? publicLevel;
  const ignite = upgradedKey || igniteKey;

  return (
    <>
      <Button onPress={() => handleOpen()} accessibilityLabel={readOnly
        ? `${task.name} ride coin, collected${knownLevel ? `, ${coinLevelLabel(shownLevel)}` : ''}. View collection details`
        : `${task.name} ride coin, ${coinLevelLabel(shownLevel)}. View mastery and upgrades`}>
        {trigger ?? <ShelfCoin coinUrl={task.coin_url} level={shownLevel} size={size} phase={phase} igniteKey={ignite} />}
      </Button>

      {readOnly || coinUnavailable ? <Modal isVisible={visible} onBackdropPress={() => setVisible(false)}
        onModalHide={() => {
          if (playAfterClose) {
            setPlayAfterClose(false);
            onPlayInLine?.();
          }
        }}
        onSwipeComplete={() => setVisible(false)} swipeDirection="down"
        animationIn="zoomIn" animationOut="zoomOut" backdropColor="#05346e" backdropOpacity={0.55}>
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <View style={{ width: '88%', alignItems: 'center' }}>
            <Ribbon text="Ride Coin" />
            <View style={{ alignItems: 'center', alignSelf: 'stretch',
              backgroundColor: '#0878be', borderColor: '#fff', borderWidth: 3,
              borderRadius: 20, padding: 18, paddingTop: 25, marginTop: -12 }}>
              {!!task.coin_url && <View style={{ marginBottom: 14 }}>
                <ShelfCoin coinUrl={task.coin_url} level={shownLevel} size={124} />
              </View>}
              <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 22,
                textAlign: 'center', textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 0.1 }}>{task.name}</Text>
              {coinUnavailable && <Text style={{ color: '#e4f7ff', fontFamily: 'Knockout',
                fontSize: 16, textAlign: 'center', marginTop: 12 }}>
                Upgrade details are unavailable right now. Queue games are still ready to play.
              </Text>}
              {!coinUnavailable && <View style={{ backgroundColor: '#ffcf3b', borderRadius: 12,
                borderBottomWidth: 4, borderBottomColor: '#d99a00',
                paddingHorizontal: 15, paddingVertical: 8, marginTop: 12 }}>
                <Text style={{ fontFamily: 'Shark', color: '#05346e', fontSize: 17 }}>
                  {knownLevel ? coinLevelLabel(shownLevel).toUpperCase() : 'COLLECTED'}
                </Text>
              </View>}
              {!coinUnavailable && typeof timesCompleted === 'number' && <View style={{ flexDirection: 'row',
                alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 17 }}>
                <GameIcon name="ride" size={22} />
                <Text style={{ fontFamily: 'Knockout', color: '#e4f7ff', fontSize: 17 }}>
                  Collected {timesCompleted} {timesCompleted === 1 ? 'time' : 'times'}
                </Text>
              </View>}
              {coinUnavailable && onPlayInLine && <Pressable accessibilityRole="button"
                accessibilityLabel={`Play LinePlay for ${task.name}`}
                onPress={() => { setPlayAfterClose(true); setVisible(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffcf3b',
                  borderRadius: 12, borderBottomWidth: 4, borderBottomColor: '#d99a00',
                  paddingVertical: 12, paddingHorizontal: 20, marginTop: 18, marginBottom: 12 }}>
                <GameIcon name="queue" size={24} />
                <Text style={{ fontFamily: 'Shark', color: '#05346e', fontSize: 18 }}>Play in Line</Text>
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
          // The upgraded coin goes back to its slot and ignites there.
          if (upgradedDuringVisit.current) {
            upgradedDuringVisit.current = false;
            setTimeout(() => { if (mounted.current) setUpgradedKey(value => value + 1); }, 260);
          }
          fetchCoin(true).then((updated) => {
            if (updated && mounted.current) setRideCoin(updated);
          }).catch(() => undefined);
        }}
        onLevelUp={async (id) => {
          if (!rideCoin) return false;
          try {
            const result = await levelUpRideCoin(id, rideCoin.current_level);
            const ok = result.success && result.ride_coin.current_level > rideCoin.current_level;
            if (ok) {
              upgradedDuringVisit.current = true;
              if (player?.id) upsertCoin(player.id, result.ride_coin);
            }
            // The reply carries the v2 reveal (unlocks, level-up XP) for the sheet.
            return ok ? result : false;
          } catch (error) {
            // A response can be lost after the atomic upgrade commits. Read it
            // back before offering a retry of the same expected level.
            try {
              const latest = await fetchCoin(true);
              if (latest && latest.id === id && latest.current_level > rideCoin.current_level) {
                upgradedDuringVisit.current = true;
                return true;
              }
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
          if (saved && player?.id) setFeaturedCoin(player.id, assetId);
          if (saved) await refreshPlayer().catch(() => undefined);
          return saved;
        }}
        onPlayInLine={onPlayInLine}
      />}
    </>
  );
}
