import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import GameIcon from '../ui/GameIcon';
import { AuthContext } from '../context/AuthProvider';
import { coinTier } from '../constants/coinTiers';
import { getRemintNotice, markRemintNoticeSeen } from '../api/endpoints/me/progression/remint-notice';
import { usePresentationSlot } from '../hooks/usePresentationQueue';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { queueHaptic } from '../gamekit/Haptics';
import * as RootNavigation from '../RootNavigation';
import { remintCard, type RemintNotice } from './coin/progressionModel';

/**
 * The re-mint card (progression.md 8): once, on the next app open after the
 * Level 10 curve goes live, through the PresentationQueue (kind 'remint',
 * after Crowning and Home Hunt results). Promoted coins fly into a row and
 * flip from the old rim to the new one 300 ms apart; refunds count up. One
 * button, "See my shelf". Reduce Motion: a static list.
 */
function RemintRow({ row, reduced, start }: { row: NonNullable<ReturnType<typeof remintCard>>['rows'][number]; reduced: boolean; start: boolean }) {
  const flip = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!start || reduced) { if (reduced) flip.setValue(1); return; }
    const animation = Animated.sequence([Animated.delay(250 + row.flipAtMs),
      Animated.timing(flip, { toValue: 1, duration: 360, useNativeDriver: true })]);
    const timer = setTimeout(() => queueHaptic('tapLight'), 250 + row.flipAtMs + 180);
    animation.start();
    return () => { animation.stop(); clearTimeout(timer); };
  }, [start, reduced]);
  const from = coinTier(row.from_level);
  const to = coinTier(row.to_level);
  const rotateY = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
  const showNew = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.ride_name}. ${row.line}.`}>
      <Animated.View style={[styles.coin, { transform: [{ perspective: 400 }, { rotateY }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.rim, { borderColor: from.ring, opacity: Animated.subtract(1, showNew) }]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.rim, { borderColor: to.ring, borderWidth: to.ringWidth + 1, opacity: showNew }]} />
        {!!row.coin_url && <Image source={{ uri: row.coin_url }} style={styles.coinArt} contentFit="cover" />}
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ride} numberOfLines={1}>{row.ride_name}</Text>
        <Text style={styles.line}>{row.line}</Text>
      </View>
      <Text style={styles.level}>Lv {row.to_level}</Text>
    </View>
  );
}

export default function RemintNoticeModal() {
  const { player } = useContext(AuthContext);
  const [notice, setNotice] = useState<RemintNotice | null>(null);
  const checkedFor = useRef<number | null>(null);
  const reduced = useReducedGameMotion();
  const card = remintCard(notice);
  const { visible, done } = usePresentationSlot(card ? notice!.id : null, 'remint', 'coin_shelf');

  useEffect(() => {
    const id = player?.id ?? null;
    if (!id || checkedFor.current === id) return;
    checkedFor.current = id;
    let active = true;
    getRemintNotice().then(result => { if (active) setNotice(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [player?.id]);

  if (!card) return null;
  const close = (toShelf: boolean) => {
    void markRemintNoticeSeen().catch(() => undefined);
    setNotice(null);
    done();
    if (toShelf) RootNavigation.navigate('CoinShelf');
  };

  return (
    <Modal isVisible={visible} animationIn="fadeIn" animationOut="fadeOut" backdropColor="#05346e" backdropOpacity={0.55}
      onBackdropPress={() => close(false)} onBackButtonPress={() => close(false)} statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={styles.wrap}>
        <Ribbon text={card.title} />
        <View style={styles.card}>
          <View style={styles.totals}>
            <GameIcon name="parts" size={22} />
            <Text style={styles.subtitle}>{card.subtitle}</Text>
          </View>
          <ScrollView style={{ maxHeight: 300, alignSelf: 'stretch' }} contentContainerStyle={{ gap: 8 }}>
            {card.rows.map(row => <RemintRow key={row.asset_id} row={row} reduced={reduced} start={visible} />)}
          </ScrollView>
          <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
            <YellowButton text={card.button} onPress={() => close(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '88%', alignItems: 'center' },
  card: { width: '95%', marginTop: -14, backgroundColor: '#d9f5ff', borderRadius: 20, borderWidth: 2.5, borderColor: '#ffffff',
    paddingHorizontal: 14, paddingTop: 24, paddingBottom: 14, alignItems: 'center' },
  totals: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  subtitle: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: '#17476b' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2,
    borderColor: '#bfe5ff', padding: 8 },
  coin: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  rim: { borderRadius: 23, borderWidth: 3 },
  coinArt: { width: 38, height: 38, borderRadius: 19 },
  ride: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
  line: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c' },
  level: { fontFamily: 'Shark', fontSize: 16, color: '#a36609' },
});
