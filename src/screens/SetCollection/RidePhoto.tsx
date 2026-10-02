/**
 * Ride Photo: the on-ride snapshot from a rare catch, built from the same
 * Alex-style ride layers as the map's Ride Photo catch (scene, bushes, the
 * coaster car in two halves) with the find in the front seat and Alex's real
 * shark beside it. Framed by the best grade:
 *   Good: a plain white frame
 *   Great: a white frame on a blue mat with two star stickers
 *   Frame It!: a glossy gold frame with a plaque
 * The grade is a tilted rubber stamp, not a button. A server-rendered photo
 * replaces the drawn scene when one is sent.
 *
 * RidePhotoShareCard is the 9:16 Story card: water texture, logo, the photo,
 * the shark, and where to get the app. Rendered off-screen only on Share.
 */
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ShareCardArtwork from '../../components/ShareCardArtwork';
import { BRAND, GameIcon } from '../../ui';
import { RarityGems, rarityLook } from './dexLook';
import { PHOTO_GRADE_LABEL, type PhotoGrade } from './dexModel';

const SCENE_FAR = require('../../../assets/images/ride-photo/scene-far.webp');
const SCENE_NEAR = require('../../../assets/images/ride-photo/scene-near.webp');
const CAR_BACK = require('../../../assets/images/ride-photo/car-back.webp');
const CAR_FRONT = require('../../../assets/images/ride-photo/car-front.webp');
const SHARK = require('../../../assets/images/howto/shark.webp');

export const RIDE_SHARE_WIDTH = 360;
export const RIDE_SHARE_HEIGHT = 640;

/** Frame look per grade. Pure data so tests can check the three tiers differ. */
export const PHOTO_FRAMES: Readonly<Record<PhotoGrade, { outer: string; lip: string; border: number; mat: string | null; stars: boolean; plaque: boolean }>> = {
  good: { outer: '#ffffff', lip: '#d5e2ee', border: 7, mat: null, stars: false, plaque: false },
  great: { outer: '#ffffff', lip: '#9cc7ea', border: 7, mat: '#2f7fe8', stars: true, plaque: false },
  frame_it: { outer: '#f5b400', lip: '#b77f00', border: 12, mat: '#fff1c2', stars: true, plaque: true },
};

/** The drawn ride scene: sky and park, bushes, car back, the find and the shark in the seats, car front. */
function Scene({ art, width, height }: { readonly art: ImageSource; readonly width: number; readonly height: number }) {
  const carW = width * 0.72;
  const carH = carW * 0.62;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image source={SCENE_FAR} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Image source={SCENE_NEAR} style={{ position: 'absolute', left: -width * 0.05, right: -width * 0.05, bottom: -height * 0.02, height: height * 0.3 }} contentFit="cover" />
      <View style={{ position: 'absolute', left: (width - carW) / 2, bottom: height * 0.02, width: carW, height: carH }}>
        <Image source={CAR_BACK} style={StyleSheet.absoluteFill} contentFit="contain" />
        <Image source={SHARK} style={{ position: 'absolute', left: carW * 0.06, bottom: carH * 0.34, width: carW * 0.36, height: carW * 0.4, transform: [{ rotate: '-6deg' }] }} contentFit="contain" />
        <Image source={art} style={{ position: 'absolute', left: carW * 0.46, bottom: carH * 0.36, width: carW * 0.4, height: carW * 0.4 }} contentFit="contain" />
        <Image source={CAR_FRONT} style={StyleSheet.absoluteFill} contentFit="contain" />
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
  const mat = frame.mat ? 6 : 0;
  const inner = width - (frame.border + mat) * 2;
  const innerHeight = Math.round(inner * 0.75);
  return (
    <View style={{ width, alignItems: 'center' }} accessible accessibilityLabel={`Ride Photo, graded ${PHOTO_GRADE_LABEL[grade]}`}>
      <View style={[styles.frame, { padding: frame.border, backgroundColor: frame.outer, borderBottomColor: frame.lip }]}>
        {grade === 'frame_it' && (
          <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
        )}
        <View style={{ padding: mat, backgroundColor: frame.mat ?? 'transparent', borderRadius: 10 }}>
          <View style={{ borderRadius: 8, overflow: 'hidden' }}>
            {photoUrl
              ? <Image source={{ uri: photoUrl }} style={{ width: inner, height: innerHeight }} contentFit="cover" />
              : <Scene art={art} width={inner} height={innerHeight} />}
          </View>
        </View>
        {frame.stars && <View style={[styles.starSticker, { left: -12, top: -12 }]}><GameIcon name="star" size={34} /></View>}
        {frame.stars && <View style={[styles.starSticker, { right: -12, top: -12 }]}><GameIcon name="star" size={34} /></View>}
      </View>
      {showGrade && (
        <View style={[styles.stamp, grade === 'frame_it' ? styles.stampGold : grade === 'great' ? styles.stampBlue : styles.stampPlain]}>
          <Text style={[styles.stampText, grade === 'good' && { color: BRAND.navy }]}>{PHOTO_GRADE_LABEL[grade]}</Text>
        </View>
      )}
    </View>
  );
}

