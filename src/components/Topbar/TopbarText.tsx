import { StyleSheet, Text, View } from 'react-native';

const STROKE_WIDTH = 2;
const FONT_SIZE = 32;

const baseTextStyle = {
  textAlign: 'center' as const,
  fontSize: FONT_SIZE,
  fontFamily: 'Shark',
  textTransform: 'uppercase' as const,
  letterSpacing: 1.5,
};

// Offsets to create an outline/stroke around the text
const strokeOffsets = [
  { x: -STROKE_WIDTH, y: 0 },
  { x: STROKE_WIDTH, y: 0 },
  { x: 0, y: -STROKE_WIDTH },
  { x: 0, y: STROKE_WIDTH },
  { x: -STROKE_WIDTH, y: -STROKE_WIDTH },
  { x: STROKE_WIDTH, y: -STROKE_WIDTH },
  { x: -STROKE_WIDTH, y: STROKE_WIDTH },
  { x: STROKE_WIDTH, y: STROKE_WIDTH },
];

export default function TopbarText({ children }) {
  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      {/* Dark stroke layers */}
      {strokeOffsets.map((offset, i) => (
        <Text
          key={i}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          style={[
            baseTextStyle,
            {
              color: '#0d2b5e',
              position: i === 0 ? 'relative' : 'absolute',
              opacity: i === 0 ? 0 : 1,
              left: offset.x,
              top: offset.y,
            },
          ]}
        >
          {children}
        </Text>
      ))}
      {/* Main white text on top with slight drop shadow */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        style={[
          baseTextStyle,
          {
            color: 'white',
            position: 'absolute',
            textShadowColor: 'rgba(0, 0, 0, 0.4)',
            textShadowOffset: { width: 1, height: 2 },
            textShadowRadius: 2,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
