/**
 * Get Tickets with no coin (fix pass 1, Nov 20 2026): the map's top card GET TICKETS and the header Ticket pill open
 * this sheet (openGetTickets). The same panel the coin card shows when a player is short (T7), with no price: what
 * the player holds, then only the free ways that work right now, the grown-up row behind the gate, and "Tomorrow at
 * any park: +3" on the arcade server. It never picks a ride: the line row is a plain "any ride line" fact.
 * One host, mounted by the map (RedeemModal). Drawn on a real anchor view so it always opens centered (P13).
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Modal from 'react-native-modal';
import { AuthContext } from '../../context/AuthProvider';
import { getTicketSources, type TicketSources } from '../../api/endpoints/me/task-attempts';
import { claimStampReward, getStamps } from '../../api/endpoints/me/stamps';
import { stampClaimSources } from '../rewards/challengeCopy';
import * as RootNavigation from '../../RootNavigation';
import { askGrownUp, GrownUpGateSlot } from '../GrownUpGate';
import { storeAvailable } from '../../services/purchases';
import { playFlagsNow } from '../../services/playPrefs';
import { useNativeModalLayer } from '../../ui/modalLayers';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import YellowButton from '../YellowButton';
import GetTicketsPanel from './GetTicketsPanel';
import { getTicketsRows, type GetTicketsRowKind } from './getTicketsModel';
import { closeGetTickets, registerGetTicketsHost, useGetTicketsOpen } from './getTicketsOpen';
import { useArcadeEconomy } from './arcadeMode';

type Claim = { id: number; tickets: number };

export default function GetTicketsSheet({ atPark }: { readonly atPark: boolean }) {
  useEffect(() => registerGetTicketsHost(), []);
  const wanted = useGetTicketsOpen();
  const layer = useNativeModalLayer(wanted, 'wait');
  const reducedMotion = useReducedGameMotion();
  const arcade = useArcadeEconomy();
  const { player, refreshPlayer } = useContext(AuthContext);
  const [sources, setSources] = useState<TicketSources | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [afterClose, setAfterClose] = useState<(() => void) | null>(null);

  // Read the free ways each time it opens: the server's word first (arcade), the Stamp Book for today's server.
  useEffect(() => {
    if (!wanted) return undefined;
    let alive = true;
    void getTicketSources(null).then(answer => { if (alive) setSources(answer?.ticket_sources ?? null); }).catch(() => undefined);
    void getStamps().then(response => {
      if (alive) setClaims(stampClaimSources(Object.values(response.stamps).flat()).filter(s => typeof s.id === 'number')
        .map(s => ({ id: s.id as number, tickets: s.tickets })));
    }).catch(() => { if (alive) setClaims([]); });
    return () => { alive = false; };
  }, [wanted]);

  const tickets = player?.tickets ?? 0;
  const ways = getTicketsRows({ price: null, tickets, sources,
    stampTickets: claims ? claims.reduce((sum, c) => sum + c.tickets, 0) : null,
    rideHasLine: false, anyLine: atPark, queueTicketsOn: atPark && playFlagsNow().queueTickets, affordableNear: null,
    canPick: false, storeOn: storeAvailable(), arcade });

  const claimAll = useCallback(async () => {
    if (claiming || !claims?.length) return;
    setClaiming(true);
    for (const c of claims) { try { await claimStampReward(c.id); } catch { /* the next look shows what is left */ } }
    try { await refreshPlayer?.(); } catch { /* the header refreshes on its own */ }
    setClaims([]);
    setSources(prev => (prev ? { ...prev, stamps_waiting_tickets: 0 } : prev));
    setClaiming(false);
  }, [claiming, claims, refreshPlayer]);

  const onRow = (kind: GetTicketsRowKind) => {
    if (kind === 'claim') { void claimAll(); return; }
    if (kind === 'near') {
      // NEAR ME with "I can play now" on (app-choice's sheet reads this param): the player picks the coin.
      setAfterClose(() => () => RootNavigation.navigate('Explore', { nearMe: 'can_play' } as never));
      closeGetTickets();
      return;
    }
    if (kind === 'grownups') {
      void askGrownUp(null).then(ok => {
        if (!ok) return;
        // No coin, so no shortfall: Supplies still lists the smallest Ticket pack first when opened from here.
        setAfterClose(() => () => RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies', focus: 'tickets', from: 'get_tickets' }));
        closeGetTickets();
      });
    }
  };

  return (
    <View collapsable={false} pointerEvents="box-none" style={styles.anchor}>
      <Modal
        isVisible={layer.present}
        onModalHide={() => { layer.onDismissed(); afterClose?.(); setAfterClose(null); }}
        onBackdropPress={closeGetTickets}
        onSwipeComplete={closeGetTickets}
        swipeDirection="down"
        animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
        animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'}
        animationInTiming={reducedMotion ? 120 : 220}
        animationOutTiming={reducedMotion ? 120 : 180}
        backdropColor="#05346e"
        backdropOpacity={0.6}
        hideModalContentWhileAnimating
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* A tap beside the card closes it (the scroll view covers the backdrop). */}
          <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeGetTickets} />
          <View style={styles.card} testID="get-tickets-sheet">
            <GetTicketsPanel price={null} tickets={tickets} have={ways.have} rows={ways.rows} footer={ways.footer}
              busy={claiming ? 'claim' : null} onRow={onRow} />
            <View style={styles.ok}><YellowButton text="OK" onPress={closeGetTickets} /></View>
          </View>
        </ScrollView>
        {wanted && <GrownUpGateSlot />}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  card: { width: '92%', maxWidth: 420, alignItems: 'center' },
  ok: { marginTop: 12, alignSelf: 'stretch', alignItems: 'center' },
});
