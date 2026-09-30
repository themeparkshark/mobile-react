import { useContext, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { AuthContext } from '../context/AuthProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import api from '../api/client';
import config from '../config';
import * as Haptics from '../helpers/haptics';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import { GameButton, GameIcon, GameRichText, SharkLoader } from '../ui';

interface CenterData {
  id: number;
  name: string;
  available_gifts: number;
  can_give: boolean;
  can_claim: boolean;
  give_cooldown_remaining: number;
  claim_cooldown_remaining: number;
}

interface Props {
  visible: boolean;
  center: CenterData | null;
  onClose: () => void;
  onAction: () => void; // Refresh after action
}

export default function CommunityCenterModal({
  visible,
  center,
  onClose,
  onAction,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: 'give' | 'claim';
    success: boolean;
    message: string;
    ticketsEarned?: number;
    giverName?: string;
  } | null>(null);
  
  const { player, refreshPlayer } = useContext(AuthContext);
  const { triggerFly } = useCurrencyFly();

  const handleGive = async () => {
    if (!center) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/community-centers/${center.id}/give`);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Fly tickets animation (would need ticket icon URL)
      // triggerFly({ ... })
      
      setResult({
        type: 'give',
        success: true,
        message: response.data.message,
        ticketsEarned: 2,
      });
      
      refreshPlayer?.();
      onAction();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResult({
        type: 'give',
        success: false,
        message: error.response?.data?.error || 'Failed to leave gift',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!center) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/community-centers/${center.id}/claim`);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      setResult({
        type: 'claim',
        success: true,
        message: response.data.message,
        ticketsEarned: 1,
        giverName: response.data.giver_name,
      });
      
      refreshPlayer?.();
      onAction();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResult({
        type: 'claim',
        success: false,
        message: error.response?.data?.error || 'Failed to claim gift',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  if (!center) return null;

  const hasEnoughCoins = (player?.coins ?? 0) >= 350;

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={handleClose}
      animationIn="zoomIn"
      animationOut="zoomOut"
    >
      <View style={styles.container}>
        <Ribbon text="Community Center" />
        
        <View style={styles.content}>
          {/* Result View */}
          {result ? (
            <View style={styles.resultContainer}>
              <GameIcon name={result.success ? (result.type === 'give' ? 'gift' : 'chestOpen') : 'info'} size={72}
                style={{ marginBottom: 10 }} />
              <Text style={[
                styles.resultTitle,
                !result.success && styles.resultTitleError,
              ]}>
                {result.success ? 'Success!' : 'Oops!'}
              </Text>
              <GameRichText preset="body" tone="onBlue" style={styles.resultMessage}>{result.message}</GameRichText>
              
              {result.success && result.ticketsEarned && (
                <View style={[styles.rewardBadge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                  <Text style={styles.rewardText}>+{result.ticketsEarned}</Text>
                  <GameIcon name="ticket" size={30} />
                </View>
              )}
              
              <GameButton label="Awesome!" onPress={handleClose} size="compact" />
            </View>
          ) : (
            <>
              {/* Header */}
              <Text style={styles.title}>{center.name}</Text>
              
              {/* Gift Count */}
              <View style={[styles.giftCount, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
                <GameIcon name="gift" size={26} style={center.available_gifts > 0 ? undefined : { opacity: 0.45 }} />
                <Text style={styles.giftCountText}>
                  {center.available_gifts > 0
                    ? `${center.available_gifts} gift${center.available_gifts > 1 ? 's' : ''} waiting!`
                    : 'No gifts right now'}
                </Text>
              </View>
              
              {/* Actions */}
              <View style={styles.actions}>
                {/* Give Section */}
                <View style={styles.actionSection}>
                  <Text style={styles.actionTitle}>Leave a Gift</Text>
                  <GameRichText preset="bodySmall" tone="onBlue" style={styles.actionDesc}>
                    {'Costs 350 [icon:coin]\nGet 2 [icon:ticket]'}
                  </GameRichText>
                  
                  {center.can_give ? (
                    hasEnoughCoins ? (
                      <YellowButton
                        text={loading ? 'Leaving...' : 'Leave Gift'}
                        onPress={handleGive}
                        disabled={loading}
                      />
                    ) : (
                      <Text style={styles.disabledText}>
                        Need 350 coins ({player?.coins ?? 0} available)
                      </Text>
                    )
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <GameIcon name="timer" size={20} />
                      <Text style={styles.cooldownText}>Wait {center.give_cooldown_remaining}m</Text>
                    </View>
                  )}
                </View>
                
                {/* Divider */}
                <View style={styles.divider} />
                
                {/* Claim Section */}
                <View style={styles.actionSection}>
                  <Text style={styles.actionTitle}>Claim a Gift</Text>
                  <GameRichText preset="bodySmall" tone="onBlue" style={styles.actionDesc}>
                    {'Get 1 [icon:ticket]'}
                  </GameRichText>
                  
                  {center.available_gifts > 0 ? (
                    center.can_claim ? (
                      <YellowButton
                        text={loading ? 'Claiming...' : 'Claim Gift'}
                        onPress={handleClaim}
                        disabled={loading}
                      />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <GameIcon name="timer" size={20} />
                        <Text style={styles.cooldownText}>Wait {center.claim_cooldown_remaining}m</Text>
                      </View>
                    )
                  ) : (
                    <Text style={styles.disabledText}>No gifts to claim</Text>
                  )}
                </View>
              </View>
              
              {loading && (
                <SharkLoader compact style={styles.loader} />
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#0a77bf',
    borderRadius: 20,
    marginTop: -20,
    width: '90%',
    padding: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  giftCount: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  giftCountText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
  },
  actions: {
    gap: 16,
  },
  actionSection: {
    alignItems: 'center',
    gap: 8,
  },
  actionTitle: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#ffe07a',
  },
  actionDesc: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 8,
  },
  cooldownText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fbbf24',
    marginTop: 8,
  },
  disabledText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 8,
  },
  loader: {
    marginTop: 16,
  },
  resultContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  resultEmoji: {
    fontSize: 60,
    marginBottom: 12,
  },
  resultTitle: {
    fontFamily: 'Shark',
    fontSize: 28,
    color: '#ffe07a',
    marginBottom: 8,
  },
  resultTitleError: {
    color: '#ef4444',
  },
  resultMessage: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 16,
  },
  rewardBadge: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 20,
  },
  rewardText: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#05346e',
  },
  doneButton: {
    backgroundColor: '#ffcf3b',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  doneButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
  },
});
