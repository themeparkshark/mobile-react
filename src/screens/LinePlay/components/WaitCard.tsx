/**
 * WaitCard — compact top card for a LinePlay session.
 * Shows ride name, posted wait, live elapsed, and a passive-accrual readout.
 * Park-themed art slot (image_url) with a graceful gradient fallback.
 */

import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, shadows } from '../../../design-system';
import type { AccrualDisplay } from '../../../services/lineplay/LinePlaySession';

export interface WaitCardProps {
  readonly rideName: string;
  readonly postedWaitMinutes: number;
  readonly elapsedSeconds: number;
  readonly accrual: AccrualDisplay;
  readonly imageUrl?: string | null;
  readonly paused: boolean;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WaitCard({
  rideName,
  postedWaitMinutes,
  elapsedSeconds,
  accrual,
  imageUrl,
  paused,
}: WaitCardProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.artWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.art} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[colors.secondary, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.art}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(10,22,40,0.9)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.rideName} numberOfLines={1}>
          {rideName}
        </Text>

        <View style={styles.statsRow}>
          <Stat label="Posted" value={`${postedWaitMinutes}m`} />
          <View style={styles.divider} />
          <Stat label="Elapsed" value={fmt(elapsedSeconds)} accent />
          <View style={styles.divider} />
          <Stat label="Earned" value={`+${accrual.estimatedEnergy}⚡`} />
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${Math.round(accrual.progressToNextTick * 100)}%` }]}
          />
        </View>
        <Text style={styles.progressHint}>
          {paused ? 'Paused — line is moving' : 'Earning while you wait'}
        </Text>
      </View>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: borderRadius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.bgMedium,
    ...shadows.lg,
  },
  artWrap: {
    height: 96,
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    padding: spacing.lg,
    marginTop: -24,
  },
  rideName: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  statValueAccent: {
    color: colors.tertiary,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.secondary,
  },
  progressHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
