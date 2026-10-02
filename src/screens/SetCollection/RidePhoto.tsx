/**
 * Ride Photo: the on-ride snapshot from a rare catch, framed by the player's
 * best grade (Good: plain white, Great: a blue double mat with star stickers,
 * Frame It!: a glossy gold frame with a plaque). When the server sends a
 * rendered photo it is used; otherwise the photo is drawn here: the find
 * riding a coaster car against a bright sky.
 *
 * RidePhotoShareCard is the 9:16 Story card in the park-day share-card style,
 * rendered off-screen and captured at 1080x1920.
 */
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ShareCardArtwork from '../../components/ShareCardArtwork';
import { BRAND, GameIcon } from '../../ui';
import { PHOTO_GRADE_LABEL, type PhotoGrade } from './dexModel';

export const RIDE_SHARE_WIDTH = 360;
export const RIDE_SHARE_HEIGHT = 640;

/** Frame look per grade. Pure data so tests can check the three tiers differ. */
export const PHOTO_FRAMES: Readonly<Record<PhotoGrade, { outer: readonly [string, string]; border: number; mat: string | null; stars: boolean; plaque: boolean }>> = {
  good: { outer: ['#ffffff', '#ffffff'], border: 6, mat: null, stars: false, plaque: false },
  great: { outer: ['#ffffff', '#e6f4ff'], border: 7, mat: '#7cc6f5', stars: true, plaque: false },
  frame_it: { outer: ['#ffe9a3', '#d99a00'], border: 13, mat: '#fff8e4', stars: true, plaque: true },
};

function Scene({ art, width, height }: { readonly art: ImageSource; readonly width: number; readonly height: number }) {
  // A loop of coaster track sweeping up behind the car.
  const track = `M -10 ${height * 0.86} C ${width * 0.25} ${height * 0.86}, ${width * 0.42} ${height * 0.3}, ${width * 0.66} ${height * 0.34} S ${width + 20} ${height * 0.7}, ${width + 20} ${height * 0.7}`;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <LinearGradient colors={['#9be0ff', '#3aa7f0']} style={StyleSheet.absoluteFill} />
      <View style={[styles.sun, { left: width * 0.72, top: height * 0.08 }]} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={track} stroke="#05346e" strokeWidth={14} fill="none" strokeLinecap="round" />
        <Path d={track} stroke="#ef4a3c" strokeWidth={8} fill="none" strokeLinecap="round" />
        <Path d={track} stroke="#ffffff" strokeWidth={2} fill="none" strokeDasharray="6 10" />
      </Svg>
      {/* Speed lines */}
      {[0.38, 0.5, 0.62].map(y => <View key={y} style={[styles.speed, { top: height * y, left: width * 0.04, width: width * 0.16 }]} />)}
      <View style={[styles.car, { left: width * 0.22, bottom: height * 0.06, width: width * 0.56, height: height * 0.3 }]}>
        <LinearGradient colors={['#ff7a5c', '#d93a52']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
        <View style={styles.carShine} />
        <View style={[styles.wheel, { left: '12%' }]} />
        <View style={[styles.wheel, { right: '12%' }]} />
      </View>
      <Image source={art} contentFit="contain"
        style={{ position: 'absolute', left: width * 0.27, bottom: height * 0.22, width: width * 0.46, height: height * 0.62 }} />
      <View style={[styles.carFront, { left: width * 0.22, bottom: height * 0.06, width: width * 0.56, height: height * 0.16 }]}>
        <LinearGradient colors={['#ff6a4c', '#c42f47']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
      </View>
    </View>
  );
}

/** The framed Ride Photo. `width` is the outer width; the photo is 4:3 inside the frame. */
export function RidePhoto({ grade, art, photoUrl, width, showGrade = true }: {
  readonly grade: PhotoGrade; readonly art: ImageSource; readonly photoUrl: string | null; readonly width: number;
  readonly showGrade?: boolean;
}) {
  const frame = PHOTO_FRAMES[grade];
  const mat = frame.mat ? 5 : 0;
  const inner = width - (frame.border + mat) * 2;
  const innerHeight = Math.round(inner * 0.75);
  return (
    <View style={{ width, alignItems: 'center' }}>
      <LinearGradient colors={frame.outer as [string, string]} style={[styles.frame, { padding: frame.border, borderRadius: 16 + frame.border / 2 }]}>
        {grade === 'frame_it' && <View style={styles.gloss} pointerEvents="none" />}
        <View style={{ padding: mat, backgroundColor: frame.mat ?? 'transparent', borderRadius: 12 }}>
          <View style={{ borderRadius: 9, overflow: 'hidden' }}>
            {photoUrl
              ? <Image source={{ uri: photoUrl }} style={{ width: inner, height: innerHeight }} contentFit="cover" />
              : <Scene art={art} width={inner} height={innerHeight} />}
            <Text style={styles.stamp}>RIDE PHOTO</Text>
          </View>
        </View>
        {frame.stars && <View style={[styles.starSticker, { left: -10, top: -10 }]}><GameIcon name="star" size={30} /></View>}
        {frame.stars && <View style={[styles.starSticker, { right: -10, top: -10 }]}><GameIcon name="star" size={30} /></View>}
      </LinearGradient>
      {showGrade && (frame.plaque ? (
        <LinearGradient colors={['#ffe07a', '#e0a100']} style={styles.plaque}>
          <Text style={styles.plaqueText}>{PHOTO_GRADE_LABEL[grade]}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.gradePill, grade === 'great' && { backgroundColor: BRAND.blueBright }]}>
          <Text style={[styles.gradeText, grade === 'great' && { color: BRAND.white }]}>{PHOTO_GRADE_LABEL[grade]}</Text>
        </View>
      ))}
    </View>
  );
}

