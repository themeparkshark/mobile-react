import { useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { LocationStatusContext } from '../context/LocationProvider';
import { autoOpenUsed, noteAutoOpen, rewardMayAutoOpen } from '../services/retention/rewardPresence';
import { modalLayers } from '../ui/modalLayers';
import { dismissMemberLook, memberLookNoteSeen, restoreMemberLook } from '../api/endpoints/me/member-look';
import { AuthContext } from '../context/AuthProvider';
import { MEMBER_WEAR_COPY, refreshMemberLook } from '../services/memberLook';
import { confirmGame, showGameDialog } from '../ui';
import { openMembership } from './GrownUpGate';

const FOCUS_THROTTLE_MS = 60_000;

/** Resolves once no sheet or dialog is up (one door for every sheet: never over another modal). */
function whenNoLayer(): Promise<void> {
  if (modalLayers.count() === 0) return Promise.resolve();
  return new Promise(resolve => {
    const off = modalLayers.subscribe(() => {
      if (modalLayers.count() === 0) { off(); resolve(); }
    });
  });
}

/**
 * Explains a member piece the player owns but can't wear right now, with the
 * grown-up-gated way to join (secret-shop/DESIGN.md 4.3).
 */
export async function explainMemberLock(): Promise<void> {
  const choice = await showGameDialog({
    title: 'Member item',
    icon: 'lock',
    message: `${MEMBER_WEAR_COPY} Join again to put it on.`,
    buttons: [{ text: 'Ask a grown-up' }, { text: 'OK', style: 'cancel' }],
  });
  if (choice === 0) await openMembership();
}

/**
 * The two member-look moments (secret-shop/DESIGN.md 4.3), shown once each:
 * after a lapse, "Your member items are safe in your closet"; after a rejoin,
 * "Put back on your member look?". Checks on sign-in, when membership changes
 * and when the app comes back to the front. Silent against an older server.
 */
export default function MemberLookHost() {
  const { player, refreshPlayer } = useContext(AuthContext);
  // Core loop attention rules (4.3): home first. At a park these wait (never in the first 30 s, while walking or
  // during play); they ask when the player is home, through the modal layer list, as the app open's one automatic open.
  const atPark = !!useContext(LocationStatusContext)?.park;
  const atParkRef = useRef(atPark);
  atParkRef.current = atPark;
  const deferred = useRef(false);
  const busy = useRef(false);
  const lastCheck = useRef(0);
  const playerId = player?.id;
  const member = player?.is_subscribed === true;

  const check = async () => {
    if (busy.current || playerId == null) return;
    if (!rewardMayAutoOpen({ kind: 'member_look', atPark: atParkRef.current, firstCatchDone: true, autoOpenUsed: autoOpenUsed(), dailyRungOpen: true })) {
      deferred.current = true;
      return;
    }
    busy.current = true;
    lastCheck.current = Date.now();
    try {
      const state = await refreshMemberLook();
      if (!state?.wear_lock) return;
      const asks = (state.note && !state.member) || (state.restore && state.member && Object.keys(state.restore).length > 0);
      if (!asks) return;
      await whenNoLayer();
      // Walked into a park, or something else opened by itself meanwhile: ask on the next calm home open.
      if (atParkRef.current || autoOpenUsed()) { deferred.current = true; return; }
      deferred.current = false;
      noteAutoOpen();
      if (state.note && !state.member) {
        await memberLookNoteSeen().catch(() => undefined);
        const choice = await showGameDialog({
          title: 'Your closet is safe',
          icon: 'member',
          message: state.note,
          buttons: [{ text: 'Ask a grown-up' }, { text: 'OK', style: 'cancel' }],
        });
        if (choice === 0) await openMembership();
        // The server took the pieces off: show the shark it saved.
        await refreshPlayer().catch(() => undefined);
        return;
      }
      if (state.restore && state.member && Object.keys(state.restore).length > 0) {
        const yes = await confirmGame({
          title: 'Put back on your member look?',
          message: 'Your member items are right where you left them.',
          icon: 'member',
          confirmLabel: 'Yes, put it on',
          cancelLabel: 'Not now',
        });
        if (yes) {
          await restoreMemberLook();
          await refreshPlayer().catch(() => undefined);
        } else {
          await dismissMemberLook();
        }
      }
    } catch {
      // Never in the way: the next open asks again.
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => { void check(); }, [playerId, member]);
  // Back home: a deferred ask gets its turn.
  useEffect(() => { if (!atPark && deferred.current) void check(); }, [atPark]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastCheck.current > FOCUS_THROTTLE_MS) void check();
    });
    return () => sub.remove();
  }, [playerId, member]);

  return null;
}
