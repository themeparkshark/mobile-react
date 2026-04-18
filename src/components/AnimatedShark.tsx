import { useEffect } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Atlas,
  useImage,
  useRectBuffer,
  useRSXformBuffer,
  Skia,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';

// Sprite sheet config — generated from shark_player.gif
const FRAME_COUNT = 36;
const FRAME_WIDTH = 214;
const FRAME_HEIGHT = 275;
const FRAME_DURATION_MS = 100; // 100ms per frame = ~10fps sprite animation
const TOTAL_ANIM_MS = FRAME_COUNT * FRAME_DURATION_MS;

// Display size
const DISPLAY_SCALE = 0.35; // Scale down from 214x275 to ~75x96
const DISPLAY_WIDTH = FRAME_WIDTH * DISPLAY_SCALE;
const DISPLAY_HEIGHT = FRAME_HEIGHT * DISPLAY_SCALE;

// Bob animation
const BOB_AMOUNT = 6;
const BOB_DURATION = 2000;

interface AnimatedSharkProps {
  readonly size?: number; // Override display scale
  readonly paused?: boolean;
}

export default function AnimatedShark({ size, paused = false }: AnimatedSharkProps) {
  const spriteSheet = useImage(require('../../assets/images/screens/explore/shark_spritesheet.png'));

  // Frame counter — cycles 0 to FRAME_COUNT smoothly on UI thread
  const frameProgress = useSharedValue(0);
  // Bob animation — gentle floating
  const bobProgress = useSharedValue(0);

  const scale = size ? size / FRAME_WIDTH : DISPLAY_SCALE;
  const displayW = FRAME_WIDTH * scale;
  const displayH = FRAME_HEIGHT * scale;
  const canvasH = displayH + BOB_AMOUNT * 2; // Extra space for bob

  useEffect(() => {
    if (paused) return;

    // Sprite frame animation — linear cycle through all frames
    frameProgress.value = 0;
    frameProgress.value = withRepeat(
      withTiming(FRAME_COUNT, {
        duration: TOTAL_ANIM_MS,
        easing: Easing.linear,
      }),
      -1, // infinite
      false // don't reverse
    );

    // Bob up and down
    bobProgress.value = 0;
    bobProgress.value = withRepeat(
      withTiming(1, {
        duration: BOB_DURATION,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true // reverse for smooth bob
    );
  }, [paused]);

  // Sprite source rects — which frame to show from the sheet
  const sprites = useRectBuffer(1, (rect, _i) => {
    'worklet';
    const frame = Math.floor(frameProgress.value) % FRAME_COUNT;
    rect.setXYWH(frame * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT);
  });

  // Transform — scale + bob offset, all on UI thread
  const transforms = useRSXformBuffer(1, (xform, _i) => {
    'worklet';
    const bobOffset = bobProgress.value * BOB_AMOUNT;
    // RSXform(scos, ssin, tx, ty) — scos=scale*cos(0)=scale, ssin=0 (no rotation)
    xform.set(scale, 0, 0, BOB_AMOUNT + bobOffset);
  });

  if (!spriteSheet) return <View style={{ width: displayW, height: canvasH }} />;

  return (
    <Canvas style={{ width: displayW, height: canvasH }}>
      <Atlas
        image={spriteSheet}
        sprites={sprites}
        transforms={transforms}
      />
    </Canvas>
  );
}
