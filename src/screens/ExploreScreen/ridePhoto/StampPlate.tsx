import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GameIcon } from '../../../ui';
import { GRADE_LABEL, GRADE_STARS, type PhotoGrade } from '../ridePhoto';

const INK = '#0b2f5c';
/** Plate fills by grade; text is always outlined ink so it reads on any print. Stars carry the grade without colour. */
const PLATE: Record<PhotoGrade | 'so_close', { fill: [string, string]; text: string; label: string }> = {
  blurry: { fill: ['#2c4a74', '#173357'], text: '#ffffff', label: GRADE_LABEL.blurry },
  so_close: { fill: ['#3f6aa3', '#24497a'], text: '#ffffff', label: 'So close!' },
  good: { fill: ['#ffffff', '#e8eef6'], text: INK, label: GRADE_LABEL.good },
  great: { fill: ['#f5f8fc', '#aebdd0'], text: INK, label: GRADE_LABEL.great },
  frame_it: { fill: ['#ffe46b', '#f0a800'], text: '#ffffff', label: GRADE_LABEL.frame_it },
};

/**
 * The grade, as a tilted stamp plate: a thick ink outline, an inner bevel,
 * 1 to 3 stars, and the word. A miss shows a camera with a "try again" arrow.
 */
function StampPlate({ grade, soClose = false, size = 1 }: { grade: PhotoGrade; soClose?: boolean; size?: number }) {
  const key = grade === 'blurry' && soClose ? 'so_close' : grade;
  const plate = PLATE[key];
  const stars = GRADE_STARS[grade];
  const outlined = plate.text === '#ffffff';
  return (
    <View style={[styles.plate, { transform: [{ rotate: '-8deg' }, { scale: size }] }]}>
      <LinearGradient colors={plate.fill} style={[StyleSheet.absoluteFill, styles.fill]} />
      <View style={styles.bevel} />
      <View style={styles.row}>
        {stars > 0 ? Array.from({ length: stars }, (_, i) => <GameIcon key={i} name="star" size={18} />)
          : <GameIcon name="retry" size={18} />}
        <Text style={[styles.text, { color: plate.text }, outlined && styles.outlined]}>{plate.label}</Text>
      </View>
    </View>
  );
}

export default memo(StampPlate);

const styles = StyleSheet.create({
  plate: { borderRadius: 12, borderWidth: 3, borderColor: INK, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden',
    shadowColor: INK, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0, shadowOpacity: 0.5 },
  fill: { borderRadius: 9 },
  bevel: { position: 'absolute', left: 3, right: 3, top: 2, height: '45%', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.28)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontFamily: 'Shark', fontSize: 20, letterSpacing: 0.5, marginLeft: 2 },
  outlined: { textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
});
