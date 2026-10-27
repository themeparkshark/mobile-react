import { Animated, ImageBackground, Pressable, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { artButtonFontSize } from '../ui/artButtonText';

/** Set once the pill art has drawn anywhere: later buttons know it is in the image cache. */
let pillArtSeen = false;
/**
 * The pill drawn in code while the picture is still decoding, built from the art's own layers and
 * colors (yellow_button.png, 800 x 204): a soft drop shadow, the dark brown rim, the orange lower
 * lip and the bright gold top band. Same box as the art (aspect 3.8, the picture fits its width), so
 * the swap to Alex's picture is not visible.
 */
const STAND_IN = {
  // The picture is 3.92 wide (contain in a 3.8 box): it fills the width and sits 1.5% in from top and bottom.
  frame: { position: 'absolute', left: 0, right: 0, top: '1.5%', bottom: '1.5%' },
  shadow: { position: 'absolute', left: '0.6%', right: '0.6%', top: '8%', bottom: 0, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.34)' },
  rim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: '9.8%', borderRadius: 999, backgroundColor: '#723500', overflow: 'hidden' },
  lip: { position: 'absolute', left: '1.3%', right: '1.3%', top: '5.5%', bottom: '6.5%', borderRadius: 999, backgroundColor: '#fbb40e', overflow: 'hidden' },
  band: { position: 'absolute', left: '1%', right: '1%', top: 0, bottom: '17%', borderRadius: 999, backgroundColor: '#fbcc0e' },
} as const;
/** The stand-in fades out under the picture over this long once the picture has drawn. */
const STAND_IN_FADE_MS = 120;

function StandInPill({ opacity }: { readonly opacity: Animated.Value }) {
  return (
    <Animated.View pointerEvents="none" style={[STAND_IN.frame, { opacity }]}>
      <View style={STAND_IN.shadow} />
      <View style={STAND_IN.rim}>
        <View style={STAND_IN.lip}>
          <View style={STAND_IN.band} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function YellowButton({
  disabled = false,
  text,
  onPress,
  onArtReady,
}: {
  readonly disabled?: boolean;
  readonly text: string;
  readonly onPress?: () => void;
  /** The pill art has drawn: a caller can show the button, its label and anything under it together. */
  readonly onArtReady?: () => void;
}) {
  const animated = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedGameMotion();
  // Label size follows the button's height so every label on this button matches (was a fixed 72pt shrink-to-fit).
  const [labelAreaHeight, setLabelAreaHeight] = useState(0);
  // The label never draws on its own: it waits for the pill art, so a kid never sees words with no button.
  const [artReady, setArtReady] = useState(false);
  const readyRef = useRef(onArtReady); readyRef.current = onArtReady;
  // The art itself has drawn (not just the safety below): until then a drawn gold pill sits under
  // the label, so words never show on the bare map, even when the picture is slow to decode.
  const [artLoaded, setArtLoaded] = useState(pillArtSeen);
  // Mounted only when the picture was not in the cache yet; it cross-fades out once the picture draws.
  const [standIn, setStandIn] = useState(!pillArtSeen);
  const standInOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!artLoaded || !standIn) return undefined;
    if (reducedMotion) { setStandIn(false); return undefined; }
    const fade = Animated.timing(standInOpacity, { toValue: 0, duration: STAND_IN_FADE_MS, useNativeDriver: true });
    fade.start(({ finished }) => { if (finished) setStandIn(false); });
    return () => fade.stop();
  }, [artLoaded, standIn, reducedMotion, standInOpacity]);
  const markArtReady = () => {
    setArtReady(true);
  };
  const markArtLoaded = () => {
    pillArtSeen = true;
    setArtLoaded(true);
    setArtReady(true);
  };
  // A safety: if the image never reports (an old cache), show the button anyway after a beat
  // (on its drawn stand-in pill).
  useEffect(() => {
    const t = setTimeout(markArtReady, pillArtSeen ? 120 : 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The caller hears "ready" once the art has drawn AND the label has its size, so the pill and its
  // words can never show one without the other (whichever of the two events lands first).
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current || !artReady || labelAreaHeight <= 0) return;
    reported.current = true;
    readyRef.current?.();
  }, [artReady, labelAreaHeight]);
  // A press that turns disabled (or Reduce Motion turning on) mid-press never leaves the pill at 0.97.
  useEffect(() => {
    if (disabled || reducedMotion) { animated.stopAnimation(); animated.setValue(1); }
    return () => animated.stopAnimation();
  }, [animated, disabled, reducedMotion]);
  // The pill and its words are one piece: neither draws until both are ready (same layer, same opacity).
  const ready = artReady && labelAreaHeight > 0;
  const zoomOut = () => {
    if (disabled || reducedMotion) {
      return;
    }

    Animated.timing(animated, {
      toValue: 0.97,
      duration: 65,
      useNativeDriver: true,
    }).start();
  };
  const zoomIn = () => {
    if (disabled || reducedMotion) {
      return;
    }

    Animated.timing(animated, {
      toValue: 1,
      duration: 95,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (disabled) {
          return;
        }

        onPress?.();
      }}
      onPressIn={zoomOut}
      onPressOut={zoomIn}
    >
      <Animated.View
        style={{
          opacity: ready ? 1 : 0,
          transform: [
            {
              scale: animated,
            },
          ],
        }}
      >
        {standIn && <StandInPill opacity={standInOpacity} />}
        <ImageBackground
          source={require('../../assets/images/yellow_button.png')}
          onLoadEnd={markArtLoaded}
          style={{
            width: '100%',
            aspectRatio: 3.8,
            opacity: disabled ? 0.5 : 1,
          }}
          resizeMode="contain"
        >
          <View
            onLayout={event => setLabelAreaHeight(event.nativeEvent.layout.height)}
            style={{
              justifyContent: 'center',
              aspectRatio: 4.4,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              maxFontSizeMultiplier={1.2}
              style={{
                textAlign: 'center',
                fontSize: artButtonFontSize(labelAreaHeight),
                color: 'white',
                fontFamily: 'Shark',
                textTransform: 'uppercase',
                textShadowColor: 'rgba(0, 0, 0, .5)',
                textShadowOffset: {
                  width: 1,
                  height: 1,
                },
                textShadowRadius: 0,
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 24,
                paddingRight: 24,
              }}
            >
              {text}
            </Text>
          </View>
        </ImageBackground>
      </Animated.View>
    </Pressable>
  );
}
