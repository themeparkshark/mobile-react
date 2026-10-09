/**
 * HelpProvider: the game-wide "What's this?" sheet, one-time tip state and
 * the replay switch for every tutorial.
 *
 * - explain(term) opens a short sheet for any currency, badge or game word.
 *   Wording comes from GET /api/economy for the six currencies, the local
 *   glossary for everything else (src/services/help/glossary.ts).
 * - useOneTimeTip(id, ready) shows a tip once per player, only when the caller
 *   says the player is free, and never while a Finn lesson is on screen.
 * - replayAllTutorials() resets Finn, the home intro and every tip.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import { AuthContext } from '../../context/AuthProvider';
import * as RootNavigation from '../../RootNavigation';
import { replayHomeIntro } from '../../screens/ExploreScreen/HomeIntro';
import {
  LOCAL_GLOSSARY, mergeServerGlossary, type GlossaryKey, type GlossaryTerm, type HelpTopicId,
} from '../../services/help/glossary';
import {
  createSeenTipStore, initialSeenFor, isExistingPlayer, shouldShowTip, type TipId,
} from '../../services/help/seenTips';
import { useTutorial } from '../Tutorial';
import { helpSheet, type HelpSheetId } from '../../services/help/helpSheets';
import HelpSheet from './HelpSheet';
import TermSheet from './TermSheet';

/** How long a shown tip may be hidden by a busy blink before it is dropped. */
const TIP_BUSY_GRACE_MS = 1500;
/** A moment must stay calm this long before a tip appears. */
const TIP_SETTLE_MS = 700;

/** Other one-time flags that "Replay tutorials" should clear too. */
const EXTRA_REPLAY_KEYS = ['lineplay_eyes_up_seen_v1'];

interface ExplainOptions { readonly count?: number | null }

export interface HelpContextValue {
  readonly glossary: Readonly<Record<GlossaryKey, GlossaryTerm>>;
  explain: (key: GlossaryKey, options?: ExplainOptions) => void;
  openHowToPlay: (topic?: HelpTopicId) => void;
  /** Opens a screen's "?" sheet from anywhere (the map's "?" uses it). */
  openHelpSheet: (id: HelpSheetId) => void;
  /** True once this player's seen state has loaded. */
  readonly tipsReady: boolean;
  hasSeenTip: (id: TipId) => boolean;
  /** Claims the single tip slot and marks it seen. False if it should not show now. */
  claimTip: (id: TipId, ready: boolean) => boolean;
  releaseTip: (id: TipId) => void;
  /** Mark seen without taking the tip slot (pre-game cards). */
  markTipSeen: (id: TipId) => void;
  readonly activeTip: TipId | null;
  replayAllTutorials: () => Promise<void>;
}

const noop = () => undefined;
export const HelpContext = createContext<HelpContextValue>({
  glossary: LOCAL_GLOSSARY,
  explain: noop,
  openHowToPlay: noop,
  openHelpSheet: noop,
  tipsReady: false,
  hasSeenTip: () => true,
  claimTip: () => false,
  releaseTip: noop,
  markTipSeen: noop,
  activeTip: null,
  replayAllTutorials: async () => undefined,
});

export function useHelp(): HelpContextValue {
  return useContext(HelpContext);
}

// The economy wording is the same for everyone; one read per app session.
let glossaryCache: Record<GlossaryKey, GlossaryTerm> | null = null;

