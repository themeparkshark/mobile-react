/**
 * Light overlays: the toast line (Shusher, offline), one coach mark at a time,
 * the Case File reveal and the exit moment. Each is one-tap dismissable and
 * never covers the whole map (real-world safety: eyes up, path clear).
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrightCaseFileDrop } from '../../api/endpoints/fright';
import { COPY } from '../../services/fright/copy';
import { overlayRightInset } from '../../services/fright/layout';
import { NIGHT } from '../../services/fright/theme';
import { COACH_LINES, type FrightCoachKey } from '../../services/fright/tutorial';
import { GameIcon } from '../../ui';
import { NightButton, NightCard } from './ui';

export function FrightToast({ text, onClose, top = 120 }: { readonly text: string | null; readonly onClose: () => void; readonly top?: number }) {
  useEffect(() => { if (text) AccessibilityInfo.announceForAccessibility?.(text); }, [text]);
  if (!text) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${text}. Dismiss`} onPress={onClose}
      style={[styles.toast, { top }]}>
      <Text style={styles.toastText}>{text}</Text>
    </Pressable>
  );
}

export function FrightCoachMark({ coach, onClose, top = 120 }: { readonly coach: FrightCoachKey | null; readonly onClose: () => void; readonly top?: number }) {
  useEffect(() => {
    if (!coach) return;
    AccessibilityInfo.announceForAccessibility?.(COACH_LINES[coach].line);
    const timer = setTimeout(onClose, 9000);
    return () => clearTimeout(timer);
  }, [coach]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!coach) return null;
  const { line, target } = COACH_LINES[coach];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Tip: ${line} Dismiss`} onPress={onClose}
      style={[styles.coach, { top }]}>
      {target === 'pill' && <View style={styles.pointerUp} />}
      <View style={styles.coachBody}>
        <GameIcon name="sparkle" size={20} />
        <Text style={styles.coachText}>{line}</Text>
        <GameIcon name="close" size={18} />
      </View>
    </Pressable>
  );
}

/** The exit moment (mode turns off): a gentle card leading to the Marquee. */
export function FrightExitCard({ visible, onOpen, onClose }: { readonly visible: boolean; readonly onOpen: () => void; readonly onClose: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.exit} accessibilityViewIsModal={false}>
      <NightCard style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fileTitle}>{COPY.exitTitle}</Text>
          <Text style={styles.fileBody}>{COPY.exitLine}</Text>
        </View>
        <NightButton label="See it" icon="star" onPress={onOpen} />
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} hitSlop={10}>
          <GameIcon name="close" size={24} />
        </Pressable>
      </NightCard>
    </View>
  );
}

const styles = StyleSheet.create({
  // Right edge stops left of the map's right rail (overlayRightInset).
  toast: { position: 'absolute', left: 16, right: overlayRightInset(), zIndex: 60, backgroundColor: NIGHT.midnight, borderRadius: 16,
    borderWidth: 2, borderColor: NIGHT.fog, paddingVertical: 10, paddingHorizontal: 14 },
  toastText: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.moon, textAlign: 'center' },
  coach: { position: 'absolute', left: 16, right: overlayRightInset(), zIndex: 59, alignItems: 'center' },
  pointerUp: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 12, borderLeftColor: 'transparent',
    borderRightColor: 'transparent', borderBottomColor: NIGHT.lantern },
  coachBody: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: NIGHT.haunt, borderRadius: 16, borderWidth: 3,
    borderColor: NIGHT.lantern, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44 },
  coachText: { flexShrink: 1, fontFamily: 'Knockout', fontSize: 16, color: NIGHT.white },
  center: { flex: 1, backgroundColor: NIGHT.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  file: { minWidth: 280, maxWidth: 360, borderColor: NIGHT.candy },
  kicker: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1, color: NIGHT.lantern },
  fileTitle: { fontFamily: 'Shark', fontSize: 22, color: NIGHT.candy, marginTop: 4 },
  fileBody: { fontFamily: 'Knockout', fontSize: 16, lineHeight: 21, color: NIGHT.fogLight, marginTop: 6 },
  exit: { position: 'absolute', left: 12, right: 12, bottom: 110, zIndex: 58 },
});
