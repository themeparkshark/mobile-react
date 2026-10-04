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
import { ShopSetReward } from '../models/shop-today';
import { PlayerType } from '../models/player-type';
import { BRAND, GameDialog, type GameDialogButton, type GameIconName } from '../ui';
import useCrumbs from './useCrumbs';

type ModalState =
  | { type: 'none' }
  | { type: 'owned'; item: ItemType }
  | { type: 'poor'; item: ItemType; shortfall: number }
  | { type: 'confirm'; item: ItemType; text: string }
  | { type: 'success'; item: ItemType; setReward?: ShopSetReward | null }
  | { type: 'failed'; item: ItemType }
  /** The server refused: Halloween Shop gear sells only at a Fin-ister event (403 only_at_event). */
  | { type: 'away'; item: ItemType };

/** Player-facing currency names (docs/economy-glossary.md). */
export function currencyLabel(name: string, amount = 2): string {
  const key = name.toLowerCase();
  if (key === 'coins') return amount === 1 ? 'coin' : 'coins';
  if (key === 'tickets') return amount === 1 ? 'ticket' : 'tickets';
  if (amount === 1 && key.endsWith('s')) return name.slice(0, -1);
  return name;
}

/** The one thing to do next when a player is short, and where it goes. */
export function earnAction(name: string): { label: string; hint: string; icon: GameIconName } {
  switch (name.toLowerCase()) {
    case 'coins':
      return { label: 'Go find coins', hint: 'Win ride coins at the park or open your daily chest.', icon: 'ride' };
    case 'keys':
      return { label: 'Find keys', hint: 'Keys turn up on the park map. Walk the park to find more.', icon: 'map' };
    default:
      return { label: 'Keep exploring', hint: 'Play at the park and at home to get more.', icon: 'map' };
  }
}

/** The icon for a game price, so the Buy button shows coins as a picture too. */
export function currencyIcon(name: string): GameIconName {
  const key = name.toLowerCase();
  if (key === 'tickets') return 'ticket';
  if (key === 'keys') return 'lock';
  return 'coins';
}

/**
 * The confirm step says the whole deal in plain words before anything is spent:
 * what it costs, what you have, and what is left after. Game money, never real money.
 */
export function confirmLine(item: Pick<ItemType, 'cost' | 'currency'>, balance: number): string {
  const name = item.currency.name;
  const left = Math.max(0, balance - item.cost);
  return `It costs ${item.cost} ${currencyLabel(name, item.cost)}. You have ${balance}. You’ll have ${left} left.`;
}

/** Balance, shortfall and what an item costs in its own currency. */
export function affordability(player: PlayerType, item: ItemType) {
  const walletValue = player[item.currency.name.toLowerCase() as keyof PlayerType];
  const balance = typeof walletValue === 'number' ? walletValue : 0;
  return { balance, shortfall: Math.max(0, item.cost - balance) };
}

export interface PurchaseOptions {
  /** After a successful buy (Shop v2 refreshes its shelves; setReward when the buy finished a set). */
  readonly onPurchased?: (item: ItemType, setReward: ShopSetReward | null) => void;
  /** Shown as a button on the set-complete dialog. */
  readonly onWearTitle?: (setReward: ShopSetReward) => void;
}

export default function usePurchaseItem(options: PurchaseOptions = {}) {
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

    const text = item.cost === 0 ? vsprintf(prompts.redeem_item, [item.name]) : confirmLine(item, balance);

    playSound(require('../../assets/sounds/purchase_item_prompt.mp3'));
    setModal({ type: 'confirm', item, text });
  };

  const confirmPurchase = async (item: ItemType) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const result = await purchase(item);
      await refreshPlayer();
      const setReward = result?.set_reward ?? null;
      playSound(setReward ? require('../../assets/sounds/reward.mp3') : require('../../assets/sounds/purchase_item_success.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setModal({ type: 'success', item, setReward });
      options.onPurchased?.(item, setReward);
    } catch (error: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      // The server says exactly how short the player is; otherwise nothing was charged.
      const data = (error as { response?: { data?: { code?: string; shortfall?: number; only_at_event?: boolean } } })?.response?.data;
      if (data?.only_at_event) {
        setModal({ type: 'away', item });
      } else if (data?.code === 'not_enough_currency') {
        void refreshPlayer();
        setModal({ type: 'poor', item, shortfall: Math.max(1, Number(data.shortfall) || 1) });
      } else {
        setModal({ type: 'failed', item });
      }
    } finally {
      setPurchasing(false);
    }
  };

  const dialog = dialogFor(modal, { confirmPurchase, closeModal, playSound, onWearTitle: options.onWearTitle });
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
  onWearTitle?: (setReward: ShopSetReward) => void;
}): { title: string; message?: string; icon?: GameIconName; buttons: GameDialogButton[]; body?: JSX.Element;
  haptic?: 'warning' | 'success' | 'none' } | null {
  switch (modal.type) {
    case 'none':
      return null;
    case 'owned':
      return { title: 'Already yours', message: `${modal.item.name} is already in your closet.`,
        buttons: [{ text: 'Got it' }], body: <ItemArt item={modal.item} /> };
    case 'poor': {
      const need = currencyLabel(modal.item.currency.name, modal.shortfall);
      const earn = earnAction(modal.item.currency.name);
      return {
        title: `You need ${modal.shortfall} more ${need}`,
        message: `${modal.item.name} costs ${modal.item.cost} ${currencyLabel(modal.item.currency.name, modal.item.cost)}. ${earn.hint}`,
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
        title: modal.item.cost === 0 ? 'Free for you' : `Buy ${modal.item.name}?`,
        message: modal.text,
        buttons: [
          { text: modal.item.cost === 0 ? 'Take it' : `Buy for ${modal.item.cost}`, icon: modal.item.cost === 0 ? undefined : currencyIcon(modal.item.currency.name),
            onPress: () => void actions.confirmPurchase(modal.item) },
          { text: 'Not now', style: 'cancel',
            onPress: () => actions.playSound(require('../../assets/sounds/purchase_item_cancel.mp3')) },
        ],
        body: <ItemArt item={modal.item} price />,
      };
    case 'success': {
      const reward = modal.setReward;
      if (reward) {
        const gets = [reward.title ? `the ${reward.title} title` : null, reward.xp > 0 ? `${reward.xp} XP` : null]
          .filter(Boolean).join(' and ');
        const wear = reward.title && actions.onWearTitle;
        return {
          title: 'Set complete!',
          message: `You finished ${reward.name}${gets ? ` and got ${gets}` : ''}.`,
          icon: 'trophy',
          buttons: wear
            ? [{ text: 'Wear my title', onPress: () => actions.onWearTitle?.(reward) }, { text: 'Awesome!', style: 'cancel' }]
            : [{ text: 'Awesome!' }],
          body: <ItemArt item={modal.item} />, haptic: 'success',
        };
      }
      return { title: 'It’s yours!', message: `${modal.item.name} is in your closet.`,
        buttons: [{ text: 'Go to my closet', onPress: () => RootNavigation.navigate('Inventory') }, { text: 'Keep shopping', style: 'cancel' }], body: <ItemArt item={modal.item} />, haptic: 'success' };
    }
    case 'away':
      return {
        title: 'Halloween Shop', message: 'Only at Fin-ister Nights. Come to the event during event hours to shop. You weren’t charged.',
        buttons: [{ text: 'Got it' }], body: <ItemArt item={modal.item} />, haptic: 'warning',
      };
    case 'failed':
      return {
        title: 'That didn’t work', message: `You still have all your ${currencyLabel(modal.item.currency.name)}. Check your internet and try again.`,
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
