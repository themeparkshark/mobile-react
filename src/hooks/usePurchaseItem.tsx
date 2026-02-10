import { useCallback, useContext, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { vsprintf } from 'sprintf-js';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';
import { PlayerType } from '../models/player-type';
import config from '../config';
import useCrumbs from './useCrumbs';

type ModalState =
  | { type: 'none' }
  | { type: 'owned'; item: ItemType }
  | { type: 'poor'; currencyName: string }
  | { type: 'confirm'; item: ItemType; text: string }
  | { type: 'success'; item: ItemType };

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { errors, messages, prompts } = useCrumbs();
  const { player, isReady, refreshPlayer } = useContext(AuthContext);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [purchasing, setPurchasing] = useState(false);

  const closeModal = useCallback(() => setModal({ type: 'none' }), []);

  const purchaseItem = async (item: ItemType) => {
    if (!isReady || !player) return;

    if (item.has_purchased) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setModal({ type: 'owned', item });
      return;
    }

    if (player[item.currency.name.toLowerCase() as keyof PlayerType] < item.cost) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setModal({ type: 'poor', currencyName: item.currency.name });
      return;
    }

    const text =
      item.cost === 0
        ? vsprintf(prompts.redeem_item, [item.name])
        : vsprintf(prompts.purchase_item, [
            item.name,
            item.cost,
            item.currency.name,
            player[item.currency.name.toLowerCase() as keyof PlayerType],
            item.currency.name,
          ]);

    playSound(require('../../assets/sounds/purchase_item_prompt.mp3'));
    setModal({ type: 'confirm', item, text });
  };

  const confirmPurchase = async (item: ItemType) => {
    setPurchasing(true);
    try {
      await purchase(item);
      await refreshPlayer();
      playSound(require('../../assets/sounds/purchase_item_success.mp3'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal({ type: 'success', item });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      closeModal();
    } finally {
      setPurchasing(false);
    }
  };

  const purchaseModal = modal.type === 'none' ? null : (
      <Modal visible transparent animationType="fade" onRequestClose={closeModal}>
        <TouchableOpacity
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
          activeOpacity={1}
          onPress={closeModal}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 24,
              padding: 28,
              marginHorizontal: 32,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 10,
              minWidth: 280,
            }}
          >
            {/* Already Owned */}
            {modal.type === 'owned' && (
              <>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: '#fef3c7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Image
                    source={modal.item.icon_url}
                    style={{ width: 48, height: 48 }}
                    contentFit="contain"
                  />
                </View>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 18,
                    color: config.primary,
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginBottom: 8,
                  }}
                >
                  Already Owned!
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 15,
                    color: '#64748b',
                    textAlign: 'center',
                    lineHeight: 21,
                  }}
                >
                  You already have {modal.item.name} in your inventory
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  style={{
                    marginTop: 20,
                    backgroundColor: config.secondary,
                    paddingHorizontal: 36,
                    paddingVertical: 12,
                    borderRadius: 14,
                  }}
                >
                  <Text style={{ fontFamily: 'Shark', fontSize: 14, color: 'white', textTransform: 'uppercase' }}>
                    Got It
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Not enough currency */}
            {modal.type === 'poor' && (
              <>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ fontSize: 36 }}>😢</Text>
                </View>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 18,
                    color: config.primary,
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginBottom: 8,
                  }}
                >
                  Not Enough {modal.currencyName}!
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 15,
                    color: '#64748b',
                    textAlign: 'center',
                    lineHeight: 21,
                  }}
                >
                  Keep playing to earn more!
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  style={{
                    marginTop: 20,
                    backgroundColor: config.secondary,
                    paddingHorizontal: 36,
                    paddingVertical: 12,
                    borderRadius: 14,
                  }}
                >
                  <Text style={{ fontFamily: 'Shark', fontSize: 14, color: 'white', textTransform: 'uppercase' }}>
                    OK
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Confirm purchase */}
            {modal.type === 'confirm' && (
              <>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: '#f0f9ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Image
                    source={modal.item.icon_url}
                    style={{ width: 56, height: 56 }}
                    contentFit="contain"
                  />
                </View>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 16,
                    color: config.primary,
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginBottom: 6,
                  }}
                >
                  {modal.item.name}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f8fafc',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    marginBottom: 16,
                    gap: 6,
                  }}
                >
                  <Image
                    source={{ uri: modal.item.currency.icon_url }}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                  />
                  <Text style={{ fontFamily: 'Shark', fontSize: 18, color: config.primary }}>
                    {modal.item.cost}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 14,
                    color: '#64748b',
                    textAlign: 'center',
                    marginBottom: 20,
                  }}
                >
                  {modal.text}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
                      closeModal();
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: '#e2e8f0',
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Shark', fontSize: 13, color: '#64748b', textTransform: 'uppercase' }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmPurchase(modal.item)}
                    disabled={purchasing}
                    style={{
                      flex: 1,
                      backgroundColor: purchasing ? '#93c5fd' : config.secondary,
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                      opacity: purchasing ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: 'Shark', fontSize: 13, color: 'white', textTransform: 'uppercase' }}>
                      {purchasing ? '...' : 'Buy'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Purchase success */}
            {modal.type === 'success' && (
              <>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: '#dcfce7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Image
                    source={modal.item.icon_url}
                    style={{ width: 56, height: 56 }}
                    contentFit="contain"
                  />
                </View>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 20,
                    color: '#22c55e',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginBottom: 8,
                  }}
                >
                  Purchased!
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 15,
                    color: '#64748b',
                    textAlign: 'center',
                    lineHeight: 21,
                  }}
                >
                  {modal.item.name} has been added to your inventory!
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  style={{
                    marginTop: 20,
                    backgroundColor: '#22c55e',
                    paddingHorizontal: 36,
                    paddingVertical: 12,
                    borderRadius: 14,
                  }}
                >
                  <Text style={{ fontFamily: 'Shark', fontSize: 14, color: 'white', textTransform: 'uppercase' }}>
                    Awesome!
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
  );

  return {
    purchaseItem,
    purchaseModal,
  };
}
