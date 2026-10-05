import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FxFloat, FxRigLayers, FxScene, FxSceneLight, FxShadow, useFxMomentCue, wornFx } from '../fx/FxLayers';
import { FxBox, useFxClock, useFxKick, useFxRunning } from '../fx/FxStage';
import { JetpackFloorLight } from '../fx/rigs/Jetpack';
import { FX_MOMENT, FxLod, NO_KICK, containBox } from '../fx/registry';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

/** Per-card SVG ids: two cards on one screen never share a gradient. */
let contactIds = 0;
import { Animated, GestureResponderEvent, Image as RNImage, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';
import { sharkBaseLayers, slotAtPoint } from '../helpers/wardrobe';

/**
 * Where each worn layer lands, normalized on the 1353x1530 paper art
 * (dressing-room.md 7.2 slot anchors). A newly worn layer pops in from here.
 */
const SLOT_ANCHORS: Record<string, string> = {
  head_item: '62% 14%',
  face_item: '39% 26%',
  neck_item: '54% 50%',
  body_item: '52% 58%',
  hand_item: '19% 54%',
};

/**
 * One worn layer. When it arrives after the shark is already on screen it
 * fades in over 60ms and settles from 1.18 to 1.0 at its slot.
 */
function WornLayer({ uri, slot, pop, popFrom = 1.18, drop = false }: { readonly uri: string; readonly slot: string; readonly pop: boolean; readonly popFrom?: number; readonly drop?: boolean }) {
  const scale = useRef(new Animated.Value(pop ? popFrom : 1)).current;
  // Shop buy: the new piece falls about 40pt onto the shark before it settles.
  const fall = useRef(new Animated.Value(pop && drop ? -40 : 0)).current;
  const opacity = useRef(new Animated.Value(pop ? 0 : 1)).current;

  useEffect(() => {
    if (!pop) return;
    const arrival = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 260, mass: 1, useNativeDriver: true }),
      Animated.spring(fall, { toValue: 0, damping: 11, stiffness: 320, mass: 1, useNativeDriver: true }),
    ]);
    arrival.start();
    return () => arrival.stop();
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[styles.image, {
      opacity,
      transform: [{ translateY: fall }, { scale }],
      transformOrigin: SLOT_ANCHORS[slot] ?? 'center',
    }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

const GROUND_SHADOW = require('../../assets/fx/glow.webp');

export default function Playercard({
  inventory,
  style,
  showBackground = true,
  sharkTransform,
  onItemTap,
  popLayers = false,
  still = false,
  pinAnchor = 'card',
  popFrom,
  dropIn = false,
  shadow = false,
  shadowAt,
  fxLod = 'full',
  fxSound,
  fxAnnounce = false,
  fxPlay = 0,
  fxHold = false,
  fxTapToPlay = false,
  fxStartDelay = 0,
  onFxPlay,
  sceneGround,
}: {
  readonly inventory: InventoryType;
  readonly style: StyleProp<ViewStyle>;
  readonly showBackground?: boolean;
  readonly sharkTransform?: any[];
  readonly onItemTap?: (item: ItemType, slot: string) => void;
  /** Inventory stage: layers put on after the first frame pop in at their slot. */
  readonly popLayers?: boolean;
  /** Reduce Motion: skip the idle bob. */
  readonly still?: boolean;
  /** Stages (shop try-on, reveal): 'body' pins the pin on the chest instead of the card corner. */
  readonly pinAnchor?: 'card' | 'body';
  /** How big a newly worn layer starts before settling (1.18 by default; the shop's buy drop uses 1.4). */
  readonly popFrom?: number;
  /** Newly worn layers fall onto the shark (the shop buy landing). */
  readonly dropIn?: boolean;
  /** Stages: a contact shadow under the tail that grows and darkens as the shark bobs down. */
  readonly shadow?: boolean;
  /** Where the tail rests, in this card's box (from stageCard): the shadow sits exactly there. */
  readonly shadowAt?: { left: string; top: string };
  /**
   * Secret Shop rigs (secret-shop/DESIGN.md 8.2): 'full' on stages, 'lite' for
   * small or recorded cards, 'still' for the rest pose. `still` forces 'still'.
   */
  readonly fxLod?: FxLod;
  /** Rig sounds here: the equip cue when a piece goes on, and each moment's cue. Defaults to popLayers (the stages where pieces are worn). */
  readonly fxSound?: boolean;
  /** The try-on: a piece already worn when the stage opens plays its equip cue too. */
  readonly fxAnnounce?: boolean;
  /** Change this number to replay the worn rigs' moments now (the Secret unlock after a buy). */
  readonly fxPlay?: number;
  /** Hold every timer moment (the shop's confirm and buy): the next thing the piece does is the unlock. */
  readonly fxHold?: boolean;
  /** A tap on the shark replays its rigs' moments (stages with no item taps). */
  readonly fxTapToPlay?: boolean;
  /** Hold the first moment this long (ms): the try-on waits for its sheet to finish sliding in. */
  readonly fxStartDelay?: number;
  /** Called when the moments replay (a tap or fxPlay), for a scene drawn outside this card (the try-on backdrop). */
  readonly onFxPlay?: (kind: 'tap' | 'unlock') => void;
  /** The shark stands in a scene (a worn scene, here or behind the stage): smaller, with a shadow on the ground. */
  readonly sceneGround?: boolean;
}) {
  const fx = useMemo(() => wornFx(inventory), [inventory]);
  const grounded = sceneGround ?? (!!fx.scene && showBackground);
  // Reduce Motion is read here, so no screen can forget it (performance panel round 1).
  const reduced = useReducedGameMotion();
  const stageAwake = useFxRunning(still || reduced ? 'still' : 'full');
  // Long-lived stages (Profile, the Dressing Room, the shop hero) drop their particles after a
  // minute with no touch, and wake on the next tap or new piece (perf round 3).
  const [fxIdle, setFxIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeFx = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setFxIdle(false);
    idleTimer.current = setTimeout(() => setFxIdle(true), 60_000);
  }, []);
  // Only a card with something animating arms the timer; it wakes again whenever the stage resumes.
  const animates = fx.rigs.length > 0 || (!!fx.scene && showBackground);
  const resumed = stageAwake;
  useEffect(() => {
    if (animates && resumed) wakeFx();
    else if (idleTimer.current) clearTimeout(idleTimer.current);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [wakeFx, animates, resumed]);
  const lod: FxLod = still || reduced ? 'still' : fxIdle && fxLod === 'full' ? 'lite' : fxLod;
  // Only a look with something to draw runs a clock (a scene off stage draws nothing here).
  // One focus/AppState subscription per card: the stage is awake, then the clock runs if there is something to draw.
  const fxRunning = stageAwake && lod !== 'still' && (fx.rigs.length > 0 || (!!fx.scene && showBackground));
  const fxClock = useFxClock(fxRunning, -fxStartDelay);
  const fxKick = useFxKick();
  const [stageH, setStageH] = useState(0);
  const sounds = fxSound ?? popLayers;
  const { cue: fxCue, touch: fxTouch, play: fxPlayCue } = useFxMomentCue(sounds);
  // A tap replays the worn pieces' moments with their cues (taps during the first 60% of a
  // moment are ignored, so spam-taps never freeze a pose). A buy replays them as a Secret
  // unlock: after the landing settles, twice, sound without a second haptic (game feel round 2).
  const momentMs = Math.max(0, ...fx.rigs.map(r => FX_MOMENT[r.key].ms), fx.scene ? FX_MOMENT[fx.scene].ms : 0);
  const playFx = useCallback((kind: 'tap' | 'unlock' = 'tap') => {
    onFxPlay?.(kind);
    if (!fx.any || !fxRunning) return;
    // On the frame clock (the one the motion runs on), so a hitch never lets a tap in early.
    if (kind === 'tap' && fxClock.value - fxKick.value < momentMs * 0.6) return;
    fxTouch();
    wakeFx();
    const keys = [...fx.rigs.map(r => r.key), ...(fx.scene && showBackground ? [fx.scene] : [])];
    const cue = keys.length ? FX_MOMENT[keys[0]].cue : null;
    if (kind === 'tap') {
      fxKick.value = fxClock.value;
      if (cue) fxPlayCue(cue, true);
    } else {
      fxKick.value = fxClock.value + 450;
      unlockTimers.current.push(setTimeout(() => { if (cue) fxPlayCue(cue, false); }, 450));
      unlockTimers.current.push(setTimeout(() => { fxKick.value = fxClock.value; if (cue) fxPlayCue(cue, false); }, 450 + momentMs * 0.75));
    }
  }, [fx, fxRunning, momentMs, showBackground, onFxPlay]);
  const unlockTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => unlockTimers.current.forEach(clearTimeout), []);
  const lookKey = [fx.scene, ...fx.rigs.map(r => r.key)].join(',');
  // Equipping a Secret piece plays its moment once, 400 ms after it goes on, with the moment's cue as
  // the only sound and one haptic (game feel round 4: no separate equip whoosh stacked on top).
  // A piece that left and came back within 3 s (the shop's buy drop) is not a new equip.
  const prevKeys = useRef<Set<string> | null>(null);
  const goneAt = useRef(new Map<string, number>());
  useEffect(() => {
    fxTouch(); wakeFx();
    const now = new Set(lookKey ? lookKey.split(',').filter(Boolean) : []);
    const at = Date.now();
    if (prevKeys.current) for (const k of prevKeys.current) if (!now.has(k)) goneAt.current.set(k, at);
    const fresh = prevKeys.current && [...now].find(k => !prevKeys.current!.has(k) && at - (goneAt.current.get(k) ?? -1e9) > 3000);
    prevKeys.current = now;
    if (!fresh || !fxRunning) return;
    fxKick.value = fxClock.value + 400;
    const timer = setTimeout(() => fxPlayCue(FX_MOMENT[fresh as keyof typeof FX_MOMENT].cue, true), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey]);
  useEffect(() => { if (fxPlay) playFx('unlock'); }, [fxPlay]);
  // A hold keeps a kick due 1.5 s out (momentAt holds timer moments while a kick is pending), refreshed
  // until the unlock replaces it. A hold that ends with no buy clears the kick, so nothing plays then.
  const fxPlayRef = useRef(fxPlay);
  useEffect(() => {
    if (!fxHold) return;
    const startPlay = fxPlayRef.current = fxPlay;
    // Once the unlock has played, its kick stands.
    const push = () => { if (fxPlayRef.current === startPlay) fxKick.value = fxClock.value + 1500; };
    push();
    const timer = setInterval(push, 500);
    return () => {
      clearInterval(timer);
      if (fxPlayRef.current === startPlay) fxKick.value = NO_KICK;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxHold]);
  fxPlayRef.current = fxPlay;
  const translate = useRef(new Animated.Value(0)).current;
  const contactId = useRef(`contact-${++contactIds}`).current;
  // Layers present on the first frame never pop; only ones put on later do.
  const firstFrameDone = useRef(false);
  useEffect(() => { firstFrameDone.current = true; }, []);
  const pop = popLayers && firstFrameDone.current;
  const nakedBounce = useRef(new Animated.Value(1)).current;
  const containerSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    // Reduce Motion (or a still preview): no idle bob at all.
    if (still || reduced) { translate.setValue(0); return; }
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(translate, {
          toValue: 10,
          duration: 2700,
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 2700,
          useNativeDriver: true,
        }),
      ])
    );
    bob.start();
    return () => bob.stop();
  }, [still, reduced]);

  // Check if shark is "naked" (no wearable items)
  const isNaked = !inventory?.head_item && !inventory?.face_item &&
    !inventory?.neck_item && !inventory?.body_item && !inventory?.hand_item &&
    !inventory?.pin_item;

  const triggerNakedBounce = () => {
    Animated.sequence([
      Animated.spring(nakedBounce, {
        toValue: 1.08,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
      Animated.spring(nakedBounce, {
        toValue: 1,
        useNativeDriver: true,
        speed: 12,
        bounciness: 16,
      }),
    ]).start();
  };

  // Single tap handler: resolves which equipped item was tapped by zone
  const handleSharkTap = useCallback((e: GestureResponderEvent) => {
    // Any tap on a shark wearing Secret pieces replays their moments.
    playFx('tap');
    if (!onItemTap) return;

    const { locationX, locationY } = e.nativeEvent;
    const { width, height } = containerSize.current;
    if (!width || !height) return;

    const yPct = locationY / height;
    const xPct = locationX / width;

    const slot = slotAtPoint(xPct, yPct, inventory);
    if (slot) {
      onItemTap(inventory![slot] as ItemType, slot);
      return;
    }

    if (isNaked) {
      triggerNakedBounce();
    }
  }, [onItemTap, inventory, isNaked, playFx]);

  return (
    <View style={style}>
      <View
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        {inventory?.background_item && showBackground && fx.scene && <FxScene fx={fx} t={fxClock} kick={fxKick} cue={fxCue} lod={lod} />}
        {inventory?.background_item && showBackground && !fx.scene && (
          <Image
            source={{
              uri: inventory.background_item.paper_url,
            }}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            contentFit="cover"
          />
        )}
        {inventory?.pin_item && pinAnchor === 'card' && (
          onItemTap ? (
            <Pressable
              onPress={() => onItemTap(inventory.pin_item, 'pin_item')}
              style={{
                position: 'absolute',
                right: 10,
                top: 80,
                width: 60,
                height: 60,
                zIndex: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: inventory.pin_item.icon_url }}
                style={{ width: 40, height: 40 }}
                contentFit="contain"
              />
            </Pressable>
          ) : (
            <Image
              source={{ uri: inventory.pin_item.icon_url }}
              style={{
                width: 40,
                height: 40,
                position: 'absolute',
                right: 20,
                top: 90,
              }}
              contentFit="contain"
            />
          )
        )}
        {shadow && (
          <FxShadow fx={fx} t={fxClock} kick={fxKick} height={stageH}>
          <Animated.View pointerEvents="none" style={[styles.shadow, shadowAt ? { left: shadowAt.left as never, top: shadowAt.top as never } : null, {
            opacity: translate.interpolate({ inputRange: [0, 10], outputRange: [0.55, 1] }),
            transform: [{ scaleX: translate.interpolate({ inputRange: [0, 10], outputRange: [0.82, 1] }) }],
          }]}>
            {/* Soft contact shadow: a radial fade, not a flat pill. */}
            <Svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
              <Defs>
                <RadialGradient id={contactId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#05346e" stopOpacity={0.42} />
                  <Stop offset="0.7" stopColor="#05346e" stopOpacity={0.16} />
                  <Stop offset="1" stopColor="#05346e" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx="50" cy="10" rx="50" ry="10" fill={`url(#${contactId})`} />
            </Svg>
          </Animated.View>
          </FxShadow>
        )}
        {/* The jetpack's light on the floor: outside the moving shark, so it never tilts or floats.
            Only where there is a floor (a stage plinth); the open-ocean Dressing Room has none. */}
        {fx.floats && lod === 'full' && fxRunning && !!shadowAt && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <FxBox>{({ width, height }) => <JetpackFloorLight t={fxClock} kick={fxKick} box={containBox(width, height)}
              floorY={height * ((parseFloat(shadowAt?.top ?? '80') + 2.5) / 100)} />}</FxBox>
          </View>
        )}
        {grounded && (
          // The plaza shadow: the shark stands on the scene's ground, never floats over it (art panel round 3).
          <RNImage source={GROUND_SHADOW} resizeMode="stretch"
            style={{ position: 'absolute', left: '33%', width: '52%', top: '86%', height: '9%', opacity: 0.55, tintColor: '#050320' }} />
        )}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            // Only set when grounded: RN Animated turns an undefined transformOrigin into null and crashes on re-render.
            ...(grounded ? { transformOrigin: '55% 92%' } : null),
            transform: [
              {
                translateY: translate,
              },
              ...(sharkTransform || []),
              ...(onItemTap ? [{ scale: nakedBounce }] : []),
              // One scene scale on every surface: the shark stands about 16% smaller in a scene.
              ...(grounded ? [{ scale: 0.84 }] : []),
            ],
          }}
        >
          <FxFloat fx={fx} t={fxClock} kick={fxKick} height={stageH}>
          <View
            onLayout={(e) => {
              containerSize.current = {
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              };
              if (fx.floats && Math.abs(e.nativeEvent.layout.height - stageH) > 0.5) setStageH(e.nativeEvent.layout.height);
            }}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              marginTop: '5%',
            }}
          >
            {/* Secret Shop rigs that sit behind the shark (far side of a halo) */}
            {fx.rigs.length > 0 && <FxRigLayers fx={fx} side="back" t={fxClock} kick={fxKick} lod={lod} />}
            {/* Shark body (worn skin or Alex's Classic) and eyes */}
            {sharkBaseLayers(inventory).map((source, index) => (
              <Image key={`base-${index}`} source={source} style={styles.image} contentFit="contain" />
            ))}
            {/* Item layers: purely visual, no individual Pressables */}
            {(['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const).map((slot) => {
              const worn = inventory?.[slot];
              // An animated piece draws as its rig below, not as its rest-frame paper.
              if (fx.rigs.some(r => r.slot === slot)) return null;
              return worn?.paper_url ? (
                <WornLayer key={`${slot}-${worn.id}`} slot={slot} uri={worn.paper_url} pop={pop} popFrom={popFrom} drop={dropIn} />
              ) : null;
            })}
            {fx.rigs.length > 0 && <FxRigLayers fx={fx} side="front" t={fxClock} kick={fxKick} cue={fxCue} lod={lod} />}
            {grounded && fx.scene && showBackground && lod === 'full' && <FxSceneLight fx={fx} t={fxClock} kick={fxKick} lod={lod} />}
            {/* Stage mode: the pin sits on the chest, riding the bob with the shark. */}
            {pinAnchor === 'body' && inventory?.pin_item?.icon_url ? (
              <Image key={`pin-${inventory.pin_item.id}`} source={{ uri: inventory.pin_item.icon_url }} contentFit="contain"
                pointerEvents="none" style={styles.chestPin} />
            ) : null}
            {/* Single tap overlay: uses coordinates to determine which equipped item */}
            {(onItemTap || (fxTapToPlay && (fx.any || !!onFxPlay))) && (
              <Pressable
                onPress={handleSharkTap}
                onPressIn={() => { if (__DEV__) console.log(`[fx-tap] ${Date.now()} press-in`); }}
                accessibilityLabel={onItemTap ? undefined : 'Your shark. Tap to see your Secret pieces move.'}
                style={[StyleSheet.absoluteFill, { zIndex: 50 }]}
              />
            )}
          </View>
          </FxFloat>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Under the tail, where the shark meets the stage (art box coordinates).
  shadow: { position: 'absolute', left: '56.5%', width: '32%', top: '80%', height: '5%' },
  chestPin: { position: 'absolute', left: '47%', top: '52%', width: '11%', aspectRatio: 1 },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
