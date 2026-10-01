/**
 * Home Hunt pieces of the Set screen: hero row, per-rarity exchange costs,
 * gate badges, the milestone track, the wearable pick sheet and the WEAR IT
 * card. Logic lives in setHuntModel.ts; these only draw it.
 */
import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { PrepItemSetItem, SetItemGate } from '../../api/endpoints/me/prep-item-sets';
import { HOME_HUNT_COPY } from '../../constants/homeHuntCopy';
import { BRAND, GameButton, GameIcon, RADIUS } from '../../ui';
import {
  ADDED_TO_INVENTORY, WEAR_IT, WEARABLE_PENDING, gateExplainer, gateIcon, gateLabel, rarityName, validPick,
  type ClaimOutcome, type ExchangeCostRow, type MilestoneView,
} from './setHuntModel';

const RARITY_COLOR: Record<number, string> = { 1: '#4CAF50', 2: '#0879ca', 3: '#9C27B0', 4: '#FF9800', 5: '#FFD700' };

const card = {
  marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: RADIUS.lg, backgroundColor: BRAND.cream,
  borderWidth: 3, borderColor: BRAND.white,
} as const;

/** Clock, star or sparkle chip for a gated item, with the server's explainer under it when `explain` is set. */
export function GateBadge({ gate, explain = false }: { readonly gate: SetItemGate | null | undefined; readonly explain?: boolean }) {
  const icon = gateIcon(gate);
  if (!gate || !icon) return null;
  return (
    <View style={{ alignSelf: 'stretch', marginTop: 8, padding: 8, borderRadius: RADIUS.md, backgroundColor: '#fff4cc', borderWidth: 2, borderColor: BRAND.gold }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <GameIcon name={icon} size={22} />
        <Text style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.navy }}>{gateLabel(gate).toUpperCase()}</Text>
      </View>
      {explain && !!gateExplainer(gate) && (
        <Text style={{ fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navy, marginTop: 4 }}>{gateExplainer(gate)}</Text>
      )}
    </View>
  );
}

