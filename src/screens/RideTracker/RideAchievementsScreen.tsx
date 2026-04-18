import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getRideAchievements, RideAchievementType } from '../../api/endpoints/player-rides';
import { colors } from '../../design-system';

// ─── Achievement Card ───
interface AchievementCardProps {
  achievement: RideAchievementType;
}
const AchievementCard: React.FC<AchievementCardProps> = React.memo(({ achievement }) => {
  const unlocked = achievement.unlocked;
  return (
    <View style={[styles.card, !unlocked && styles.cardLocked]}>
      <Text style={[styles.cardIcon, !unlocked && styles.iconLocked]}>
        {unlocked ? achievement.icon : '🔒'}
      </Text>
      <View style={styles.cardContent}>
        <Text style={[styles.cardName, !unlocked && styles.textLocked]}>{achievement.name}</Text>
        <Text style={[styles.cardDesc, !unlocked && styles.textLocked]}>{achievement.description}</Text>
        {unlocked && achievement.unlocked_at && (
          <Text style={styles.unlockedDate}>
            Unlocked {new Date(achievement.unlocked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        )}
      </View>
    </View>
  );
});
AchievementCard.displayName = 'AchievementCard';

export default function RideAchievementsScreen() {
  const navigation = useNavigation<any>();
  const [achievements, setAchievements] = useState<RideAchievementType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRideAchievements()
      .then(setAchievements)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title}>ACHIEVEMENTS</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Progress */}
          <View style={styles.progressCard}>
            <Text style={styles.progressNum}>{unlocked.length}/{achievements.length}</Text>
            <Text style={styles.progressLabel}>Achievements Unlocked</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${achievements.length ? (unlocked.length / achievements.length) * 100 : 0}%` }]} />
            </View>
          </View>

          {/* Unlocked */}
          {unlocked.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>🏆 UNLOCKED</Text>
              {unlocked.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </>
          )}

          {/* Locked */}
          {locked.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>🔒 LOCKED</Text>
              {locked.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e8f4fd' },
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 16,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '600',
    marginLeft: -2,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontWeight: '700', 
    fontFamily: 'Shark',
    letterSpacing: 2,
  },
  content: { padding: 16, paddingBottom: 60 },
  progressCard: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 20, 
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  progressNum: { 
    color: '#09268f', 
    fontSize: 36, 
    fontWeight: '800', 
    fontFamily: 'Shark' 
  },
  progressLabel: { color: '#475569', fontSize: 14, marginTop: 4 },
  progressBar: { 
    width: '100%', 
    height: 8, 
    backgroundColor: '#e8f4fd', 
    borderRadius: 4, 
    marginTop: 12, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#fec90e', 
    borderRadius: 4 
  },
  sectionTitle: { 
    color: '#1a1a2e', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 12, 
    marginTop: 16, 
    fontFamily: 'Knockout',
    letterSpacing: 2,
  },
  card: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 14, 
    backgroundColor: '#FFFFFF',
    borderRadius: 16, 
    padding: 14, 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLocked: { opacity: 0.6 },
  cardIcon: { fontSize: 36 },
  iconLocked: { opacity: 0.5 },
  cardContent: { flex: 1 },
  cardName: { 
    color: '#1a1a2e', 
    fontSize: 15, 
    fontWeight: '700' 
  },
  cardDesc: { color: '#475569', fontSize: 13, marginTop: 2 },
  textLocked: { color: '#94a3b8' },
  unlockedDate: { 
    color: '#fec90e', 
    fontSize: 11, 
    marginTop: 4, 
    fontWeight: '600' 
  },
});