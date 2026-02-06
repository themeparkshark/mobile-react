import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, TouchableOpacity, StyleSheet, Easing } from 'react-native';

interface TappableCurrencyProps {
  name: string;
  count: number;
  children: React.ReactNode;
}

export default function TappableCurrency({ name, count, children }: TappableCurrencyProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Tooltip animation
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.8)).current;
  
  // Idle animations (like coins/keys)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  
  // Idle animations disabled - was causing distracting flashing
  // useEffect(() => {
  //   Animated.loop(
  //     Animated.sequence([
  //       Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  //       Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  //     ])
  //   ).start();
  //   Animated.loop(
  //     Animated.sequence([
  //       Animated.timing(glowAnim, { toValue: 0.7, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  //       Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  //     ])
  //   ).start();
  // }, []);
  
  // Show/hide tooltip animation
  useEffect(() => {
    if (showTooltip) {
      Animated.parallel([
        Animated.spring(tooltipAnim, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(tooltipScale, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Auto-hide after 2 seconds
      const timer = setTimeout(() => {
        setShowTooltip(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(tooltipAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(tooltipScale, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showTooltip]);

  const handlePress = () => {
    setShowTooltip(prev => !prev);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        <View>
          {/* Glow removed - was causing distracting yellow border */}
          {children}
        </View>
      </TouchableOpacity>
      
      {/* Tooltip popup */}
      <Animated.View 
        style={[
          styles.tooltip,
          {
            opacity: tooltipAnim,
            transform: [
              { scale: tooltipScale },
              { translateY: tooltipAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-5, 0],
              })},
            ],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.tooltipArrow} />
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipName}>{name}</Text>
          <Text style={styles.tooltipCount}>{count.toLocaleString()}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -60,
    marginTop: 8,
    alignItems: 'center',
    zIndex: 1000,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(0, 0, 0, 0.85)',
    marginBottom: -1,
  },
  tooltipContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  tooltipName: {
    color: '#facc15',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  tooltipCount: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Shark',
  },
});
