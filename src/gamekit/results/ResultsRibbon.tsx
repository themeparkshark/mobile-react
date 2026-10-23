/**
 * ResultsRibbon: Alex's red ribbon with the big results title, the one title
 * every results card shares (the shared card, Sharky Swim). It slams in once
 * (1.25 then settles) and then rests. Reduced motion: it simply appears.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';

const RIBBON = require('../../../assets/images/ribbon.png');

export function ResultsRibbon({ title, reducedMotion = false, style }: {
  title: string;
  reducedMotion?: boolean;
  /** Where the ribbon sits (the shared card hangs it over its top edge). */
  style?: StyleProp<ViewStyle>;
}) {
  const ribbon = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      ribbon.value = 1;
      return undefined;
    }
    ribbon.value = withSequence(
      withTiming(1.25, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 10, stiffness: 260 }),
    );
    return () => cancelAnimation(ribbon);
  }, [reducedMotion, ribbon]);
  const ribbonStyle = useAnimatedStyle(() => ({ transform: [{ scale: ribbon.value }], opacity: ribbon.value > 0 ? 1 : 0 }));
  return (
    <Animated.View style={[styles.wrap, style, ribbonStyle]} accessibilityRole="header" accessibilityLabel={title}>
      <Image source={RIBBON} style={styles.ribbon} contentFit="contain" />
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 74, alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', width: '100%', height: '100%' },
  text: { fontFamily: 'Shark', fontSize: 28, color: '#ffffff', marginTop: -8, paddingHorizontal: 60,
    textShadowColor: '#7a2a12', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});
