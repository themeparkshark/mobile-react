import { Text, TextStyle, View } from 'react-native';

const STROKE_WIDTH = 2;

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

interface Props {
  children: string;
  style?: TextStyle;
  strokeColor?: string;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}

export default function StrokedText({
  children,
  style = {},
  strokeColor = '#0d2b5e',
  numberOfLines,
  adjustsFontSizeToFit,
}: Props) {
  const textProps = {
    numberOfLines,
    adjustsFontSizeToFit,
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Invisible sizer — sets the layout size, no offset */}
      <Text {...textProps} style={[style, { opacity: 0 }]}>
        {children}
      </Text>
      {/* Stroke layers — all absolute, centered on sizer */}
      {strokeOffsets.map((offset, i) => (
        <Text
          key={i}
          {...textProps}
          style={[
            style,
            {
              color: strokeColor,
              position: 'absolute',
              transform: [{ translateX: offset.x }, { translateY: offset.y }],
            },
          ]}
        >
          {children}
        </Text>
      ))}
      {/* Main text on top — absolute, no offset */}
      <Text
        {...textProps}
        style={[
          style,
          {
            position: 'absolute',
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
