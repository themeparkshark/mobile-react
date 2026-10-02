import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { balanceLine, type GlossaryKey, type GlossaryTerm } from '../../services/help/glossary';
import { BRAND, GameButton, GameIcon, RADIUS } from '../../ui';

/**
 * "What's this?" for one term: what it does, how to get it, and how many you
 * have. Same cream bottom sheet as the Home Hunt info sheet.
 */
export default function TermSheet({ visible, term, count, onClose, onOpenGuide }: {
  readonly visible: boolean;
  readonly term: GlossaryTerm | null;
  readonly count?: number | null;
  readonly glossary?: Readonly<Record<GlossaryKey, GlossaryTerm>>;
  readonly onOpenTerm?: (key: GlossaryKey) => void;
  readonly onOpenGuide?: () => void;
  readonly onClose: () => void;
}) {
  const balance = term ? balanceLine(term, count) : null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: BRAND.scrim }} />
      {term && (
        <View accessibilityViewIsModal style={{
          maxHeight: '70%', backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
          borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 30,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' }}>
              <GameIcon name={term.icon} size={34} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft, textTransform: 'uppercase', letterSpacing: 1 }}>
                What's this?
              </Text>
              <Text accessibilityRole="header" style={{ fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textTransform: 'uppercase' }}>
                {term.label}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <GameIcon name="close" size={30} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {!!balance && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: BRAND.white, borderRadius: RADIUS.pill, borderWidth: 2,
                borderColor: BRAND.sky, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 }}>
                <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.blue }}>{balance}</Text>
              </View>
            )}
            <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, textTransform: 'uppercase', marginBottom: 2 }}>What it does</Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navy, marginBottom: 12 }}>{term.what}</Text>
            <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, textTransform: 'uppercase', marginBottom: 2 }}>How to get it</Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navy, marginBottom: 16 }}>{term.earn}</Text>
            <GameButton label="Got it" onPress={onClose} />
            {onOpenGuide && (
              <GameButton label="How to play" variant="ghost" icon="info" onPress={onOpenGuide}
                accessibilityHint="Opens the full guide" style={{ marginTop: 6 }} />
            )}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}
