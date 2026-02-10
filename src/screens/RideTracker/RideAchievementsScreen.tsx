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
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Achievements</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
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
              <Text style={styles.sectionTitle}>🏆 Unlocked</Text>
              {unlocked.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </>
          )}

          {/* Locked */}
          {locked.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>🔒 Locked</Text>
              {locked.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', fontFamily: 'Shark' },
  content: { padding: 16, paddingBottom: 60 },
  progressCard: {
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 20, alignItems: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  progressNum: { color: colors.textPrimary, fontSize: 36, fontWeight: '800', fontFamily: 'Shark' },
  progressLabel: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  progressBar: { width: '100%', height: 8, backgroundColor: colors.bgDark, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.tertiary, borderRadius: 4 },
  sectionTitle: { color: colors.tertiary, fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 16, fontFamily: 'Shark' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bgMedium,
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardLocked: { opacity: 0.5 },
  cardIcon: { fontSize: 36 },
  iconLocked: { opacity: 0.4 },
  cardContent: { flex: 1 },
  cardName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  textLocked: { color: colors.textMuted },
  unlockedDate: { color: colors.tertiary, fontSize: 11, marginTop: 4 },
});
