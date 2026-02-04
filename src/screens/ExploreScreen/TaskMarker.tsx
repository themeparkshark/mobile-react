import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Text, View, Easing } from 'react-native';
import { Marker } from 'react-native-maps';
import { TaskType } from '../../models/task-type';

export default function TaskMarker({
  task,
  isSelected,
  onPress,
}: {
  readonly task: TaskType;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}) {
  const bounceAnim = useRef(new Animated.Value(1)).current;
  
  // Bounce animation when tapped
  useEffect(() => {
    if (isSelected) {
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.15,
          duration: 100,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isSelected]);

  const expiresAt = task.active_to ? new Date(task.active_to + 'Z') : null;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;

  return (
    <Marker
      coordinate={{
        latitude: Number(task.latitude),
        longitude: Number(task.longitude),
      }}
      onPress={onPress}
      stopPropagation={true}
      tracksViewChanges={isSelected}
    >
      <View style={{ width: 120, height: 120, position: 'relative' }}>
        {/* Tooltip above marker */}
        {isSelected && (
          <View style={{
            position: 'absolute',
            bottom: 115,
            left: -20,
            right: -20,
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: 'white',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            }}>
              <Text style={{ fontFamily: 'Shark', fontSize: 15, color: '#333', textAlign: 'center' }}>
                {task.name}
              </Text>
              {minsLeft !== null && (
                <Text style={{ fontSize: 13, color: minsLeft < 5 ? '#ef4444' : '#888', textAlign: 'center', marginTop: 3 }}>
                  ⏱️ {minsLeft}m left
                </Text>
              )}
            </View>
            {/* Triangle pointer */}
            <View style={{
              width: 0,
              height: 0,
              borderLeftWidth: 6,
              borderRightWidth: 6,
              borderTopWidth: 6,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: 'white',
            }} />
          </View>
        )}
        
        {/* Task building with bounce */}
        <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
          <Image
            source={require('../../../assets/images/screens/explore/task_animation.gif')}
            style={{
              width: 120,
              height: 120,
            }}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </Marker>
  );
}
