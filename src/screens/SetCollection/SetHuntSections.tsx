/**
 * Reward pieces of the collection book: the wearable pick sheet and the
 * WEAR IT card after a claim. Logic lives in setHuntModel.ts.
 */
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { BRAND, GameButton, GameIcon, RADIUS } from '../../ui';
import { ADDED_TO_INVENTORY, WEAR_IT, validPick, type ClaimOutcome, type MilestoneView } from './setHuntModel';

const card = {
  marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: RADIUS.lg, backgroundColor: BRAND.cream,
  borderWidth: 3, borderColor: BRAND.white,
} as const;

/** Pick a wearable for a wearable_pick milestone. Owned choices are shown but cannot be picked. */
export function MilestonePickSheet({ view, busy, onConfirm, onClose, overlay }: {
  readonly view: MilestoneView | null;
  /** Drawn over the whole sheet window (the claim build-up while the server answers). */
  readonly overlay?: ReactNode;
  readonly busy: boolean;
  readonly onConfirm: (itemId: number) => void;
  readonly onClose: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [view?.key]);
  return (
    <Modal visible={view != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: BRAND.scrim }} />
      <View style={{ backgroundColor: BRAND.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, padding: 18, paddingBottom: 28 }}>
        <Text style={{ fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textTransform: 'uppercase', textAlign: 'center' }}>Pick a shark item</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginVertical: 12 }}>
          {(view?.choices ?? []).map(choice => {
            const selected = picked === choice.id;
            return (
              <Pressable key={choice.id} disabled={choice.owned} accessibilityRole="button" accessibilityState={{ selected, disabled: choice.owned }}
                accessibilityLabel={`${choice.name}${choice.owned ? ', owned' : ''}`}
                onPress={() => setPicked(choice.id)}
                style={{ width: 104, alignItems: 'center', padding: 6, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 3, borderColor: selected ? BRAND.gold : BRAND.sky, opacity: choice.owned ? 0.5 : 1 }}>
                {(choice.paper_url || choice.icon_url) ? <Image source={{ uri: (choice.paper_url ?? choice.icon_url) as string }} contentFit="contain" style={{ width: 64, height: 64 }} />
                  : <GameIcon name="gift" size={40} />}
                <Text numberOfLines={2} style={{ fontFamily: 'Knockout', fontSize: 15, lineHeight: 17, color: BRAND.navy, textAlign: 'center' }}>{choice.name}</Text>
                {choice.owned && (
                  <View style={{ position: 'absolute', top: -8, right: -8 }} accessible={false}><GameIcon name="check" size={26} /></View>
                )}
              </Pressable>
            );
          })}
        </View>
        <GameButton label="Claim" loading={busy} disabled={!view || !validPick(view, picked)} onPress={() => { if (picked != null) onConfirm(picked); }} />
        <GameButton label="Not now" variant="ghost" onPress={onClose} style={{ marginTop: 4 }} />
      </View>
      {overlay}
    </Modal>
  );
}

/** After a claim: "Added to your closet" with WEAR IT, or the pending line. */
export function ClaimResultCard({ outcome, wearing, onWear, onDismiss }: {
  readonly outcome: ClaimOutcome | null;
  readonly wearing: boolean;
  readonly onWear: () => void;
  readonly onDismiss: () => void;
}) {
  if (!outcome || (!outcome.wear && !outcome.pendingLine && !outcome.ticketNote)) return null;
  return (
    <View style={{ ...card, backgroundColor: BRAND.blueBright, borderColor: BRAND.gold }}>
      {outcome.wear && (
        <>
          <Text style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.white }}>{ADDED_TO_INVENTORY}</Text>
          <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.white, marginBottom: 6 }}>{outcome.wear.name}</Text>
          <GameButton label={WEAR_IT} loading={wearing} onPress={onWear} size="compact" />
        </>
      )}
      {!!outcome.pendingLine && <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.white }}>{outcome.pendingLine}</Text>}
      {!!outcome.ticketNote && <Text style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.white, marginTop: 4 }}>{outcome.ticketNote}</Text>}
      <GameButton label="Close" variant="ghost" tone="onBlue" onPress={onDismiss} />
    </View>
  );
}
