import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

const ART = {
  normal: { source: require('../../assets/images/screens/park/shelf-polished-v2.png'), top: 218, bottom: 507 },
  secret: { source: require('../../assets/images/screens/park/secretshelf-polished-v2.png'), top: 217, bottom: 547 },
  archived: { source: require('../../assets/images/screens/park/archivedshelf-polished-v2.png'), top: 218, bottom: 506 },
} as const;
const CANVAS = { width: 2170, height: 725 };

/** Fit the visible sprite, including its supports and lock, into the original slot.
 * Generated files retain their original alpha canvas; no destructive crop is needed.
 */
export default function ParkShelfArtwork({ variant = 'normal', height = 55, initialWidth = 0 }: {
  readonly variant?: keyof typeof ART;
  readonly height?: number;
  /** The row width when the parent already knows it: the shelf draws on its first frame instead of after layout. */
  readonly initialWidth?: number;
}) {
  const [width, setWidth] = useState(initialWidth > 0 ? initialWidth : 0);
  const art = ART[variant];
  const visibleHeight = art.bottom - art.top;
  const scale = Math.min(width / CANVAS.width, height / visibleHeight);
  return <View pointerEvents="none" accessible={false}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={{ position: 'absolute', bottom: 0, width: '100%', height, overflow: 'hidden' }}>
    {width > 0 && <Image source={art.source} contentFit="fill" style={{
      position: 'absolute', width: CANVAS.width * scale, height: CANVAS.height * scale,
      left: (width - CANVAS.width * scale) / 2,
      top: (height - visibleHeight * scale) / 2 - art.top * scale,
    }} />}
  </View>;
}
