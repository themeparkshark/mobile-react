import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, BounceIn } from 'react-native-reanimated';
import { attackGym } from '../../api/endpoints/gym-battle';

const { width: SCREEN_W } = Dimensions.get('window');

const TEAM_COLORS = {
  mouse: '#3B82F6',
  globe: '#EF4444',
  shark: '#F59E0B',
};

const TEAM_EMOJIS = {
  mouse: '🐭',
  globe: '🌍',
  shark: '🦈',
};

const TEAM_NAMES = {
  mouse: 'Team Mouse',
  globe: 'Team Globe',
  shark: 'Team Shark',
};

interface Props {
  visible: boolean;
  parkId: number;
  playerTeam: 'mouse' | 'globe' | 'shark';
  scores: { mouse: number; globe: number; shark: number };
  onComplete: () => void;
  onClose: () => void;
}

type AttackState = 'select' | 'attacking' | 'success' | 'error';

export default function SwordAttackModal({
  visible,
  parkId,
  playerTeam,
  scores,
  onComplete,
  onClose,
}: Props) {
  const [state, setState] = useState<AttackState>('select');
  const [result, setResult] = useState<{ message: string; damage: number; swordsLeft: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enemyTeams = (['mouse', 'globe', 'shark'] as const).filter(t => t !== playerTeam);

  const handleAttack = async (targetTeam: 'mouse' | 'globe' | 'shark') => {
    setState('attacking');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const response = await attackGym(parkId, targetTeam);
      setResult({
        message: response.message,
        damage: response.damage,
        swordsLeft: response.swords_remaining,
      });
      setState('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Attack failed!');
      setState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleClose = () => {
    if (state === 'success') {
      onComplete();
    } else {
      onClose();
    }
    // Reset state
    setState('select');
    setResult(null);
    setError(null);
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={state === 'select' ? handleClose : undefined}
      backdropOpacity={0.9}
      style={styles.modal}
    >
      <View style={styles.container}>
        <View style={styles.gradient}>
          {/* Select Target */}
          {state === 'select' && (
            <Animated.View entering={FadeIn} style={styles.content}>
              <Text style={styles.title}>⚔️ ATTACK! ⚔️</Text>
              <Text style={styles.subtitle}>Choose a team to attack!</Text>
              <Text style={styles.cost}>Cost: ⚔️ 2 swords</Text>
              <Text style={styles.damage}>-100 points to target</Text>

              <View style={styles.targets}>
                {enemyTeams.map((team) => (
                  <TouchableOpacity
                    key={team}
                    style={[styles.targetButton, { borderColor: TEAM_COLORS[team] }]}
                    onPress={() => handleAttack(team)}
                    disabled={scores[team] <= 0}
                  >
                    <Text style={styles.targetEmoji}>{TEAM_EMOJIS[team]}</Text>
                    <Text style={styles.targetName}>{TEAM_NAMES[team]}</Text>
                    <Text style={[styles.targetScore, { color: TEAM_COLORS[team] }]}>
                      {scores[team].toLocaleString()} pts
                    </Text>
                    {scores[team] <= 0 && (
                      <Text style={styles.noPoints}>No points to attack!</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Attacking */}
          {state === 'attacking' && (
            <View style={styles.content}>
              <Text style={styles.attackingText}>⚔️ Attacking...</Text>
            </View>
          )}

          {/* Success */}
          {state === 'success' && result && (
            <Animated.View entering={BounceIn} style={styles.content}>
              <Text style={styles.successEmoji}>💥</Text>
              <Text style={styles.successTitle}>DIRECT HIT!</Text>
              <Text style={styles.resultMessage}>{result.message}</Text>
              <Text style={styles.swordsLeft}>
                Swords remaining: ⚔️ {result.swordsLeft}
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>NICE!</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Error */}
          {state === 'error' && (
            <View style={styles.content}>
              <Text style={styles.errorEmoji}>😢</Text>
              <Text style={styles.errorTitle}>Attack Failed!</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_W - 40,
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    padding: 24,
    backgroundColor: '#0F172A',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 4,
  },
  cost: {
    fontSize: 16,
    color: '#FBBF24',
    fontWeight: '800',
    marginBottom: 4,
  },
  damage: {
    fontSize: 14,
    color: '#F87171',
    fontWeight: '700',
    marginBottom: 20,
  },
  targets: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  targetButton: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  targetEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  targetName: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
  },
  targetScore: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  noPoints: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#64748B',
    fontSize: 16,
  },
  attackingText: {
    fontSize: 24,
    color: '#EF4444',
    fontWeight: '700',
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#EF4444',
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 12,
  },
  swordsLeft: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F87171',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
  },
  doneButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  doneText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
});