/** 9:16 share card: water texture, logo, the photo, the shark, the item, where to get the app. */
export const RidePhotoShareCard = forwardRef<View, {
  readonly grade: PhotoGrade; readonly art: ImageSource; readonly photoUrl: string | null; readonly rarity: number;
  readonly itemName: string; readonly setName: string; readonly sharkName?: string | null;
  readonly onReadyChange?: (ready: boolean) => void;
}>(function RidePhotoShareCard({ grade, art, photoUrl, rarity, itemName, setName, sharkName, onReadyChange }, ref) {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const required = useMemo(() => ['background', 'logo', 'shark'], []);
  const markReady = useCallback((key: string) => setLoaded(previous =>
    previous.has(key) ? previous : new Set([...previous, key])), []);
  const ready = required.every(key => loaded.has(key));
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const look = rarityLook(rarity);
  return (
    <View ref={ref} collapsable={false} style={styles.share}>
      <LinearGradient colors={['#1d9bf0', '#0768b9', '#05346e']} style={StyleSheet.absoluteFill} />
      <ShareCardArtwork artworkKey="background" onReady={markReady} source={require('../../../assets/images/shark_background.png')}
        style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" />
      <ShareCardArtwork artworkKey="logo" onReady={markReady} source={require('../../../assets/images/screens/login/logo.png')}
        style={styles.shareLogo} contentFit="contain" />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.shareKicker}>{sharkName ? `${sharkName}'s Ride Photo` : 'My Ride Photo'}</Text>
        <RidePhoto grade={grade} art={art} photoUrl={photoUrl} width={300} />
        <Text style={styles.shareItem}>{itemName}</Text>
        <View style={[styles.shareRarity, { backgroundColor: look.chip, borderColor: look.frame }]}>
          <RarityGems rarity={rarity} size={9} />
          <Text style={styles.shareRarityText}>{look.label}{setName ? ` · ${setName}` : ''}</Text>
        </View>
      </View>
      <View style={styles.shareFoot}>
        <ShareCardArtwork artworkKey="shark" onReady={markReady} source={SHARK} style={styles.shareShark} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.shareCta}>Catch one yourself!</Text>
          <Text style={styles.shareHandle}>Theme Park Shark on the App Store</Text>
          <Text style={styles.shareHandle}>@themeparkshark</Text>
        </View>
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
  frame: { borderRadius: 16, borderBottomWidth: 6, shadowColor: BRAND.shadow, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  starSticker: { position: 'absolute' },
  stamp: {
    marginTop: -16, paddingHorizontal: 16, height: 36, justifyContent: 'center', borderRadius: 8, borderWidth: 3,
    transform: [{ rotate: '-6deg' }],
  },
  stampPlain: { backgroundColor: BRAND.white, borderColor: BRAND.navy },
  stampBlue: { backgroundColor: '#2f7fe8', borderColor: BRAND.white },
  stampGold: { backgroundColor: '#c0392b', borderColor: '#ffe07a' },
  stampText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, letterSpacing: 1, textTransform: 'uppercase' },
  share: {
    width: RIDE_SHARE_WIDTH, height: RIDE_SHARE_HEIGHT, overflow: 'hidden', backgroundColor: '#0768b9',
    paddingHorizontal: 20, paddingTop: 30, paddingBottom: 22, justifyContent: 'space-between',
  },
  shareLogo: { width: '100%', height: 76 },
  shareKicker: { fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b', marginBottom: 14 },
  shareItem: { fontFamily: 'Shark', fontSize: 26, color: '#fff', marginTop: 12, textAlign: 'center' },
  shareRarity: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 3 },
  shareRarityText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  shareFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareShark: { width: 84, height: 94 },
  shareCta: {
    fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  shareHandle: { fontFamily: 'Knockout', fontSize: 15, color: '#fff', marginTop: 1 },
  offscreen: { position: 'absolute', left: -2000, top: 0, width: RIDE_SHARE_WIDTH, height: RIDE_SHARE_HEIGHT },
});
