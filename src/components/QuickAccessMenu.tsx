import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from '../helpers/haptics';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as RootNavigation from '../RootNavigation';
import config from '../config';
import { playSfx } from '../gamekit/SFX';
import { BRAND, GameIcon, type GameIconName } from '../ui';

interface MenuItem {
  id: string;
  label: string;
  icon: GameIconName;
  color: string;
  screen: string;
  params?: object;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'sets',
    label: 'Collections',
    icon: 'chest',
    color: '#FF9800',
    screen: 'SetCollection',
  },
  {
    id: 'stamps',
    label: 'Stamp Book',
    icon: 'medal1',
    color: '#4CAF50',
    screen: 'StampBook',
  },
  {
    id: 'shop',
    label: 'Shark Shop',
    icon: 'coins',
    color: '#0b7fd1',
    screen: 'Store',
    params: { store: 'shark-shop' },
  },
  {
    id: 'help',
    label: 'How to Play',
    icon: 'info',
    color: '#0768b9',
    screen: 'HowToPlay',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    color: '#3d5f8c',
    screen: 'Settings',
  },
];

const LABEL = {
  backgroundColor: BRAND.white,
  paddingHorizontal: 14,
  paddingVertical: 7,
  borderRadius: 14,
  borderWidth: 2,
  borderColor: BRAND.sky,
  shadowColor: BRAND.shadow,
  shadowOffset: { width: 0, height: 3 },
  shadowRadius: 5,
  shadowOpacity: 0.25,
} as const;
const LABEL_TEXT = { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy } as const;

interface Props {
  position?: 'left' | 'right';
}

/**
 * Quick Access floating menu for navigating to collection screens.
 * Inspired by iOS control center / Android FAB menus.
 */
export default function QuickAccessMenu({ position = 'right' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(
    MENU_ITEMS.map(() => ({
      translateY: new Animated.Value(50),
      opacity: new Animated.Value(0),
    }))
  ).current;

  // Toggle menu
  const toggleMenu = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    playSfx(isOpen ? 'ui.modalClose' : 'fx.whoosh', 0.45);
    setIsOpen(!isOpen);
  };

  // Animate menu open/close
  useEffect(() => {
    if (isOpen) {
      // Open animations
      Animated.parallel([
        Animated.spring(rotateAnim, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        ...itemAnims.map((anim, index) => 
          Animated.sequence([
            Animated.delay(index * 50),
            Animated.parallel([
              Animated.spring(anim.translateY, {
                toValue: 0,
                friction: 5,
                tension: 90,
                useNativeDriver: true,
              }),
              Animated.timing(anim.opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]),
          ])
        ),
      ]).start();
    } else {
      // Close animations
      Animated.parallel([
        Animated.spring(rotateAnim, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        ...itemAnims.map((anim) =>
          Animated.parallel([
            Animated.timing(anim.translateY, {
              toValue: 50,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.timing(anim.opacity, {
              toValue: 0,
              duration: 100,
              useNativeDriver: true,
            }),
          ])
        ),
      ]).start();
    }
  }, [isOpen]);

  // Handle menu item press
  const handleItemPress = (item: MenuItem) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    playSfx('ui.tap', 0.6);
    setIsOpen(false);
    RootNavigation.navigate(item.screen, item.params);
  };

  // Icon rotation
  const iconRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const isRight = position === 'right';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 98,
          }}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: 'rgba(5, 52, 110, 0.55)',
              opacity: bgOpacity,
            }}
          />
        </TouchableOpacity>
      )}

      {/* Menu container - box-none lets touches pass through empty space */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          bottom: 100,
          [isRight ? 'right' : 'left']: 16,
          zIndex: 99,
          alignItems: isRight ? 'flex-end' : 'flex-start',
        }}
      >
        {/* Menu items - pointerEvents none when closed to prevent ghost touches */}
        {MENU_ITEMS.map((item, index) => (
          <Animated.View
            key={item.id}
            pointerEvents={isOpen ? 'auto' : 'none'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 12,
              opacity: itemAnims[index].opacity,
              transform: [{ translateY: itemAnims[index].translateY }],
            }}
          >
            {/* Label (left of button if right-positioned) */}
            {isRight && (
              <View
                style={[LABEL, { marginRight: 10 }]}
              >
                <Text style={LABEL_TEXT}>
                  {item.label}
                </Text>
              </View>
            )}

            {/* Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={item.label}
              activeOpacity={0.8}
              onPress={() => handleItemPress(item)}
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: BRAND.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 6,
                shadowOpacity: 0.35,
                borderWidth: 3,
                borderColor: 'white',
              }}
            >
              <LinearGradient colors={['#ffffff', item.color]} start={{ x: 0.5, y: -0.6 }} end={{ x: 0.5, y: 0.9 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
              <GameIcon name={item.icon} size={38} />
            </TouchableOpacity>

            {/* Label (right of button if left-positioned) */}
            {!isRight && (
              <View
                style={[LABEL, { marginLeft: 10 }]}
              >
                <Text style={LABEL_TEXT}>
                  {item.label}
                </Text>
              </View>
            )}
          </Animated.View>
        ))}

        {/* Main FAB button */}
        <TouchableOpacity
          onPress={toggleMenu}
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: isOpen ? config.red : config.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 4 },
            shadowRadius: 6,
            shadowOpacity: 0.4,
            borderWidth: 3,
            borderColor: 'white',
          }}
        >
          <Animated.View
            style={{
              transform: [{ rotate: iconRotate }],
            }}
          >
            <FontAwesomeIcon 
              icon={isOpen ? faTimes : faBars} 
              size={26} 
              color="white" 
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}
