import { useState } from 'react';
import { Text, View } from 'react-native';
import { helpSheetForInfoModal, type HelpSheetId } from '../services/help/helpSheets';
import { BRAND } from '../ui';
import { Breathe } from '../ui/AmbientSwim';
import PressableScale from '../ui/PressableScale';
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

  const content = helpSheetForInfoModal(id, sheet ?? 'basics');

  return (
    <>
      {/* The "?" calls softly (a 10 percent breath every 3 s) through the ambient budget: it sleeps off
          screen, in the background, when idle and with Reduce Motion. The press is the shared squish. */}
      <PressableScale accessibilityLabel={`${content.name} help`} hitSlop={8} haptic="tickSelection"
        onPress={() => setVisible(true)}>
        <Breathe amount={0.1} periodMs={3000} active={!visible}>
          <View style={{
            width: 35, height: 35, borderRadius: 999, backgroundColor: BRAND.blueBright,
            justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: BRAND.white,
          }}>
            <Text style={{ fontFamily: 'Shark', fontSize: 20, color: 'white', textAlign: 'center', lineHeight: 22 }}>?</Text>
          </View>
        </Breathe>
      </PressableScale>
      <HelpSheet visible={visible} sheet={content} onClose={() => setVisible(false)} />
    </>
  );
}
