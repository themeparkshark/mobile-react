import dayjs from 'dayjs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Magnetometer } from 'expo-sensors';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LocationContext } from '../context/LocationProvider';
import { RedeemablesType } from '../models/redeemables-type';
import Coin from '../screens/ExploreScreen/Coin';
import Key from '../screens/ExploreScreen/Key';
import Redeemable from '../screens/ExploreScreen/Redeemable';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FOV_DEGREES = 65;
const HALF_FOV = FOV_DEGREES / 2;
const MAX_RENDER_DISTANCE = 300;
const FADE_START_DISTANCE = 150;
const MAX_VISIBLE_MARKERS = 20;
const BASE_MARKER_SIZE = 60;
const REDEEM_RANGE_M = 30;

// Compass cardinal directions
const COMPASS_POINTS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
];

interface ARViewProps {
  readonly redeemables: RedeemablesType;
  readonly onRefresh: () => void;
}

interface ARMarker {
  id: string;
  type: string;
  latitude: number;
  longitude: number;
  bearing: number;
  distance: number;
  data: any;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getHeadingFromMagnetometer(x: number, y: number): number {
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  angle = (angle + 360) % 360;
  let heading = 0;
  if (Platform.OS === 'ios') {
    heading = (90 - angle + 360) % 360;
  } else {
    heading = (360 - angle) % 360;
  }
  return heading;
}

// Normalize angle difference to [-180, 180]
function angleDiff(a: number, b: number): number {
  let d = a - b;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Logarithmic scale for distance-based sizing
function distanceScale(distance: number): number {
  if (distance <= 10) return 1.4;
  if (distance >= 250) return 0.25;
  // Inverse log scaling
  const t = Math.log(distance / 10) / Math.log(250 / 10);
  return 1.4 - t * 1.15;
}

// Distance-based opacity for depth cue
function distanceOpacity(distance: number): number {
  if (distance <= FADE_START_DISTANCE) return 1;
  if (distance >= MAX_RENDER_DISTANCE) return 0.15;
  const t = (distance - FADE_START_DISTANCE) / (MAX_RENDER_DISTANCE - FADE_START_DISTANCE);
  return 1 - t * 0.85;
}

// Vertical position: close objects lower on screen, far objects near horizon
function verticalPosition(distance: number): number {
  // Horizon line at ~40% from top
  const horizonY = SCREEN_HEIGHT * 0.4;
  // Close objects at ~70% from top, far objects at horizon
  if (distance <= 10) return SCREEN_HEIGHT * 0.7;
  if (distance >= 250) return horizonY;
  const t = Math.log(distance / 10) / Math.log(250 / 10);
  return SCREEN_HEIGHT * 0.7 - t * (SCREEN_HEIGHT * 0.7 - horizonY);
}

// Floating animation component
function FloatingMarker({ children, inRange }: { children: React.ReactNode; inRange: boolean }) {
  const bobAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: -6,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 6,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    bobLoop.start();
    return () => bobLoop.stop();
  }, [bobAnim]);

