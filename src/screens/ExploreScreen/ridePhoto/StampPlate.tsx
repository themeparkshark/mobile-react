import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GameIcon } from '../../../ui';
import { GRADE_LABEL, GRADE_STARS, type PhotoGrade } from '../ridePhoto';

const INK = '#0b2f5c';
const PLATE: Record<PhotoGrade, { fill: [string, string]; text: string }> = {
  blurry: { fill: ['#ffffff', '#e8eef6'], text: INK },
  good: { fill: ['#ffffff', '#e8eef6'], text: INK },
  great: { fill: ['#f5f8fc', '#aebdd0'], text: INK },
  frame_it: { fill: ['#ffe46b', '#f0a800'], text: '#ffffff' },
};

/**
 * The grade as a tilted stamp plate: thick ink outline, inner bevel, 1 to 3
 * stars and the word. A miss is wordless: a camera and a retry arrow (a
 * "so close" miss adds a small gold star). Laid out at `size` (its slam size)
 * so it is only ever scaled down and stays sharp.
 */
function StampPlate({ grade, soClose = false, double = false, size = 1 }: { grade: PhotoGrade; soClose?: boolean; double?: boolean; size?: number }) {
  const plate = PLATE[grade];
  const stars = GRADE_STARS[grade];
  const outlined = plate.text === '#ffffff';
  const icon = Math.round(18 * size);
  // Plate sizes are in rest points: callers lay it out at `size` and scale it by 1/size.
  return (
    <View accessibilityLabel={grade === 'blurry' ? (soClose ? 'So close' : 'Blurry') : double ? `Double ${GRADE_LABEL[grade]}` : GRADE_LABEL[grade]}
      style={[styles.plate, { borderRadius: 12 * size, borderWidth: 3 * size, paddingHorizontal: 12 * size, paddingVertical: 6 * size,
        transform: [{ rotate: '-8deg' }] }]}>
      <LinearGradient colors={plate.fill} style={[StyleSheet.absoluteFill, { borderRadius: 9 * size }]} />
      <View style={[styles.bevel, { left: 3 * size, right: 3 * size, top: 2 * size, borderRadius: 8 * size }]} />
      <View style={[styles.row, { gap: 4 * size }]}>
        {grade === 'blurry' ? <>
          {/* At rest (scaled to 1/size) on the print resting at 0.76 the icons read at 28 pt: a white plate, navy outline, like the good plates */}
          <GameIcon name="camera" size={Math.round(37 * size)} />
          <GameIcon name="retry" size={Math.round(37 * size)} />
          {soClose && <GameIcon name="star" size={Math.round(26 * size)} />}
        </> : <>
          {double ? <View style={{ gap: 1 * size }}>
            <View style={styles.row}>{Array.from({ length: stars }, (_, i) => <GameIcon key={i} name="star" size={icon} />)}</View>
            <View style={styles.row}>{Array.from({ length: stars }, (_, i) => <GameIcon key={i} name="star" size={icon} />)}</View>
          </View> : Array.from({ length: stars }, (_, i) => <GameIcon key={i} name="star" size={icon} />)}
          <Text style={[styles.text, { color: plate.text, fontSize: 20 * size, marginLeft: 2 * size },
            outlined && { textShadowColor: INK, textShadowOffset: { width: 0, height: 2 * size }, textShadowRadius: 0.1 }]}>
            {double ? `Double ${GRADE_LABEL[grade]}` : GRADE_LABEL[grade]}
          </Text>
        </>}
      </View>
    </View>
  );
}

export default memo(StampPlate);

const styles = StyleSheet.create({
  plate: { borderColor: INK, overflow: 'hidden' },
  bevel: { position: 'absolute', height: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontFamily: 'Shark', letterSpacing: 0.5 },
});