/** 9:16 share card, park-day style: water background, logo, the framed photo, who caught what. */
export const RidePhotoShareCard = forwardRef<View, {
  readonly grade: PhotoGrade; readonly art: ImageSource; readonly photoUrl: string | null;
  readonly itemName: string; readonly setName: string; readonly sharkName?: string | null;
  readonly onReadyChange?: (ready: boolean) => void;
}>(function RidePhotoShareCard({ grade, art, photoUrl, itemName, setName, sharkName, onReadyChange }, ref) {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const required = useMemo(() => ['background', 'logo'], []);
  const markReady = useCallback((key: string) => setLoaded(previous =>
    previous.has(key) ? previous : new Set([...previous, key])), []);
  const ready = required.every(key => loaded.has(key));
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  return (
    <View ref={ref} collapsable={false} style={styles.share}>
      <ShareCardArtwork artworkKey="background" onReady={markReady} source={require('../../../assets/images/water_background.png')}
        style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5, 52, 110, 0.25)' }]} />
      <ShareCardArtwork artworkKey="logo" onReady={markReady} source={require('../../../assets/images/screens/login/logo.png')}
        style={styles.shareLogo} contentFit="contain" />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.shareKicker}>{sharkName ? `${sharkName}'s Ride Photo` : 'My Ride Photo'}</Text>
        <RidePhoto grade={grade} art={art} photoUrl={photoUrl} width={300} />
        <Text style={styles.shareItem}>{itemName}</Text>
        <Text style={styles.shareSet}>{setName}</Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.shareCta}>Catch one yourself!</Text>
        <Text style={styles.shareHandle}>Theme Park Shark app · @themeparkshark</Text>
      </View>
    </View>
  );
});

export function Offscreen({ children }: { readonly children: ReactNode }) {
  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sun: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff3b0', opacity: 0.9 },
  speed: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  car: { position: 'absolute', borderRadius: 18, borderWidth: 3, borderColor: '#05346e' },
  carShine: { position: 'absolute', left: 10, right: 10, top: 6, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  carFront: { position: 'absolute', borderRadius: 14, borderWidth: 3, borderColor: '#05346e' },
  wheel: { position: 'absolute', bottom: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: '#05346e', borderWidth: 3, borderColor: '#bfe5ff' },
  frame: {
    shadowColor: BRAND.shadow, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
  },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: 'rgba(255,255,255,0.28)' },
  stamp: {
    position: 'absolute', left: 8, bottom: 6, fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1.5, color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  starSticker: { position: 'absolute' },
  plaque: { marginTop: -10, paddingHorizontal: 18, paddingVertical: 4, borderRadius: 10, borderWidth: 3, borderColor: BRAND.white },
  plaqueText: { fontFamily: 'Shark', fontSize: 17, color: '#7a3d00' },
  gradePill: { marginTop: -10, paddingHorizontal: 14, paddingVertical: 3, borderRadius: 999, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.sky },
  gradeText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  share: {
    width: RIDE_SHARE_WIDTH, height: RIDE_SHARE_HEIGHT, overflow: 'hidden', backgroundColor: '#0768b9',
    paddingHorizontal: 20, paddingTop: 34, paddingBottom: 26, justifyContent: 'space-between',
  },
  shareLogo: { width: '100%', height: 80 },
  shareKicker: { fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b', marginBottom: 12 },
  shareItem: { fontFamily: 'Shark', fontSize: 26, color: '#fff', marginTop: 14, textAlign: 'center' },
  shareSet: { fontFamily: 'Knockout', fontSize: 16, color: '#cdeaff' },
  shareCta: {
    fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  shareHandle: { fontFamily: 'Knockout', fontSize: 14, color: '#fff', marginTop: 2 },
  offscreen: { position: 'absolute', left: -2000, top: 0, width: RIDE_SHARE_WIDTH, height: RIDE_SHARE_HEIGHT },
});