  useEffect(() => {
    if (inRange) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [inRange, pulseAnim]);

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: bobAnim },
          { scale: pulseAnim },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function ARView({ redeemables, onRefresh }: ARViewProps) {
  const { location } = useContext(LocationContext);
  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState<number>(0);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const smoothedHeadingRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const cameraPermission = permission?.granted ?? null;

  // Request permission on mount
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Magnetometer subscription with smoothing
  useEffect(() => {
    Magnetometer.setUpdateInterval(50);
    const sub = Magnetometer.addListener((data) => {
      const raw = getHeadingFromMagnetometer(data.x, data.y);
      const prev = smoothedHeadingRef.current;
      let delta = angleDiff(raw, prev);

      // Skip tiny changes
      if (Math.abs(delta) < 1) return;

      // Adaptive smoothing: fast movements get less smoothing
      const factor = Math.abs(delta) > 15 ? 0.6 : Math.abs(delta) > 5 ? 0.35 : 0.2;
      let next = prev + delta * factor;
      if (next < 0) next += 360;
      if (next >= 360) next -= 360;
      smoothedHeadingRef.current = next;

      // Throttle state updates to ~30fps
      const now = Date.now();
      if (now - lastUpdateRef.current > 33) {
        lastUpdateRef.current = now;
        setHeading(next);
      }
    });
    return () => sub.remove();
  }, []);

  // Build markers
  const markers = useMemo(() => {
    const result: ARMarker[] = [];
    if (!location) return result;

    const userLat = location.latitude;
    const userLon = location.longitude;
    const now = dayjs();

    const addItems = (items: any[] | undefined, type: string, filterHidden = false, filterTime = false) => {
      if (!items) return;
      for (const item of items) {
        if (filterHidden && item.is_hidden) continue;
        if (filterTime && !now.isBetween(dayjs(item.active_from), dayjs(item.active_to))) continue;
        const lat = Number(item.latitude);
        const lon = Number(item.longitude);
        const dist = calculateDistance(userLat, userLon, lat, lon);
        if (dist > MAX_RENDER_DISTANCE) continue;
        const bearing = calculateBearing(userLat, userLon, lat, lon);
        result.push({ id: type + '-' + item.id, type, latitude: lat, longitude: lon, bearing, distance: dist, data: item });
      }
    };

    addItems(redeemables.items, 'item', true);
    addItems(redeemables.pins, 'pin', true);
    addItems(redeemables.tasks, 'task');
    addItems(redeemables.coins, 'coin', false, true);
    addItems(redeemables.vaults, 'vault');
    addItems(redeemables.keys, 'key', false, true);
    addItems(redeemables.redeemables, 'redeemable', false, true);

    // Sort by distance and limit
    result.sort((a, b) => a.distance - b.distance);
    return result.slice(0, MAX_VISIBLE_MARKERS);
  }, [location, redeemables]);

  // Compute visible markers in current FOV
  const visibleMarkers = useMemo(() => {
    return markers
      .map((m) => {
        const rel = angleDiff(m.bearing, heading);
        if (Math.abs(rel) > HALF_FOV + 5) return null; // small buffer for smooth edges

        const screenX = SCREEN_WIDTH / 2 + (rel / HALF_FOV) * (SCREEN_WIDTH / 2);
        const scale = distanceScale(m.distance);
        const screenY = verticalPosition(m.distance);
        const opacity = distanceOpacity(m.distance);
        const inRange = m.distance <= REDEEM_RANGE_M;

        return { ...m, screenX, screenY, scale, opacity, inRange };
      })
      .filter(Boolean) as (ARMarker & { screenX: number; screenY: number; scale: number; opacity: number; inRange: boolean })[];
  }, [markers, heading]);

  // Find nearest marker for directional arrow when nothing visible
  const nearestMarkerDirection = useMemo(() => {
    if (visibleMarkers.length > 0 || markers.length === 0) return null;
    let nearest = markers[0]; // already sorted by distance
    let rel = angleDiff(nearest.bearing, heading);
    return rel > 0 ? 'right' : 'left';
  }, [visibleMarkers, markers, heading]);

  const handleMarkerPress = useCallback((id: string) => {
    setSelectedMarker((prev) => (prev === id ? null : id));
  }, []);

  // Permission states
  if (cameraPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (cameraPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.statusText}>Camera access is needed for AR mode.</Text>
          <Text style={styles.statusTextSmall}>
            Please enable camera access in your device Settings.
          </Text>
        </View>
      </View>
    );
  }

  const renderMarkerContent = (m: (typeof visibleMarkers)[0]) => {
    const size = BASE_MARKER_SIZE * m.scale;

    switch (m.type) {
      case 'item':
        return (
          <Image
            source={require('../../assets/images/screens/explore/item_animation.gif')}
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        );
      case 'pin':
        return (
          <Image
            source={require('../../assets/images/screens/explore/pin_animation.gif')}
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        );
      case 'task':
        return (
          <Image
            source={require('../../assets/images/screens/explore/task_animation.gif')}
            contentFit="contain"
            style={{ width: size * 1.5, height: size * 1.5 }}
          />
        );
      case 'vault':
        return (
          <Image
            source={require('../../assets/images/screens/explore/vault_animation.gif')}
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        );
      case 'coin':
        return (
          <View style={{ transform: [{ scale: m.scale * 0.8 }] }}>
            <Coin coin={m.data} onExpire={onRefresh} />
          </View>
        );
      case 'key':
        return (
          <View style={{ transform: [{ scale: m.scale * 0.8 }] }}>
            <Key model={m.data} onExpire={onRefresh} />
          </View>
        );
      case 'redeemable':
        return (
          <View style={{ transform: [{ scale: m.scale * 0.8 }] }}>
            <Redeemable redeemable={m.data} onExpire={onRefresh} />
          </View>
        );
      default:
        return null;
    }
  };

