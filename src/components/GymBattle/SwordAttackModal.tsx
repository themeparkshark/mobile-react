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
import { battleHUDEvents } from './battleHUDEvents';
import { Image } from 'expo-image';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { GameIcon, GameRichText } from '../../ui';
import { friendlyActionError } from '../../services/match/matchLink';

const { width: SCREEN_W } = Dimensions.get('window');

const TEAM_COLORS: Record<TeamId, string> = { mouse: TEAMS.mouse.color, globe: TEAMS.globe.color, shark: TEAMS.shark.color };

const TEAM_NAMES = { get mouse() { return teamName('mouse'); }, get globe() { return teamName('globe'); }, get shark() { return teamName('shark'); } };

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
      battleHUDEvents.emit(); // Refresh BattleHUD scores immediately
    } catch (err: any) {
      setError(friendlyActionError(err, 'Attack failed!'));
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><GameIcon name="swords" size={30} /><Text style={styles.title}>ATTACK!</Text></View>
              <Text style={styles.subtitle}>Choose a team to attack!</Text>
              <GameRichText tone="onBlue" style={styles.cost}>{'Cost: [icon:swords] 2 swords'}</GameRichText>
              <Text style={styles.damage}>-100 points to target</Text>

              <View style={styles.targets}>
                {enemyTeams.map((team) => (
                  <TouchableOpacity
                    key={team}
                    style={[styles.targetButton, { borderColor: TEAM_COLORS[team] }]}
                    onPress={() => handleAttack(team)}
                    disabled={scores[team] <= 0}
                  >
                    <Image source={TEAMS[team].badge} style={{ width: 40, height: 40, marginBottom: 4 }} contentFit="contain" />
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
              <Text style={styles.attackingText}>Attacking...</Text>
            </View>
          )}

          {/* Success */}
          {state === 'success' && result && (
            <Animated.View entering={BounceIn} style={styles.content}>
              <GameIcon name="swords" size={64} />
              <Text style={styles.successTitle}>DIRECT HIT!</Text>
              <Text style={styles.resultMessage}>{result.message}</Text>
              <Text style={styles.swordsLeft}>
                Swords remaining: {result.swordsLeft}
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>NICE!</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Error */}
          {state === 'error' && (
            <View style={styles.content}>
              
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
    backgroundColor: '#0768b9',
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
    backgroundColor: 'rgba(5, 70, 143, 0.5)',
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
