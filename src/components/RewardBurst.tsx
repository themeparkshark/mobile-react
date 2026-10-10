import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/**
 * A confetti and sparkle burst driven by one shared progress value on the UI
 * thread (0 = hidden, 1 = settled), the same technique as the ride-coin
 * CoinCatchReveal burst. Brand colours only: gold, sky, white, red.
 */
const COLORS = ['#ffcf3b', '#ffe07a', '#7cc6f5', '#ffffff', '#ef4a3c', '#0879ca'];
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const speed = 110 + ((i * 37) % 90);
  return {
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed - 70,
    spin: ((i * 83) % 600) - 300,
    size: 7 + (i % 4) * 3,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  };
});

export default function RewardBurst({ progress, x, y, colors }: {
  readonly progress: SharedValue<number>;
  readonly x: number;
  readonly y: number;
  /** Optional palette (e.g. a Trail Box tier); defaults to the brand mix. */
  readonly colors?: readonly string[];
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PIECES.map((piece, i) => <Piece key={i} piece={colors?.length ? { ...piece, color: colors[i % colors.length] } : piece}
        progress={progress} x={x} y={y} />)}
    </View>
  );
}

function Piece({ piece, progress, x, y }: {
  readonly piece: typeof PIECES[number];
  readonly progress: SharedValue<number>;
  readonly x: number;
  readonly y: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t === 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: x + piece.dx * t },
        { translateY: y + piece.dy * t + 240 * t * t },
        { rotate: `${piece.spin * t}deg` },
        { scale: 1 - t * 0.35 },
      ],
    };
  });
  return (
    <Animated.View style={[{
      position: 'absolute', left: -piece.size / 2, top: -piece.size / 2,
      width: piece.size, height: piece.round ? piece.size : piece.size * 0.55,
      borderRadius: piece.round ? piece.size / 2 : 2, backgroundColor: piece.color,
    }, style]} />
  );
}
