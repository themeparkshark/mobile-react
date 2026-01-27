/**
 * Theme Park Shark Design System
 * 
 * This file defines the visual language of the app.
 * Every color, spacing, shadow, and style should reference these values
 * to ensure consistency across all screens.
 */

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Brand
  primary: '#09268f',       // Deep blue - main brand color
  secondary: '#00a5f5',     // Bright blue - accents
  tertiary: '#fec90e',      // Golden yellow - CTAs, highlights
  
  // Backgrounds
  bgDark: '#0a1628',        // Darkest background
  bgMedium: '#142040',      // Card backgrounds
  bgLight: '#1a2a50',       // Elevated elements
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.5)',
  
  // Rarity colors (with glow variants)
  rarity: {
    common: {
      main: '#4CAF50',
      glow: 'rgba(76, 175, 80, 0.4)',
    },
    uncommon: {
      main: '#00a5f5',
      glow: 'rgba(0, 165, 245, 0.4)',
    },
    rare: {
      main: '#9C27B0',
      glow: 'rgba(156, 39, 176, 0.4)',
    },
    epic: {
      main: '#FF6B00',
      glow: 'rgba(255, 107, 0, 0.4)',
    },
    legendary: {
      main: '#FFD700',
      glow: 'rgba(255, 215, 0, 0.5)',
    },
  },
  
  // Feedback
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  info: '#2196F3',
  
  // Weather
  weather: {
    sunny: '#FFD700',
    rainy: '#6B8EAE',
    cloudy: '#9E9E9E',
    snowy: '#E3F2FD',
    hot: '#FF5722',
    cold: '#03A9F4',
  },
  
  // Time of day
  time: {
    morning: '#FFB74D',
    afternoon: '#64B5F6',
    evening: '#FF7043',
    night: '#5C6BC0',
  },
};

// =============================================================================
// RARITY CONFIG
// =============================================================================

export const rarityConfig = {
  1: { name: 'Common', color: colors.rarity.common.main, glow: colors.rarity.common.glow },
  2: { name: 'Uncommon', color: colors.rarity.uncommon.main, glow: colors.rarity.uncommon.glow },
  3: { name: 'Rare', color: colors.rarity.rare.main, glow: colors.rarity.rare.glow },
  4: { name: 'Epic', color: colors.rarity.epic.main, glow: colors.rarity.epic.glow },
  5: { name: 'Legendary', color: colors.rarity.legendary.main, glow: colors.rarity.legendary.glow },
};

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Knockout is the brand font
  fontFamily: {
    brand: 'Knockout',
    body: 'System',
  },
  
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 48,
  },
  
  // Pre-built text styles
  styles: {
    displayLarge: {
      fontFamily: 'Knockout',
      fontSize: 48,
      color: colors.textPrimary,
    },
    heading1: {
      fontFamily: 'Knockout',
      fontSize: 32,
      color: colors.textPrimary,
    },
    heading2: {
      fontFamily: 'Knockout',
      fontSize: 24,
      color: colors.textPrimary,
    },
    heading3: {
      fontFamily: 'Knockout',
      fontSize: 20,
      color: colors.textPrimary,
    },
    body: {
      fontFamily: 'System',
      fontSize: 14,
      color: colors.textPrimary,
    },
    bodySmall: {
      fontFamily: 'System',
      fontSize: 12,
      color: colors.textSecondary,
    },
    label: {
      fontFamily: 'Knockout',
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: 'uppercase' as const,
    },
    button: {
      fontFamily: 'Knockout',
      fontSize: 16,
      color: colors.textPrimary,
    },
  },
};

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  // Colored glow shadows
  glow: (color: string, intensity: number = 0.5) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: intensity,
    shadowRadius: 12,
    elevation: 0,
  }),
};

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

// =============================================================================
// ANIMATION DURATIONS
// =============================================================================

export const durations = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  verySlow: 800,
};

// =============================================================================
// Z-INDEX LAYERS
// =============================================================================

export const zIndex = {
  base: 0,
  card: 10,
  sticky: 100,
  modal: 1000,
  toast: 2000,
  tooltip: 3000,
};

// =============================================================================
// COMMON COMPONENT STYLES
// =============================================================================

export const componentStyles = {
  card: {
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  
  button: {
    primary: {
      backgroundColor: colors.tertiary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      ...shadows.sm,
    },
    secondary: {
      backgroundColor: colors.secondary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
    },
  },
  
  input: {
    backgroundColor: colors.bgLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  
  badge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  
  marker: {
    container: {
      width: 60,
      height: 60,
      borderRadius: 30,
      borderWidth: 3,
      borderColor: 'white',
      ...shadows.md,
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const getRarityConfig = (rarity: number) => {
  return rarityConfig[rarity as keyof typeof rarityConfig] || rarityConfig[1];
};

export const getTimeOfDayColor = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return colors.time.morning;
  if (hour >= 11 && hour < 17) return colors.time.afternoon;
  if (hour >= 17 && hour < 21) return colors.time.evening;
  return colors.time.night;
};
