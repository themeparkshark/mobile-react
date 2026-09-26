import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getGiftEligibility, sendPrepVariantGift,
  type GiftEligibility, type GiftReceipt } from '../api/endpoints/me/prep-variant-gifts';
import type { PrepItemSetItem } from '../api/endpoints/me/prep-item-sets';

export default function GiftPrepVariantPanel({ item, imageSource, onBack, onClose, onSent, onFindFriends, previewEligibility }: {
  item: PrepItemSetItem;
  imageSource: any;
  onBack: () => void;
  onClose: () => void;
  onSent: (receipt: GiftReceipt) => void;
  onFindFriends: () => void;
  previewEligibility?: GiftEligibility;
}) {
  const [eligibility, setEligibility] = useState<GiftEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<GiftReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<{ recipientId: number; requestId: string } | null>(null);

  const loadEligibility = async () => {
    if (previewEligibility) { setEligibility(previewEligibility); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setEligibility(await getGiftEligibility(item.id));
    } catch {
      setError('Could not check which friends need this variant. Retry when connected.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadEligibility(); }, [item.id]);

  const sendGift = async () => {
    if (previewEligibility || !selectedFriendId || sending || !eligibility?.spare_copies || !eligibility.remaining_24h) return;
    if (requestRef.current?.recipientId !== selectedFriendId) {
      requestRef.current = {
        recipientId: selectedFriendId,
        requestId: `gift_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`,
      };
    }
    setSending(true);
    setError(null);
    try {
      const saved = await sendPrepVariantGift(selectedFriendId, item.id, requestRef.current.requestId);
      setReceipt(saved);
      onSent(saved);
    } catch (caught) {
      const serverMessage = (caught as any)?.response?.data?.error;
      if (serverMessage) requestRef.current = null;
      setError(serverMessage || 'Could not confirm the gift. Tap Send again to check the same request.');
    } finally {
      setSending(false);
    }
  };

  return <View style={{ width: '100%' }}>
    <LinearGradient colors={['#1589CD', '#075096']} style={{ borderRadius: 18,
      borderWidth: 3, borderColor: '#F7C84C', minHeight: 140, overflow: 'hidden',
      padding: 15, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, zIndex: 1 }}>
        <Text style={{ color: '#FFE786', fontFamily: 'Knockout', fontSize: 14,
          letterSpacing: 1 }}>CREW GIFT</Text>
        <Text style={{ color: '#FFFFFF', fontFamily: 'Shark', fontSize: 22,
          lineHeight: 25, marginTop: 3 }}>SHARE A SPARE</Text>
        <Text style={{ color: '#DFF5FF', fontSize: 12, lineHeight: 16,
          marginTop: 6 }}>{item.name}</Text>
      </View>
      <Image source={imageSource} style={{ width: 92, height: 92 }} contentFit="contain" />
    </LinearGradient>

    {receipt ? <View style={{ alignItems: 'center', paddingTop: 22 }}>
      <Text style={{ fontFamily: 'Shark', fontSize: 23, color: '#075096',
        textAlign: 'center' }}>GIFT DELIVERED!</Text>
      <Text style={{ color: '#234969', fontSize: 15, lineHeight: 21,
        textAlign: 'center', marginTop: 8 }}>
        {receipt.recipient_name} now has {item.name} in their collection book.
      </Text>
      <Text style={{ color: '#53718B', fontSize: 12, lineHeight: 17,
        textAlign: 'center', marginTop: 10 }}>
        Your first copy stays with you. This gift adds no map-discovery credit or currency.
      </Text>
      <TouchableOpacity accessibilityRole="button" onPress={onClose}
        style={{ marginTop: 22, borderRadius: 14, backgroundColor: '#FFCA36',
          paddingHorizontal: 36, paddingVertical: 13 }}>
        <Text style={{ color: '#103C70', fontFamily: 'Shark', fontSize: 17 }}>DONE</Text>
      </TouchableOpacity>
    </View> : <>
      <Text style={{ color: '#174D79', fontFamily: 'Knockout', fontSize: 15,
        marginTop: 19 }}>CHOOSE A FRIEND WHO NEEDS IT</Text>
      <Text style={{ color: '#315B78', fontSize: 12, lineHeight: 17, marginTop: 4 }}>
        Keep your first copy. One spare moves to your friend’s book; gifts give no Energy, XP,
        Tickets, or map-discovery credit.
      </Text>
      {loading ? <ActivityIndicator color="#0875C9" style={{ marginVertical: 22 }} /> : eligibility && <>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1, padding: 9, borderRadius: 10,
            backgroundColor: '#D8F1FF', alignItems: 'center' }}>
            <Text style={{ color: '#075096', fontFamily: 'Knockout', fontSize: 13 }}>
              {eligibility.spare_copies} SPARE {eligibility.spare_copies === 1 ? 'COPY' : 'COPIES'}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 9, borderRadius: 10,
            backgroundColor: '#FFF1C4', alignItems: 'center' }}>
            <Text style={{ color: '#8B5A0B', fontFamily: 'Knockout', fontSize: 13 }}>
              {eligibility.remaining_24h} GIFTS LEFT / 24H
            </Text>
          </View>
        </View>

        <ScrollView style={{ maxHeight: 230, marginTop: 12 }}
          contentContainerStyle={{ gap: 7, paddingBottom: 4 }}>
          {eligibility.eligible_friends.map(friend => <TouchableOpacity key={friend.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedFriendId === friend.id }}
            onPress={() => { setSelectedFriendId(friend.id); requestRef.current = null; setError(null); }}
            style={{ minHeight: 50, borderRadius: 12, borderWidth: 2,
              borderColor: selectedFriendId === friend.id ? '#F7C84C' : '#ADD6E8',
              backgroundColor: selectedFriendId === friend.id ? '#0B72BB' : '#FFFFFF',
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <Image source={require('../../assets/images/team-shark-badge.png')}
              style={{ width: 31, height: 31 }} contentFit="contain" />
            <Text style={{ marginLeft: 10, flex: 1,
              color: selectedFriendId === friend.id ? '#FFFFFF' : '#174D79',
              fontFamily: 'Knockout', fontSize: 17 }}>{friend.screen_name}</Text>
            {selectedFriendId === friend.id && <Text style={{ color: '#FFE786',
              fontFamily: 'Knockout', fontSize: 12 }}>SELECTED</Text>}
          </TouchableOpacity>)}
        </ScrollView>

        {!eligibility.eligible_friends.length && <Text style={{ color: '#315B78',
          fontSize: 13, lineHeight: 19, marginTop: 10 }}>
          No accepted friend needs this variant right now. Invite a friend to collect together.
        </Text>}
      </>}
      {!!error && <Text style={{ color: '#B83333', fontSize: 12, lineHeight: 17,
        marginTop: 10 }}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button"
        disabled={!!previewEligibility || !selectedFriendId || !eligibility?.spare_copies || !eligibility.remaining_24h || sending}
        onPress={() => void sendGift()}
        style={{ marginTop: 15, minHeight: 46, borderRadius: 12,
          backgroundColor: !previewEligibility && selectedFriendId && eligibility?.spare_copies && eligibility.remaining_24h
            ? '#FFCA36' : '#C8D6DC', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#123E70', fontFamily: 'Shark', fontSize: 16 }}>
          {previewEligibility ? 'PREVIEW ONLY' : sending ? 'SENDING...' : 'SEND ONE SPARE'}
        </Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 }}>
        <TouchableOpacity accessibilityRole="button" onPress={onBack}>
          <Text style={{ color: '#276991', fontFamily: 'Knockout', fontSize: 14 }}>BACK TO ITEM</Text>
        </TouchableOpacity>
        {eligibility?.eligible_friends.length === 0 && <TouchableOpacity accessibilityRole="button" onPress={onFindFriends}>
          <Text style={{ color: '#276991', fontFamily: 'Knockout', fontSize: 14 }}>OPEN FRIENDS →</Text>
        </TouchableOpacity>}
      </View>
    </>}
  </View>;
}
