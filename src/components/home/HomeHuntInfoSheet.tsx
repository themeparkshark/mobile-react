import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { getHomeHuntInfo, type HomeHuntInfo } from '../../api/endpoints/me/homeHunt';
import { BRAND, GameButton, GameIcon, RADIUS, SharkLoader } from '../../ui';
import type { InfoSection } from './homeHuntInfoModel';

// The rules are the same for everyone, so one read serves every sheet in the session.
let cachedInfo: HomeHuntInfo | null = null;

/** The server's info lines. Loads once per session while a sheet is open. */
export function useHomeHuntInfo(active: boolean): { info: HomeHuntInfo | null; error: boolean; retry: () => void } {
  const [info, setInfo] = useState<HomeHuntInfo | null>(cachedInfo);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || cachedInfo) return;
    let live = true;
    setError(false);
    getHomeHuntInfo().then(data => {
      cachedInfo = data ?? null;
      if (live) setInfo(cachedInfo);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [active, attempt]);
  return { info, error, retry: () => setAttempt(value => value + 1) };
}

/** A bottom sheet of server-written lines. Section titles are fixed; the lines come from the server verbatim. */
export default function HomeHuntInfoSheet({ visible, title, sections, loading, error, onRetry, onClose, moreLabel, onMore }: {
  readonly visible: boolean;
  readonly title: string;
  readonly sections: readonly InfoSection[];
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly onRetry?: () => void;
  readonly onClose: () => void;
  /** Optional second action under Got it, e.g. "Open How to play". */
  readonly moreLabel?: string;
  readonly onMore?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: BRAND.scrim }} />
      <View style={{
        maxHeight: '78%', backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
        borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <GameIcon name="info" size={28} />
          <Text style={{ flex: 1, marginLeft: 8, fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textTransform: 'uppercase' }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
            <GameIcon name="close" size={28} />
          </Pressable>
        </View>
        {error ? (
          <SharkLoader state="error" title="Couldn't load this" onRetry={onRetry} />
        ) : loading && sections.length === 0 ? (
          <SharkLoader />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {sections.map(section => (
              <View key={section.key} style={{ marginBottom: 14 }}>
                <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, textTransform: 'uppercase', marginBottom: 4 }}>{section.title}</Text>
                {section.lines.map((line, index) => (
                  <Text key={`${section.key}:${index}`} style={{ fontFamily: 'Knockout', fontSize: 16, lineHeight: 21, color: BRAND.navy, marginBottom: 3 }}>{line}</Text>
                ))}
              </View>
            ))}
            <GameButton label="Got it" variant="secondary" onPress={onClose} style={{ alignSelf: 'center', marginTop: 4 }} />
            {onMore && moreLabel ? (
              <GameButton label={moreLabel} variant="ghost" icon="info" onPress={onMore} style={{ alignSelf: 'center', marginTop: 4 }} />
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