/** The legendary, then the epics, on one scrolling row. */
export function SetHeroRow({ items, imageFor, onPress }: {
  readonly items: readonly PrepItemSetItem[];
  readonly imageFor: (item: PrepItemSetItem) => ImageSource | null;
  readonly onPress: (item: PrepItemSetItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={card}>
      <Text style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textTransform: 'uppercase', marginBottom: 8 }}>Top finds</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {items.map(item => {
          const image = imageFor(item);
          const color = RARITY_COLOR[item.rarity] ?? RARITY_COLOR[1];
          return (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.is_collected ? item.name : 'Not found yet'}, ${rarityName(item.rarity)}`}
              onPress={() => onPress(item)} style={{ width: 84, alignItems: 'center' }}>
              <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: color, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center' }}>
                {image ? <Image source={image} contentFit="contain" style={{ width: 56, height: 56, opacity: item.is_collected ? 1 : 0.35 }} />
                  : <GameIcon name="gift" size={34} />}
                {!!item.gate && (
                  <View style={{ position: 'absolute', right: -6, top: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.gold, alignItems: 'center', justifyContent: 'center' }}>
                    <GameIcon name={gateIcon(item.gate) ?? 'timer'} size={16} />
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={{ fontFamily: 'Knockout', fontSize: 13, color: BRAND.navy, marginTop: 4 }}>{item.is_collected ? item.name : '???'}</Text>
              <Text style={{ fontFamily: 'Shark', fontSize: 11, color }}>{rarityName(item.rarity).toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** "Exchange spares: Common 4, Epic 8, Legendary 12" with the odds info button. */
export function ExchangeCostsRow({ rows, onOdds }: { readonly rows: readonly ExchangeCostRow[]; readonly onOdds: () => void }) {
  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textTransform: 'uppercase' }}>Exchange spares</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Drop odds" onPress={onOdds} hitSlop={10}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 }}>
          <GameIcon name="info" size={28} />
        </Pressable>
      </View>
      {rows.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {rows.map(row => (
            <View key={row.rarity} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: BRAND.white, borderWidth: 2, borderColor: RARITY_COLOR[row.rarity] ?? BRAND.sky }}>
              <Text style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy }}>{row.label}</Text>
              <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.blue }}>{row.cost}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Milestones 8 / 20 (Month goal) / 30 / 40, each with its own claim button. */
export function MilestoneTrack({ views, busyKey, onClaim }: {
  readonly views: readonly MilestoneView[];
  readonly busyKey: string | null;
  readonly onClaim: (view: MilestoneView) => void;
}) {
  if (views.length === 0) return null;
  return (
    <View style={card}>
      <Text style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textTransform: 'uppercase', marginBottom: 8 }}>Milestones</Text>
      {views.map(view => (
        <View key={view.key} style={{ marginBottom: 10, padding: 10, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 2, borderColor: view.canClaim ? BRAND.gold : BRAND.sky }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontFamily: 'Shark', fontSize: 16, color: BRAND.navy }}>{view.target} finds: {view.label}</Text>
            {view.monthGoal && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white }}>
                <Text style={{ fontFamily: 'Shark', fontSize: 11, color: BRAND.navy }}>MONTH GOAL</Text>
              </View>
            )}
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: BRAND.sky, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ width: `${Math.round(view.progress * 100)}%`, height: '100%', backgroundColor: view.status === 'claimed' ? BRAND.green : BRAND.gold }} />
          </View>
          <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft, marginTop: 4 }}>{Math.min(view.collected, view.target)}/{view.target}{view.rewardLine ? `, ${view.rewardLine}` : ''}</Text>
          {view.canClaim && (
            <GameButton label={busyKey === view.key ? HOME_HUNT_COPY.claiming : view.needsPick ? 'CHOOSE AND CLAIM' : HOME_HUNT_COPY.claim}
              loading={busyKey === view.key} onPress={() => onClaim(view)} size="compact" style={{ marginTop: 6 }} />
          )}
          {view.pending && <Text style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.blue, marginTop: 6 }}>{WEARABLE_PENDING}</Text>}
          {view.status === 'claimed' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <GameIcon name="check" size={18} />
              <Text style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.greenLip }}>{HOME_HUNT_COPY.claimed}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** Pick a wearable for a wearable_pick milestone. Owned choices are shown but cannot be picked. */
export function MilestonePickSheet({ view, busy, onConfirm, onClose }: {
  readonly view: MilestoneView | null;
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
        <Text style={{ fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textTransform: 'uppercase', textAlign: 'center' }}>Choose your wearable</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginVertical: 12 }}>
          {(view?.choices ?? []).map(choice => {
            const selected = picked === choice.id;
            return (
              <Pressable key={choice.id} disabled={choice.owned} accessibilityRole="button" accessibilityState={{ selected, disabled: choice.owned }}
                accessibilityLabel={`${choice.name}${choice.owned ? ', owned' : ''}`}
                onPress={() => setPicked(choice.id)}
                style={{ width: 92, alignItems: 'center', padding: 6, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 3, borderColor: selected ? BRAND.gold : BRAND.sky, opacity: choice.owned ? 0.5 : 1 }}>
                {(choice.paper_url || choice.icon_url) ? <Image source={{ uri: (choice.paper_url ?? choice.icon_url) as string }} contentFit="contain" style={{ width: 64, height: 64 }} />
                  : <GameIcon name="gift" size={40} />}
                <Text numberOfLines={2} style={{ fontFamily: 'Knockout', fontSize: 13, color: BRAND.navy, textAlign: 'center' }}>{choice.name}</Text>
                {choice.owned && <Text style={{ fontFamily: 'Shark', fontSize: 11, color: BRAND.navySoft }}>OWNED</Text>}
              </Pressable>
            );
          })}
        </View>
        <GameButton label="Claim" loading={busy} disabled={!view || !validPick(view, picked)} onPress={() => { if (picked != null) onConfirm(picked); }} />
        <GameButton label="Not now" variant="ghost" onPress={onClose} style={{ marginTop: 4 }} />
      </View>
    </Modal>
  );
}

/** After a claim: "Added to your Inventory" with WEAR IT, or the pending line. */
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
      <GameButton label="Dismiss" variant="ghost" tone="onBlue" onPress={onDismiss} />
    </View>
  );
}
