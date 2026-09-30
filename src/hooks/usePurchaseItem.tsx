import { useCallback, useContext, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { vsprintf } from 'sprintf-js';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';
import { PlayerType } from '../models/player-type';
import { BRAND, GameDialog, type GameDialogButton, type GameIconName } from '../ui';
import useCrumbs from './useCrumbs';

type ModalState =
  | { type: 'none' }
  | { type: 'owned'; item: ItemType }
  | { type: 'poor'; item: ItemType; shortfall: number }
  | { type: 'confirm'; item: ItemType; text: string }
  | { type: 'success'; item: ItemType }
  | { type: 'failed'; item: ItemType };

/** Player-facing currency names (docs/economy-glossary.md). */
export function currencyLabel(name: string, amount = 2): string {
  const key = name.toLowerCase();
  if (key === 'coins') return amount === 1 ? 'Shark Coin' : 'Shark Coins';
  if (key === 'tickets') return amount === 1 ? 'Park Ticket' : 'Park Tickets';
  if (amount === 1 && key.endsWith('s')) return name.slice(0, -1);
  return name;
}

/** The one thing to do next when a player is short, and where it goes. */
export function earnAction(name: string): { label: string; hint: string; icon: GameIconName } {
  switch (name.toLowerCase()) {
    case 'coins':
      return { label: 'Earn Shark Coins', hint: 'Catch a ride coin or open your daily chest to earn more.', icon: 'coins' };
    case 'keys':
      return { label: 'Find Keys', hint: 'Keys turn up on the park map. Walk the park to find more.', icon: 'map' };
    default:
      return { label: 'Keep exploring', hint: 'Play at the park and at home to earn more.', icon: 'map' };
  }
}

/** Balance, shortfall and what an item costs in its own currency. */
export function affordability(player: PlayerType, item: ItemType) {
  const walletValue = player[item.currency.name.toLowerCase() as keyof PlayerType];
  const balance = typeof walletValue === 'number' ? walletValue : 0;
  return { balance, shortfall: Math.max(0, item.cost - balance) };
}

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { prompts } = useCrumbs();
  const { player, isReady, refreshPlayer } = useContext(AuthContext);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [purchasing, setPurchasing] = useState(false);

  const closeModal = useCallback(() => setModal({ type: 'none' }), []);

  const purchaseItem = async (item: ItemType) => {
    if (!isReady || !player) return;

    if (item.has_purchased) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      setModal({ type: 'owned', item });
      return;
    }

    const { balance, shortfall } = affordability(player, item);
    if (shortfall > 0) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      setModal({ type: 'poor', item, shortfall });
      return;
    }

    const label = currencyLabel(item.currency.name, item.cost);
    const text =
      item.cost === 0
        ? vsprintf(prompts.redeem_item, [item.name])
        : `You have ${balance} ${currencyLabel(item.currency.name, balance)}. This costs ${item.cost} ${label}.`;

    playSound(require('../../assets/sounds/purchase_item_prompt.mp3'));
    setModal({ type: 'confirm', item, text });
  };

  const confirmPurchase = async (item: ItemType) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      await purchase(item);
      await refreshPlayer();
      playSound(require('../../assets/sounds/purchase_item_success.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setModal({ type: 'success', item });
    } catch (error: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      // The server says exactly how short the player is; otherwise nothing was charged.
      const data = (error as { response?: { data?: { code?: string; shortfall?: number } } })?.response?.data;
      if (data?.code === 'not_enough_currency') {
        void refreshPlayer();
        setModal({ type: 'poor', item, shortfall: Math.max(1, Number(data.shortfall) || 1) });
      } else {
        setModal({ type: 'failed', item });
      }
    } finally {
      setPurchasing(false);
    }
  };

  const dialog = dialogFor(modal, { confirmPurchase, closeModal, playSound });
  const current = modal;
  const purchaseModal = dialog ? (
    <GameDialog key={modal.type} visible title={dialog.title} message={dialog.message} icon={dialog.icon}
      buttons={dialog.buttons} haptic={dialog.haptic}
      onAnswer={() => setModal(m => (m === current ? { type: 'none' } : m))}>
      {dialog.body}
    </GameDialog>
  ) : null;

  return {
    purchaseItem,
    purchaseModal,
  };
}

function ItemArt({ item, price }: { readonly item: ItemType; readonly price?: boolean }) {
  return (
    <View style={styles.art}>
      <View style={styles.artWell}>
        <Image source={item.icon_url} style={styles.artImage} contentFit="contain" />
      </View>
      {price && item.cost > 0 && (
        <View style={styles.price}>
          <Image source={{ uri: item.currency.icon_url }} style={styles.priceIcon} contentFit="contain" />
          <Text style={styles.priceText}>{item.cost}</Text>
        </View>
      )}
    </View>
  );
}

function dialogFor(modal: ModalState, actions: {
  confirmPurchase: (item: ItemType) => Promise<void>;
  closeModal: () => void;
  playSound: (sound: number) => void;
}): { title: string; message?: string; icon?: GameIconName; buttons: GameDialogButton[]; body?: JSX.Element;
  haptic?: 'warning' | 'success' | 'none' } | null {
  switch (modal.type) {
    case 'none':
      return null;
    case 'owned':
      return { title: 'Already yours', message: `${modal.item.name} is already in your inventory.`,
        buttons: [{ text: 'Got it' }], body: <ItemArt item={modal.item} /> };
    case 'poor': {
      const need = currencyLabel(modal.item.currency.name, modal.shortfall);
      const earn = earnAction(modal.item.currency.name);
      return {
        title: `${modal.shortfall} more ${need}`,
        message: `${modal.item.name} costs ${modal.item.cost}. ${earn.hint}`,
        icon: earn.icon,
        buttons: [
          { text: earn.label, onPress: () => RootNavigation.navigate('Explore') },
          { text: 'Not now', style: 'cancel' },
        ],
        body: <ItemArt item={modal.item} price />,
      };
    }
    case 'confirm':
      return {
        title: modal.item.cost === 0 ? 'Free for you' : 'Buy this?',
        message: `${modal.item.name}. ${modal.text}`,
        buttons: [
          { text: modal.item.cost === 0 ? 'Take it' : 'Buy', onPress: () => void actions.confirmPurchase(modal.item) },
          { text: 'Cancel', style: 'cancel',
            onPress: () => actions.playSound(require('../../assets/sounds/purchase_item_cancel.mp3')) },
        ],
        body: <ItemArt item={modal.item} price />,
      };
    case 'success':
      return { title: 'It’s yours!', message: `${modal.item.name} is in your inventory. Dress your shark on your profile.`,
        buttons: [{ text: 'Awesome!' }], body: <ItemArt item={modal.item} />, haptic: 'success' };
    case 'failed':
      return {
        title: 'Purchase didn’t go through', message: 'You weren’t charged. Check your connection and try again.',
        buttons: [
          { text: 'Try again', onPress: () => void actions.confirmPurchase(modal.item) },
          { text: 'Not now', style: 'cancel' },
        ],
        haptic: 'warning',
      };
  }
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', gap: 8, marginVertical: 6 },
  artWell: { width: 96, height: 96, borderRadius: 48, backgroundColor: BRAND.cream, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  artImage: { width: 68, height: 68 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 5 },
  priceIcon: { width: 22, height: 22 },
  priceText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
});
