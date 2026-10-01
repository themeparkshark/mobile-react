import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { HOME_HUNT_COPY } from '../../constants/homeHuntCopy';
import { BRAND, GameButton, RADIUS } from '../../ui';
import { birthYearOptions } from './homeHuntModel';

const ROW = 46;
const WINDOW = ROW * 5;

/**
 * The neutral age question: a year wheel with no default and a Skip button.
 * Nothing is selected until the player scrolls or taps a year, and Save stays
 * off until then. Skipping is always allowed.
 */
export default function HomeHuntAgeSheet({ visible, busy, onSave, onSkip }: {
  readonly visible: boolean;
  readonly busy?: boolean;
  readonly onSave: (year: number) => void;
  readonly onSkip: () => void;
}) {
  const years = useRef(birthYearOptions(new Date().getFullYear())).current;
  const [picked, setPicked] = useState<number | null>(null);
  const list = useRef<FlatList<number>>(null);
  useEffect(() => { if (!visible) setPicked(null); }, [visible]);

  const settle = (offset: number) => {
    const index = Math.max(0, Math.min(years.length - 1, Math.round(offset / ROW)));
    setPicked(years[index]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
          borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, padding: 18, paddingBottom: 28,
        }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center', textTransform: 'uppercase' }}>
            {HOME_HUNT_COPY.ageQuestion}
          </Text>
          <Text style={{ fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navySoft, textAlign: 'center', marginTop: 4 }}>
            {HOME_HUNT_COPY.ageWhy}
          </Text>
          <View style={{ height: WINDOW, marginVertical: 12, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.sky, overflow: 'hidden' }}>
            {picked != null && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: ROW * 2, height: ROW, backgroundColor: '#fff4cc', borderTopWidth: 2, borderBottomWidth: 2, borderColor: BRAND.gold }} />
            )}
            <FlatList
              ref={list}
              data={years}
              keyExtractor={year => String(year)}
              getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
              snapToInterval={ROW}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: ROW * 2 }}
              onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.y)}
              onScrollEndDrag={event => settle(event.nativeEvent.contentOffset.y)}
              renderItem={({ item: year, index }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Born in ${year}`}
                  onPress={() => { setPicked(year); list.current?.scrollToOffset({ offset: index * ROW, animated: true }); }}
                  style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Shark', fontSize: picked === year ? 26 : 20, color: picked === year ? BRAND.navy : BRAND.navySoft, fontVariant: ['tabular-nums'] }}>{year}</Text>
                </Pressable>
              )}
            />
          </View>
          <GameButton label={HOME_HUNT_COPY.ageSave} disabled={picked == null} loading={busy} onPress={() => { if (picked != null) onSave(picked); }} />
          <GameButton label={HOME_HUNT_COPY.ageSkip} variant="ghost" disabled={busy} onPress={onSkip} style={{ marginTop: 4 }} />
        </View>
      </View>
    </Modal>
  );
}