export default function HelpProvider({ children }: { readonly children: React.ReactNode }) {
  const { player } = useContext(AuthContext);
  const playerId = player?.id ?? null;
  const veteran = isExistingPlayer(player);
  const { isActive: finnActive, resetAll: resetFinn } = useTutorial();

  const [glossary, setGlossary] = useState<Record<GlossaryKey, GlossaryTerm>>(glossaryCache ?? { ...LOCAL_GLOSSARY });
  const [sheet, setSheet] = useState<{ key: GlossaryKey; count: number | null } | null>(null);
  const [helpId, setHelpId] = useState<HelpSheetId | null>(null);
  const [lastHelpId, setLastHelpId] = useState<HelpSheetId | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [tipsReady, setTipsReady] = useState(false);
  const [activeTip, setActiveTip] = useState<TipId | null>(null);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const activeRef = useRef<TipId | null>(null);

  const store = useMemo(() => playerId == null ? null : createSeenTipStore(AsyncStorage, playerId), [playerId]);

  useEffect(() => {
    if (glossaryCache || playerId == null) return;
    let live = true;
    client.get('/economy', { timeout: 8000 })
      .then(response => {
        glossaryCache = mergeServerGlossary(LOCAL_GLOSSARY, response.data?.data);
        if (live) setGlossary(glossaryCache);
      })
      .catch(() => undefined); // The local glossary already covers every term.
    return () => { live = false; };
  }, [playerId]);

  useEffect(() => {
    setTipsReady(false);
    setSeen(new Set());
    activeRef.current = null;
    setActiveTip(null);
    if (!store) return;
    let live = true;
    void store.loadState().then(async ({ seen: loaded, fresh }) => {
      const initial = initialSeenFor(fresh, veteran, loaded);
      const next = initial ? await store.markMany([], initial) : loaded;
      if (!live) return;
      setSeen(next);
      setTipsReady(true);
    });
    return () => { live = false; };
    // Veteran status only matters on the first load for this player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const explain = useCallback((key: GlossaryKey, options?: ExplainOptions) => {
    setSheet({ key, count: options?.count ?? null });
  }, []);

  const openHelpSheet = useCallback((id: HelpSheetId) => {
    setSheet(null);
    setLastHelpId(id);
    setHelpId(id);
  }, []);

  const openHowToPlay = useCallback((topic?: HelpTopicId) => {
    setSheet(null);
    setHelpId(null);
    RootNavigation.navigate('HowToPlay', topic ? { topic } : undefined);
  }, []);

  const hasSeenTip = useCallback((id: TipId) => seenRef.current.has(id), []);

  const markTipSeen = useCallback((id: TipId) => {
    if (seenRef.current.has(id)) return;
    const marked = new Set(seenRef.current); marked.add(id);
    seenRef.current = marked;
    setSeen(marked);
    if (store) void store.mark(id, marked);
  }, [store]);

  const claimTip = useCallback((id: TipId, ready: boolean) => {
    if (activeRef.current === id) return true;
    if (!shouldShowTip(id, { loaded: tipsReady, seen: seenRef.current, busy: !ready || finnActive,
      tipShowing: activeRef.current != null })) return false;
    activeRef.current = id;
    setActiveTip(id);
    // Seen the moment it shows, so a tip never comes back even if the app closes.
    markTipSeen(id);
    return true;
  }, [tipsReady, finnActive, markTipSeen]);

  const releaseTip = useCallback((id: TipId) => {
    if (activeRef.current !== id) return;
    activeRef.current = null;
    setActiveTip(null);
  }, []);

  const replayAllTutorials = useCallback(async () => {
    resetFinn();
    if (store) setSeen(await store.reset());
    activeRef.current = null;
    setActiveTip(null);
    if (playerId != null) await replayHomeIntro(playerId);
    await Promise.all(EXTRA_REPLAY_KEYS.map(key => AsyncStorage.removeItem(key).catch(() => undefined)));
  }, [resetFinn, store, playerId]);

  const value = useMemo<HelpContextValue>(() => ({
    glossary, explain, openHowToPlay, openHelpSheet, tipsReady, hasSeenTip, claimTip, releaseTip, markTipSeen, activeTip, replayAllTutorials,
  }), [glossary, explain, openHowToPlay, openHelpSheet, tipsReady, hasSeenTip, claimTip, releaseTip, markTipSeen, activeTip, replayAllTutorials]);

  const term = sheet ? glossary[sheet.key] : null;
  return (
    <HelpContext.Provider value={value}>
      {children}
      <TermSheet visible={!!term} term={term} count={sheet?.count ?? null}
        glossary={glossary}
        onOpenTerm={key => setSheet({ key, count: null })}
        onOpenGuide={term ? () => openHowToPlay(term.topic) : undefined}
        onClose={() => setSheet(null)} />
      <HelpSheet visible={helpId != null} sheet={lastHelpId ? helpSheet(lastHelpId) : null} onClose={() => setHelpId(null)}
        more={lastHelpId === 'park_map' ? { label: 'Every tip in How to play', onPress: () => openHowToPlay('park') } : undefined} />
    </HelpContext.Provider>
  );
}

/**
 * Show a one-time tip when `ready` turns true (the caller decides the player
 * is free: no mini-game, no moving line, no dialog). Returns whether to render
 * it and how to close it.
 */
export function useOneTimeTip(id: TipId, ready: boolean): { visible: boolean; dismiss: () => void } {
  const { claimTip, releaseTip, activeTip, tipsReady } = useHelp();
  // Claim only once the moment has settled, so a screen that is still loading
  // (a blink of "ready") never burns the tip.
  useEffect(() => {
    if (!ready || !tipsReady) return;
    const timer = setTimeout(() => claimTip(id, true), TIP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [id, ready, tipsReady, claimTip]);
  // Busy again (a game opened, the line moved): the tip hides at once and steps
  // aside for good if the busy spell lasts. A blink (a screen settling) keeps it.
  useEffect(() => {
    if (ready || activeTip !== id) return;
    const timer = setTimeout(() => releaseTip(id), TIP_BUSY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready, activeTip, id, releaseTip]);
  // A screen that unmounts with its tip up frees the slot.
  useEffect(() => () => releaseTip(id), [id, releaseTip]);
  const dismiss = useCallback(() => releaseTip(id), [id, releaseTip]);
  return { visible: ready && activeTip === id, dismiss };
}