  const renderMarker = (m: (typeof visibleMarkers)[0]) => {
    const size = BASE_MARKER_SIZE * m.scale * (m.type === 'task' ? 1.5 : 1);
    const distLabel = m.distance < 1000
      ? Math.round(m.distance) + 'm'
      : (m.distance / 1000).toFixed(1) + 'km';
    const isSelected = selectedMarker === m.id;

    return (
      <Pressable
        key={m.id}
        onPress={() => handleMarkerPress(m.id)}
        style={{
          position: 'absolute',
          left: m.screenX - size / 2,
          top: m.screenY - size / 2,
          alignItems: 'center',
          opacity: m.opacity,
        }}
      >
        <FloatingMarker inRange={m.inRange}>
          {/* Glow/shadow beneath marker */}
          <View style={styles.markerGlow} />
          {renderMarkerContent(m)}
          {/* Distance label */}
          <View style={[styles.distanceBadge, m.inRange && styles.distanceBadgeInRange]}>
            <Text style={styles.distanceText}>{distLabel}</Text>
          </View>
          {/* Tooltip on tap */}
          {isSelected && m.data?.name && (
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>{m.data.name}</Text>
              <Text style={styles.tooltipDistance}>{distLabel} away</Text>
            </View>
          )}
        </FloatingMarker>
      </Pressable>
    );
  };

  // Compass bar
  const renderCompass = () => {
    const compassWidth = SCREEN_WIDTH - 32;
    return (
      <View style={styles.compassBar}>
        <View style={styles.compassInner}>
          {COMPASS_POINTS.map((p) => {
            let rel = angleDiff(p.deg, heading);
            // Show points within 180 degrees
            if (Math.abs(rel) > 90) return null;
            const x = compassWidth / 2 + (rel / 90) * (compassWidth / 2);
            const isCardinal = p.label.length === 1;
            return (
              <View key={p.label} style={[styles.compassPoint, { left: x - 10 }]}>
                <Text style={[styles.compassLabel, isCardinal && styles.compassLabelCardinal]}>
                  {p.label}
                </Text>
              </View>
            );
          })}
          {/* Center indicator */}
          <View style={styles.compassCenter}>
            <View style={styles.compassCenterDot} />
          </View>
          {/* Heading text */}
          <Text style={styles.compassHeading}>{Math.round(heading) + '\u00B0'}</Text>
        </View>
      </View>
    );
  };

  // Sort visible markers: far first so close ones render on top (z-order)
  const sortedVisible = [...visibleMarkers].sort((a, b) => b.distance - a.distance);

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* AR overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {sortedVisible.map(renderMarker)}
      </View>

      {/* Compass bar */}
      {renderCompass()}

      {/* Direction arrow when no markers visible */}
      {nearestMarkerDirection && (
        <View style={[styles.directionArrow, nearestMarkerDirection === 'right' ? styles.arrowRight : styles.arrowLeft]}>
          <Text style={styles.arrowText}>
            {nearestMarkerDirection === 'right' ? '\u25B6' : '\u25C0'}
          </Text>
          <Text style={styles.arrowLabel}>Nearest item</Text>
        </View>
      )}

      {/* Marker count */}
      {visibleMarkers.length > 0 && (
        <View style={styles.markerCount}>
          <Text style={styles.markerCountText}>
            {visibleMarkers.length + ' nearby'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Shark',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statusTextSmall: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: 'Shark',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionButton: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontFamily: 'Shark',
    fontWeight: 'bold',
  },
  markerGlow: {
    position: 'absolute',
    bottom: -4,
    left: '25%',
    width: '50%',
    height: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(79, 195, 247, 0.3)',
  },
  distanceBadge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  distanceBadgeInRange: {
    backgroundColor: 'rgba(76, 175, 80, 0.85)',
  },
  distanceText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Shark',
    textAlign: 'center',
  },
  tooltip: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    maxWidth: 160,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Shark',
    textAlign: 'center',
  },
  tooltipDistance: {
    color: '#4FC3F7',
    fontSize: 10,
    fontFamily: 'Shark',
    textAlign: 'center',
    marginTop: 2,
  },
  compassBar: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    height: 36,
    zIndex: 20,
  },
  compassInner: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  compassPoint: {
    position: 'absolute',
    width: 20,
    alignItems: 'center',
  },
  compassLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontFamily: 'Shark',
  },
  compassLabelCardinal: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  compassCenter: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(79, 195, 247, 0.6)',
  },
  compassCenterDot: {
    position: 'absolute',
    top: -2,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4FC3F7',
  },
  compassHeading: {
    position: 'absolute',
    right: 8,
    color: '#4FC3F7',
    fontSize: 11,
    fontFamily: 'Shark',
  },
  directionArrow: {
    position: 'absolute',
    top: '45%',
    alignItems: 'center',
    zIndex: 15,
  },
  arrowRight: {
    right: 12,
  },
  arrowLeft: {
    left: 12,
  },
  arrowText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 28,
  },
  arrowLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: 'Shark',
    marginTop: 2,
  },
  markerCount: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  markerCountText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'Shark',
  },
});
