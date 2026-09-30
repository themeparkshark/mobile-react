import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdventureTicket, TripGoalData, TripGoalRide } from '../../api/endpoints/me/trip-goal';
import { playSfx } from '../../gamekit/SFX';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { adventurePrompt } from './adventureTicketPresentation';

interface Props {
  ticket: AdventureTicket;
  data: TripGoalData;
  closed: boolean;
  stale: boolean;
  top: number;
  onDiscover: () => void;
  onPlay: () => Promise<void>;
  onShelf: () => void;
  onChoose: (taskId: number) => Promise<unknown>;
  onCelebrate: () => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onOcclusionChange?: (visible: boolean) => void;
}

/** An earned stamp stays legible when still; only a newly confirmed stamp gets a finite punch. */
function Punch({ earned, number, reduced }: { earned: boolean; number: number; reduced: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(earned);
  useEffect(() => {
    scale.stopAnimation(); scale.setValue(1);
    if (earned && !previous.current && !reduced) {
      scale.setValue(0.76);
      Animated.timing(scale, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    }
    previous.current = earned;
    return () => { scale.stopAnimation(); };
  }, [earned, reduced, scale]);
  return <Animated.View style={[styles.punch, earned && styles.punched, { transform: [{ scale }] }]}>
    <Text style={[styles.punchText, earned && styles.punchedText]}>{earned ? '✓' : number}</Text>
  </Animated.View>;
}

export default function AdventureTicketCard({ ticket, data, closed, stale, top, onDiscover, onPlay, onShelf,
  onChoose, onCelebrate, onRefresh, onOcclusionChange }: Props) {
  const [open, setOpen] = useState(false), [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), locked = useRef(false), pending = useRef<(() => void) | null>(null);
  const occlusion = useRef(onOcclusionChange); occlusion.current = onOcclusionChange;
  const reduced = useReducedGameMotion(), insets = useSafeAreaInsets();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = null; occlusion.current?.(false); };
  }, []);
  const prompt = adventurePrompt(ticket, closed);
  const stamps = [!!ticket.discover, !!ticket.play, ticket.phase === 'complete'];
  const choices = data.rides.filter(ride => ride.park_id === ticket.park_id && ride.ride_id && ride.task_id !== ticket.ride.task_id);
  const close = () => { pending.current = null; setOpen(false); };
  const transact = async (operation: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch { if (mounted.current) setError('Your ticket is safe. Reconnect and try again.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const navigateAfterHide = (action: () => void) => {
    if (locked.current || pending.current) return;
    pending.current = action; setOpen(false);
  };
  const next = () => {
    if (stale) { void transact(onRefresh); return; }
    if (closed && ticket.phase !== 'celebrate' && ticket.phase !== 'complete') { setPicker(true); return; }
    if (ticket.phase === 'celebrate') {
      void transact(async () => {
        const confirmed = await onCelebrate();
        if (!confirmed || !mounted.current) return;
        if (!reduced) haptic('success');
        playSfx('star', 0.55);
      });
    } else if (ticket.phase === 'complete') navigateAfterHide(onShelf);
    else if (ticket.phase === 'discover') navigateAfterHide(onDiscover);
    else navigateAfterHide(() => {
      void onPlay().catch(() => {
        if (mounted.current) { setOpen(true); setError('Could not open this ride’s adventure. Try again.'); }
      });
    });
  };
  const pick = (ride: TripGoalRide) => void transact(async () => {
    const result = await onChoose(ride.task_id);
    if (result && mounted.current) { setPicker(false); if (!reduced) haptic('tickSelection'); }
  });
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open Adventure Ticket. ${ticket.ride.ride_name}. ${prompt.title}. ${stamps.filter(Boolean).length} of 3 chapters complete.`}
      onPress={() => { setPicker(false); setError(null); setOpen(true); }} style={[styles.folded, { top }]}>
      <LinearGradient colors={['#fff7d5', '#ffdf81']} style={styles.foldedInside}>
        <Image source={ticket.ride.coin_url ? { uri: ticket.ride.coin_url } : require('../../../assets/images/coingold.png')}
          style={styles.smallCoin} contentFit="contain" />
        <View style={styles.foldedCopy}>
          <Text style={styles.eyebrow}>{stale ? 'LAST CONFIRMED ADVENTURE' : 'YOUR ADVENTURE'} <Text style={styles.chapterCount}>{stamps.filter(Boolean).length}/3</Text></Text>
          <Text numberOfLines={1} style={styles.foldedTitle}>{prompt.title}</Text>
          <Text numberOfLines={1} style={styles.foldedRide}>{ticket.ride.ride_name}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </LinearGradient>
    </Pressable>
    <Modal isVisible={open} onBackdropPress={close} onBackButtonPress={close}
      animationIn="slideInUp" animationOut="slideOutDown" animationInTiming={reduced ? 0 : 280} animationOutTiming={reduced ? 0 : 200}
      backdropTransitionInTiming={reduced ? 0 : 180} backdropTransitionOutTiming={reduced ? 0 : 180}
      onModalWillShow={() => occlusion.current?.(true)} onModalHide={() => {
        occlusion.current?.(false);
        const action = pending.current; pending.current = null;
        if (mounted.current) action?.();
      }} style={styles.modal}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetEyebrow}>PARK-DAY ADVENTURE • {ticket.park_day.slice(5).replace('-', '/')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Adventure Ticket" onPress={close} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {picker ? <>
            <Text style={styles.title}>Choose your detour</Text>
            <Text style={styles.support}>A different ride. The same adventure. Every earned stamp stays with you.</Text>
            {choices.map(ride => <Pressable key={ride.task_id} accessibilityRole="button" accessibilityLabel={`Continue adventure at ${ride.ride_name}`} disabled={busy} onPress={() => pick(ride)} style={styles.choice}>
              <Image source={ride.coin_url ? { uri: ride.coin_url } : require('../../../assets/images/coingold.png')} style={styles.choiceCoin} contentFit="contain" />
              <View style={{ flex: 1 }}><Text style={styles.choiceTitle}>{ride.ride_name}</Text><Text style={styles.choiceDetail}>{ride.coin_owned ? 'Your coin • a new queue story' : 'A new coin to discover'}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>)}
            {!choices.length && <Text style={styles.support}>No other linked queue adventures are available at this park yet. Your stamps are saved.</Text>}
            <Pressable accessibilityRole="button" onPress={() => setPicker(false)} style={styles.secondary}><Text style={styles.secondaryText}>Back to my ticket</Text></Pressable>
          </> : <>
            <View style={styles.hero}>
              <View style={styles.coinHalo}><Image source={(ticket.discover?.coin_url || ticket.ride.coin_url)
                ? { uri: ticket.discover?.coin_url || ticket.ride.coin_url } : require('../../../assets/images/coingold.png')}
                style={styles.heroCoin} contentFit="contain" /></View>
              <Image source={require('../../../assets/images/screens/pin-collections/shark.png')} style={styles.finn} contentFit="contain" />
            </View>
            <Text style={styles.title}>{prompt.title}</Text>
            <Text style={styles.ride}>{ticket.ride.ride_name}</Text>
            <Text style={styles.support}>{prompt.detail}</Text>
            <View style={styles.chapters}>
              {[{ label: 'Discover', detail: ticket.discover ? `${ticket.discover.ride_name} • ${ticket.discover.kind === 'owned_coin' ? 'already on your shelf' : 'coin collected'}` : 'Win this ride’s coin challenge.' },
                { label: 'Play', detail: ticket.play ? `${ticket.play.chapter_title}${ticket.play.route_name ? ` • ${ticket.play.route_name}` : ''}` : 'Repair, discover, and finish a short queue story.' },
                { label: 'Celebrate', detail: ticket.phase === 'complete' ? 'Your souvenir is ready to revisit.' : 'Bring your coin and story together.' }].map((chapter, index) =>
                <View key={chapter.label} style={[styles.chapter, index < 2 && styles.perforation]}>
                  <Punch earned={stamps[index]} number={index + 1} reduced={reduced} />
                  <View style={{ flex: 1 }}><Text style={styles.chapterTitle}>{chapter.label}</Text><Text style={styles.chapterDetail}>{chapter.detail}</Text></View>
                </View>)}
            </View>
            {ticket.phase === 'discover' && data.wallet.tickets_needed > 0 && <View style={styles.resource}>
              <Image source={require('../../../assets/images/ticket-icon.png')} style={styles.resourceIcon} contentFit="contain" />
              <Text style={styles.resourceText}>{data.wallet.rescue_pass_available ? 'Your first-coin pass is ready for this challenge.'
                : `${data.wallet.tickets_needed} more ${data.wallet.tickets_needed === 1 ? 'Ticket' : 'Tickets'} needed. Verified queue time and home finds can help.`}</Text>
            </View>}
            <Pressable accessibilityRole="button" accessibilityLabel={stale ? 'Refresh Adventure Ticket' : prompt.action} disabled={busy} onPress={next} style={[styles.primary, busy && { opacity: 0.65 }]}>
              {busy ? <ActivityIndicator color="#123e5a" /> : <Text style={styles.primaryText}>{stale ? 'Refresh my ticket' : prompt.action}  ›</Text>}
            </Pressable>
            {ticket.phase !== 'complete' && ticket.phase !== 'celebrate' && <Pressable accessibilityRole="button" accessibilityLabel="Choose a different adventure ride" disabled={busy} onPress={() => setPicker(true)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Choose a different ride</Text>
            </Pressable>}
            {ticket.phase === 'complete' && <Text style={styles.private}>Saved for you. Sharing is always your choice.</Text>}
          </>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  folded: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 19, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', shadowColor: '#0c3049', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5 },
  foldedInside: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  smallCoin: { width: 48, height: 48 }, foldedCopy: { flex: 1 }, eyebrow: { color: '#365365', fontFamily: 'Knockout', fontSize: 10, letterSpacing: 1 },
  chapterCount: { color: '#137da3' }, foldedTitle: { fontFamily: 'Shark', fontSize: 18, color: '#113b56', marginTop: 3 }, foldedRide: { fontFamily: 'Knockout', fontSize: 12, color: '#365365', marginTop: 3 },
  chevron: { fontFamily: 'Knockout', fontSize: 30, color: '#0a6da0' }, modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { maxHeight: '88%', backgroundColor: '#fff8e4', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 3, borderColor: '#fff', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 22, paddingRight: 10, backgroundColor: '#0b628f', minHeight: 54 }, sheetEyebrow: { flex: 1, fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1, color: '#fff3bf' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, closeText: { fontSize: 30, color: '#fff' }, scroll: { paddingHorizontal: 22, paddingBottom: 10 },
  hero: { height: 132, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, coinHalo: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#ffe7a0', borderWidth: 2, borderColor: '#f2c65c', alignItems: 'center', justifyContent: 'center' }, heroCoin: { width: 106, height: 106 }, finn: { position: 'absolute', width: 83, height: 90, right: 14, bottom: 2 },
  title: { fontFamily: 'Shark', fontSize: 27, color: '#123e5a', textAlign: 'center', marginTop: 14 }, ride: { fontFamily: 'Shark', fontSize: 16, color: '#1b7c9f', textAlign: 'center', marginTop: 6 }, support: { fontFamily: 'Knockout', fontSize: 15, color: '#496273', textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 14 },
  chapters: { borderRadius: 19, borderWidth: 2, borderColor: '#e8cf97', backgroundColor: '#fffdf6', marginTop: 2 }, chapter: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12, minHeight: 78 }, perforation: { borderBottomColor: '#dfcba5', borderBottomWidth: 1, borderStyle: 'dashed' },
  punch: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#d8c8a6', backgroundColor: '#f8f0dc', alignItems: 'center', justifyContent: 'center' }, punched: { backgroundColor: '#0d83a1', borderColor: '#096c88' }, punchText: { fontFamily: 'Knockout', color: '#947f5b', fontSize: 20 }, punchedText: { color: '#fff5ce' }, chapterTitle: { fontFamily: 'Shark', fontSize: 19, color: '#123e5a' }, chapterDetail: { fontFamily: 'Knockout', fontSize: 13, color: '#496273', lineHeight: 18, marginTop: 3 },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: '#ffcc4d', borderWidth: 2, borderColor: '#e9ac30', alignItems: 'center', justifyContent: 'center', marginTop: 18, padding: 10 }, primaryText: { fontFamily: 'Shark', fontSize: 19, color: '#123e5a', textAlign: 'center' }, secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', padding: 10 }, secondaryText: { fontFamily: 'Knockout', fontSize: 15, color: '#1b7298' }, private: { fontFamily: 'Knockout', fontSize: 12, color: '#496273', textAlign: 'center', marginTop: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 76, borderWidth: 2, borderColor: '#e8cf97', borderRadius: 17, backgroundColor: '#fffdf6', marginBottom: 10 }, choiceCoin: { width: 48, height: 48 }, choiceTitle: { fontFamily: 'Shark', fontSize: 18, color: '#123e5a' }, choiceDetail: { fontFamily: 'Knockout', fontSize: 13, color: '#496273', marginTop: 4 }, resource: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e6f3f6', borderRadius: 14, padding: 12, marginTop: 14 }, resourceIcon: { width: 38, height: 38 }, resourceText: { flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#23566e', lineHeight: 19 }, error: { fontFamily: 'Knockout', fontSize: 14, lineHeight: 20, color: '#983c29', paddingVertical: 12, textAlign: 'center' },
});
