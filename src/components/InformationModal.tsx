import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text } from 'react-native';
import getInformationModal from '../api/endpoints/information-modals/get';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { INFO_MODAL_TOPICS, infoSheetSections } from '../services/help/helpTopics';
import { BRAND } from '../ui';
import { useHelp } from './help/HelpProvider';
import HomeHuntInfoSheet from './home/HomeHuntInfoSheet';

const modalOpenSound = require('../../assets/sounds/modal_open.mp3');
const modalCloseSound = require('../../assets/sounds/modal_close.mp3');

/**
 * The "?" on a screen's top bar. It opens right away with the matching How to
 * play cards; any text the team wrote on the server shows on top when it loads.
 * It is never empty and never stuck on a spinner.
 */
export default function InformationModal({ id }: { readonly id?: number }) {
  const [visible, setVisible] = useState(false);
  const [serverContent, setServerContent] = useState<string | null>(null);
  const fetched = useRef(false);
  const { playSound } = useContext(SoundEffectContext);
  const { openHowToPlay } = useHelp();
  const reduced = useReducedGameMotion();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, reduced]);

  useEffect(() => {
    if (!visible || id == null || fetched.current) return;
    fetched.current = true;
    let live = true;
    getInformationModal(id)
      .then(response => { if (live) setServerContent(typeof response?.content === 'string' ? response.content : null); })
      .catch(() => undefined); // The local cards already explain the screen.
    return () => { live = false; };
  }, [visible, id]);

  const close = () => {
    playSound(modalCloseSound);
    setVisible(false);
  };
  const topic = id != null ? INFO_MODAL_TOPICS[id]?.[0] : undefined;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Help for this screen" hitSlop={8}
        onPress={() => { playSound(modalOpenSound); setVisible(true); }}>
        <Animated.View style={{
          transform: [{ scale: pulseAnim }], width: 35, height: 35, borderRadius: 999, backgroundColor: BRAND.blueBright,
          justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: BRAND.white,
        }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 20, color: 'white', textAlign: 'center', lineHeight: 22 }}>?</Text>
        </Animated.View>
      </Pressable>
      <HomeHuntInfoSheet visible={visible} title="How it works" sections={infoSheetSections(id, serverContent)}
        onClose={close} moreLabel="Open How to play" onMore={() => { setVisible(false); openHowToPlay(topic); }} />
    </>
  );
}
