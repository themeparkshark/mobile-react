/**
 * SectionHeader — Stylized section divider with gradient accent line and optional icon.
 * Use to break up screen sections with that polished game UI feel.
 */
import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  title: string;
  icon?: ReactNode;
  /** Right-side accessory (e.g. "See All" button, countdown) */
  right?: ReactNode;
  /** Gradient accent colors */
  accentColors?: [string, string];
  style?: ViewStyle;
}

export default function SectionHeader({
  title,
  icon,
  right,
  accentColors = ['#00c6fb', '#005bea'],
  style,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {/* Gradient accent bar */}
        <LinearGradient
          colors={accentColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.accentBar}
        />

        {icon && <View style={styles.icon}>{icon}</View>}

        <Text style={styles.title}>{title}</Text>

        {right && <View style={styles.right}>{right}</View>}
      </View>

      {/* Subtle gradient line below */}
      <LinearGradient
        colors={[...accentColors, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.line}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: 10,
  },
  icon: {
    marginRight: 8,
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: 'white',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
    flex: 1,
  },
  right: {
    marginLeft: 'auto',
  },
  line: {
    height: 1.5,
    marginTop: 8,
    borderRadius: 1,
  },
});
