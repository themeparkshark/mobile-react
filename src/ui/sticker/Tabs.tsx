/**
 * Tabs as filter chips (DIRECTION.md kit: Tabs): a row of groove pills; the picked one is
 * white, lifted 2 pt on a hard drop, never gold. Alex's small icons lead each chip.
 * Level 2: navy line 2, no white edge. Each chip is at least 44 pt to touch (hit slop), says
 * "tab" and "selected" to VoiceOver, and shrinks its words to fit on a small phone.
 */
import { memo } from 'react';
import { Image, Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { haptic } from '../../gamekit/Haptics';
import StickerText from './StickerText';
import { BUTTON, DROP, INK, LINE, SHADE, TYPE } from './tokens';

export type TabItem = { readonly key: string; readonly label: string; readonly icon?: ImageSourcePropType; readonly iconRatio?: number; readonly accessibilityLabel?: string };

const H = 30;
const LIFT = 2;
const PICKED = [INK.white, INK.cream] as const;

const Chip = memo(function Chip({ item, picked, onPick }: { item: TabItem; picked: boolean; onPick?: (key: string) => void }) {
  const slop = (BUTTON.minTouch - H) / 2;
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={item.accessibilityLabel ?? item.label} accessibilityState={{ selected: picked }}
      hitSlop={{ top: slop, bottom: slop }} onPress={() => { haptic('tapLight'); onPick?.(item.key); }}
      style={{ flexShrink: 1, height: H + 3, marginTop: picked ? 0 : LIFT }}>
      {picked ? <View style={{ position: 'absolute', left: 0, right: 0, top: 3, height: H, borderRadius: H / 2, backgroundColor: DROP.knob }} /> : null}
      <View style={{ height: H, borderRadius: H / 2, borderWidth: LINE.chip, borderColor: INK.navy, overflow: 'hidden', backgroundColor: INK.blueLip,
        flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 9, gap: 3 }}>
        {picked ? <LinearGradient colors={PICKED} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: H / 2,
          borderTopWidth: picked ? 0 : 3, borderBottomWidth: picked ? 3 : 0, borderColor: picked ? INK.creamDeep : SHADE.grooveInset }} />
        {item.icon ? <Image source={item.icon} resizeMode="contain" fadeDuration={0} style={{ height: 22, width: 22 * (item.iconRatio ?? 1), marginTop: -2 }} /> : null}
        <View style={{ flexShrink: 1, paddingTop: 2 }}>
          <StickerText size={TYPE.tagSmall} tone={picked ? 'navy' : 'white'} stroke={0} spacing={0.01} align="left" lineHeight={16} fit role="none" maxScale={1.2}>{item.label}</StickerText>
        </View>
      </View>
    </Pressable>
  );
});

function TabsImpl({ items, picked, onPick, style }: { readonly items: readonly TabItem[]; readonly picked: string; readonly onPick?: (key: string) => void; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }, style]}>
      {items.map(item => <Chip key={item.key} item={item} picked={item.key === picked} onPick={onPick} />)}
    </View>
  );
}

const Tabs = memo(TabsImpl);
export default Tabs;
