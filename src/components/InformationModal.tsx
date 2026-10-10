import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text } from 'react-native';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { helpSheetForInfoModal, type HelpSheetId } from '../services/help/helpSheets';
import { BRAND } from '../ui';
import HelpSheet from './help/HelpSheet';

/**
 * The "?" on a screen's top bar. It opens this screen's help sheet: a short,
 * picture-led explainer (src/services/help/helpSheets.ts). The old server text
 * for these ids described retired boards, so it is no longer shown.
 */
export default function InformationModal({ id, sheet }: {
  /** Information-modal id from src/models/information-modal-enums.ts. */
  readonly id?: number;
  /** Or name the sheet directly (screens without an old id, like Redeem). */
  readonly sheet?: HelpSheetId;
}) {
  const [visible, setVisible] = useState(false);
  const reduced = useReducedGameMotion();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced || visible) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, reduced, visible]);

  const content = helpSheetForInfoModal(id, sheet ?? 'basics');

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${content.name} help`} hitSlop={8}
        onPress={() => setVisible(true)}>
        <Animated.View style={{
          transform: [{ scale: pulseAnim }], width: 35, height: 35, borderRadius: 999, backgroundColor: BRAND.blueBright,
          justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: BRAND.white,
        }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 20, color: 'white', textAlign: 'center', lineHeight: 22 }}>?</Text>
        </Animated.View>
      </Pressable>
      <HelpSheet visible={visible} sheet={content} onClose={() => setVisible(false)} />
    </>
  );
}
