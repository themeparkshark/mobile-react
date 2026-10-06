import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import shortenNumber from '../../helpers/shorten-number';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { useHelp } from '../help/HelpProvider';
import { glossaryKeyForName } from '../../services/help/glossary';

interface CurrencyProps {
  /** Remote icon URL or a bundled require(); falls back to the gold coin. */
  image?: string | number | null;
  count: number;
  name?: string;
  flyTarget?: string;
}

const FALLBACK_ICON = require('../../../assets/images/coingold.png');

export default function Currency({ image, count, name, flyTarget }: CurrencyProps) {
  const { registerTarget } = useCurrencyFly();
  const containerRef = useRef<View>(null);

  const measureAndRegister = useCallback(() => {
    if (flyTarget && containerRef.current) {
      containerRef.current.measureInWindow((x, y, width, height) => {
        if (x !== undefined && y !== undefined) {
          registerTarget(flyTarget, x + width / 2, y + height / 2);
        }
      });
    }
  }, [flyTarget, registerTarget]);
  const [displayCount, setDisplayCount] = useState(count);
  const [showTooltip, setShowTooltip] = useState(false);
  const prevCount = useRef(count);
  
  // Tooltip animation
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.8)).current;
  
  // Idle pulse animation (gentle breathing)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Bounce animation for value changes
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  // Idle pulse disabled - was causing distracting flashing
  // useEffect(() => {
  //   const pulse = Animated.loop(
  //     Animated.sequence([
  //       Animated.timing(pulseAnim, {
  //         toValue: 1.08,
  //         duration: 1500,
  //         useNativeDriver: true,
  //       }),
  //       Animated.timing(pulseAnim, {
  //         toValue: 1,
  //         duration: 1500,
  //         useNativeDriver: true,
  //       }),
  //     ])
  //   );
  //   pulse.start();
  //   return () => pulse.stop();
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
  
  // Bounce + tick animation when value changes
  useEffect(() => {
    if (prevCount.current !== count) {
      const increased = count > prevCount.current;
      
      // Bounce the icon
      Animated.sequence([
        Animated.parallel([
          // Pop up
          Animated.spring(bounceAnim, {
            toValue: 1.25,
            friction: 3,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: increased ? -8 : 4,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
        // Settle back
        Animated.parallel([
          Animated.spring(bounceAnim, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
      
      // Animate number tick (if increase)
      if (increased && count - prevCount.current <= 50) {
        // Tick up for small changes
        const start = prevCount.current;
        const end = count;
        const duration = 400;
        const startTime = Date.now();
        
        const tick = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(start + (end - start) * eased);
          setDisplayCount(current);
          
          if (progress < 1) {
            requestAnimationFrame(tick);
          }
        };
        tick();
      } else {
        setDisplayCount(count);
      }
      
      prevCount.current = count;
    }
  }, [count]);
  
  // Sync display if count changes externally without animation
  useEffect(() => {
    if (displayCount !== count && prevCount.current === count) {
      setDisplayCount(count);
    }
  }, [count, displayCount]);

  const { explain, glossary } = useHelp();
  const term = glossaryKeyForName(name);
  // Known currencies open the "What's this?" sheet; anything else keeps the name tooltip.
  const handlePress = () => {
    if (term) { explain(term, { count }); return; }
    setShowTooltip(prev => !prev);
  };
  const label = term ? glossary[term].label : name || 'Your stuff';

  return (
    <View style={styles.container} ref={containerRef} onLayout={measureAndRegister}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} accessibilityRole="button"
        accessibilityLabel={`${label}: ${count.toLocaleString()}`} accessibilityHint={term ? 'Tells you what this is and how to get more' : undefined}>
        <View style={styles.currencyRow}>
          <Animated.View
            style={{
              position: 'absolute',
              left: -18,
              top: -5,
              transform: [
                { scale: Animated.multiply(pulseAnim, bounceAnim) },
                { translateY: translateY },
              ],
            }}
          >
            <Image
              source={typeof image === 'number' ? image : image ? { uri: image } : FALLBACK_ICON}
              placeholder={FALLBACK_ICON}
              style={styles.icon}
              contentFit="contain"
            />
          </Animated.View>
          <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
            {shortenNumber(displayCount)}
          </Text>
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
          <Text style={styles.tooltipName}>{name || 'Your stuff'}</Text>
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
  // Every balance wears the same pill: icon riding the left edge, number
  // centered in a navy capsule, so the bar reads as one tidy set.
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    minWidth: 72,
    marginLeft: 14,
    paddingLeft: 24,
    paddingRight: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(3, 36, 82, 0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  icon: {
    width: 36,
    height: 36,
  },
  countText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    color: 'white',
    fontFamily: 'Shark',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, .5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
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
