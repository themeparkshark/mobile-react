/**
 * Standings tab 4: Home Hunt (spec 5.3). Header card, Near Me | Friends
 * control, podium, rows, a sticky You row, the info sheet, the age question
 * and the Hunter Name settings. Near Me shows Hunter Names only and never opens a profile.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as RootNavigation from '../../RootNavigation';
import {
  getHomeHuntBoard, getHomeHuntResults, saveHomeHuntSettings,
  type HomeHuntBoard, type HomeHuntResult, type HomeHuntSettingsBody, type HomeHuntWeek,
} from '../../api/endpoints/me/homeHunt';
import FloatingParticles from '../../components/FloatingParticles';
import HomeHuntInfoSheet, { useHomeHuntInfo } from '../../components/home/HomeHuntInfoSheet';
import HomeHuntResultsModal from '../../components/home/HomeHuntResultsModal';
import { standingsInfoSections } from '../../components/home/homeHuntInfoModel';
import { presentableResults, resultPresentationId } from '../../components/home/homeHuntResultsModel';
import { HOME_HUNT_COPY, firstHunterLine } from '../../constants/homeHuntCopy';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { usePresentationBadges } from '../../hooks/usePresentationQueue';
import type { PlayerType } from '../../models/player-type';
import { presentationQueue } from '../../services/presentation/PresentationQueue';
import { showToast } from '../../utils/toast';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, SharkLoader } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import HomeHuntAgeSheet from './HomeHuntAgeSheet';
import {
  cachedHomeHuntWeek, loadHomeHuntWeek, setHomeHuntWeek, subscribeHomeHuntWeek,
} from './homeHuntWeekCache';
import {
  countdownText, huntMeRow, huntPodium, huntRows, huntSettingsState, rankMovement, settingsErrorMessage,
  shouldAskAge, tierProgressFraction, tierProgressLine, type HuntBoardView, type HuntRowModel,
} from './homeHuntModel';
import StandingsPodium from './StandingsPodium';
import { StandingsInvite, StandingsListCard, StandingsRow } from './StandingsRow';

const rewardSound = require('../../../assets/sounds/reward.mp3');
const STALE_MS = 60_000;

// Survives tab switches so returning shows the last board at once.
const boardCache: Partial<Record<HuntBoardView, { board: HomeHuntBoard; at: number }>> = {};

type Status = 'loading' | 'ready' | 'error';

const asPlayer = (row: HuntRowModel) => ({ ...row.avatar, hunt_points: row.points }) as unknown as PlayerType;
const huntScore = (player: PlayerType) => Number((player as unknown as { hunt_points?: number }).hunt_points) || 0;

/** The rank number rolls over 400 ms when it changes, with a rising pluck on a rank up. */
function RankOdometer({ rank, unranked }: { readonly rank: number | null; readonly unranked: boolean }) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const [shown, setShown] = useState(rank);
  const previous = useRef(rank);
  useEffect(() => {
    const from = previous.current;
    previous.current = rank;
    if (rank == null || from == null || from === rank) { setShown(rank); return; }
    if (rankMovement(from, rank) === 'up') playSound(rewardSound);
    if (reduced) { setShown(rank); return; }
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 400);
      setShown(Math.round(from + (rank - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rank, reduced, playSound]);
  if (unranked) return <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.navySoft }}>{HOME_HUNT_COPY.unranked}</Text>;
  return <Text style={{ fontFamily: 'Shark', fontSize: 26, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{shown == null ? '--' : `#${shown}`}</Text>;
}

function HeaderCard({ week, label, now, onInfo }: {
  readonly week: HomeHuntWeek | null; readonly label: string; readonly now: number; readonly onInfo: () => void;
}) {
  const fraction = tierProgressFraction(week);
  const progress = tierProgressLine(week);
  const unranked = week?.unranked === true;
  return (
    <View style={{
      marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: RADIUS.lg, backgroundColor: BRAND.cream,
      borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <GameIcon name="map" size={26} />
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, textTransform: 'uppercase' }}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="How Home Hunt works" onPress={onInfo} hitSlop={10}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -8 }}>
          <GameIcon name="info" size={28} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft, letterSpacing: 0.6 }}>YOUR POINTS</Text>
          <Text style={{ fontFamily: 'Shark', fontSize: 34, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>{(week?.points ?? 0).toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <RankOdometer rank={week?.rank ?? null} unranked={unranked} />
          {!!week?.ends_at && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <GameIcon name="timer" size={16} />
              <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft }}>{countdownText(week.ends_at, now)}</Text>
            </View>
          )}
        </View>
      </View>
      {!!progress && (
        <View style={{ marginTop: 8 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: BRAND.sky, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', backgroundColor: BRAND.gold }} />
          </View>
          <Text style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, marginTop: 4 }}>{progress}</Text>
        </View>
      )}
    </View>
  );
}

function Segmented({ view, onChange }: { readonly view: HuntBoardView; readonly onChange: (view: HuntBoardView) => void }) {
  const options: readonly { key: HuntBoardView; label: string }[] = [
    { key: 'zone', label: HOME_HUNT_COPY.nearMe }, { key: 'friends', label: HOME_HUNT_COPY.friends },
  ];
  return (
    <View accessibilityRole="tablist" style={{
      flexDirection: 'row', height: 44, marginHorizontal: 16, marginTop: 10, padding: 3, borderRadius: 22,
      backgroundColor: 'rgba(5,52,110,0.35)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    }}>
      {options.map(option => {
        const selected = option.key === view;
        return (
          <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{ selected }}
            onPress={() => { if (!selected) { void Haptics.selectionAsync().catch(() => undefined); onChange(option.key); } }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: selected ? BRAND.white : 'transparent' }}>
            <Text style={{ fontFamily: 'Shark', fontSize: 16, color: selected ? BRAND.navy : BRAND.white }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingRow({ title, hint, value, disabled, onChange }: {
  readonly title: string; readonly hint?: string; readonly value: boolean; readonly disabled?: boolean; readonly onChange: (value: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontFamily: 'Shark', fontSize: 16, color: disabled ? BRAND.navySoft : BRAND.navy }}>{title}</Text>
        {!!hint && <Text style={{ fontFamily: 'Knockout', fontSize: 14, lineHeight: 17, color: BRAND.navySoft }}>{hint}</Text>}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange}
        trackColor={{ false: BRAND.sky, true: BRAND.gold }} thumbColor={BRAND.white} ios_backgroundColor={BRAND.sky} />
    </View>
  );
}

export default function HomeHunt() {
  const { player } = useContext(AuthContext);
  const reduced = useUiReducedMotion();
  const [week, setWeek] = useState<HomeHuntWeek | null>(cachedHomeHuntWeek());
  const [view, setView] = useState<HuntBoardView>('zone');
  const [board, setBoard] = useState<HomeHuntBoard | null>(boardCache.zone?.board ?? null);
  const [status, setStatus] = useState<Status>(boardCache.zone ? 'ready' : 'loading');
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [infoOpen, setInfoOpen] = useState(false);
  const [ageHandled, setAgeHandled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [resultFor, setResultFor] = useState<HomeHuntResult | null>(null);
  const request = useRef(0);
  const badges = usePresentationBadges('standings');
  const { info, error: infoError, retry: retryInfo } = useHomeHuntInfo(infoOpen);

  useEffect(() => subscribeHomeHuntWeek(setWeek), []);
  useEffect(() => { void loadHomeHuntWeek(player?.id ?? null, true); }, [player?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cached = boardCache[view];
    if (cached && Date.now() - cached.at < STALE_MS && reload === 0) { setBoard(cached.board); setStatus('ready'); return; }
    const id = ++request.current;
    if (!cached) setStatus('loading');
    else setBoard(cached.board);
    getHomeHuntBoard(view).then(data => {
      if (id !== request.current) return;
      boardCache[view] = { board: data, at: Date.now() };
      setBoard(data);
      setStatus('ready');
    }).catch(() => { if (id === request.current) setStatus(boardCache[view] ? 'ready' : 'error'); });
  }, [view, reload]);

  const mergeWeek = useCallback((patch: Partial<HomeHuntWeek>) => {
    setHomeHuntWeek({ ...(cachedHomeHuntWeek() ?? { enabled: true }), ...patch } as HomeHuntWeek);
  }, []);

  const saveSettings = useCallback(async (body: HomeHuntSettingsBody, failure: string): Promise<boolean> => {
    if (savingSettings) return false;
    setSavingSettings(true);
    try {
      const saved = await saveHomeHuntSettings(body);
      mergeWeek(saved);
      if (body.home_hunt_visible !== undefined || body.birth_year !== undefined || body.age_skipped) {
        // Boards depend on visibility, so refetch them next view.
        delete boardCache.zone; delete boardCache.friends;
        setReload(value => value + 1);
      }
      return true;
    } catch (error) {
      showToast(settingsErrorMessage(error, failure), 'error');
      return false;
    } finally {
      setSavingSettings(false);
    }
  }, [savingSettings, mergeWeek]);

  // Results waiting as a badge: the player opens them here, outside the queue.
  const openResults = useCallback(async () => {
    try {
      const data = await getHomeHuntResults();
      const next = presentableResults(data?.results)[0];
      if (next) setResultFor(next);
      else badges.forEach(badge => presentationQueue.clearBadge(badge.id));
    } catch {
      showToast('Could not load your results. Try again.', 'error');
    }
  }, [badges]);

  const settings = huntSettingsState(week);
  const rows = huntRows(board, view);
  const me = huntMeRow(board, view);
  const slots = huntPodium(rows);
  const interactive = view === 'friends';
  const label = board?.label || week?.board?.label || HOME_HUNT_COPY.tabLabel;
  const empty = board?.empty === true || rows.length === 0;
  const retry = () => { delete boardCache[view]; setReload(value => value + 1); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: me ? 96 : 24 }}>
        <FloatingParticles count={reduced ? 0 : 8} />
        <HeaderCard week={week} label={label} now={now} onInfo={() => setInfoOpen(true)} />
        {badges.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => void openResults()} style={{
            marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: RADIUS.md, backgroundColor: BRAND.gold,
            borderWidth: 3, borderColor: BRAND.white, flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <GameIcon name="chest" size={30} />
            <Text style={{ flex: 1, fontFamily: 'Shark', fontSize: 16, color: BRAND.navy }}>{HOME_HUNT_COPY.resultsReady}</Text>
            <GameIcon name="arrow" size={22} />
          </Pressable>
        )}
        <Segmented view={view} onChange={setView} />
        {status === 'error' ? (
          <SharkLoader state="error" tone="onBlue" title={HOME_HUNT_COPY.loadError} onRetry={retry} />
        ) : status === 'loading' ? (
          <SharkLoader tone="onBlue" onRetry={retry} />
        ) : (
          <>
            <StandingsPodium
              podium={[slots.podium[0] ? asPlayer(slots.podium[0]) : null, slots.podium[1] ? asPlayer(slots.podium[1]) : null, slots.podium[2] ? asPlayer(slots.podium[2]) : null]}
              scoreOf={huntScore}
              scoreIcon="star"
              meId={undefined}
              interactive={interactive}
              playKey={`hunt:${view}:${rows.slice(0, 3).map(row => `${row.rank}${row.name}`).join(',')}`}
              header={<View style={{ height: 8 }} />}
            />
            <StandingsListCard>
              {empty ? (
                <StandingsInvite
                  title={view === 'friends' ? HOME_HUNT_COPY.friendsEmpty : firstHunterLine(label)}
                  message={view === 'friends' ? 'Invite friends to hunt with you.' : 'Find something near you to take the top spot.'}
                  actionLabel={HOME_HUNT_COPY.startHunting}
                  onAction={() => RootNavigation.navigate('Explore')} />
              ) : (
                slots.rest.map((row, index) => (
                  <StandingsRow key={row.key} player={asPlayer(row)} rank={row.rank} index={index} score={row.points}
                    scoreIcon="star" detail={`${row.finds} ${row.finds === 1 ? 'find' : 'finds'}`}
                    isMe={row.isMe} interactive={interactive && row.playerId != null} />
                ))
              )}
            </StandingsListCard>
          </>
        )}
        {week && (
          <View style={{
            marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: RADIUS.lg, backgroundColor: BRAND.white,
            borderWidth: 3, borderColor: BRAND.sky,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft, letterSpacing: 0.6 }}>YOUR HUNTER NAME</Text>
                <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 20, color: BRAND.navy }}>{week.hunter_name || '--'}</Text>
              </View>
              <GameButton label={`${HOME_HUNT_COPY.rerollLabel} (${settings.rerollsLeft})`} variant="secondary" size="compact" fullWidth={false}
                disabled={!settings.canReroll} loading={savingSettings}
                onPress={() => void saveSettings({ reroll_name: true }, 'Could not change your Hunter Name.')} />
            </View>
            <SettingRow title={HOME_HUNT_COPY.visibilityLabel}
              hint={settings.visibilityEnabled ? undefined : HOME_HUNT_COPY.visibilityLocked}
              value={settings.visibilityValue} disabled={!settings.visibilityEnabled || savingSettings}
              onChange={value => void saveSettings({ home_hunt_visible: value }, 'Could not save that setting.')} />
            {/* Preference only: this wave never asks for notification permission. */}
            <SettingRow title={HOME_HUNT_COPY.nudgeLabel} hint={HOME_HUNT_COPY.nudgeHint}
              value={settings.nudgeValue} disabled={savingSettings}
              onChange={value => void saveSettings({ friend_nudge_enabled: value }, 'Could not save that setting.')} />
          </View>
        )}
      </ScrollView>

      {me && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>
          <StandingsRow player={asPlayer(me)} rank={me.rank} index={0} score={me.points} scoreIcon="star"
            detail={`${me.finds} ${me.finds === 1 ? 'find' : 'finds'}`} isMe interactive={false} enterDelayBase={0} />
        </View>
      )}

      <HomeHuntInfoSheet visible={infoOpen} title={HOME_HUNT_COPY.infoTitle} sections={standingsInfoSections(info)}
        loading={!info} error={infoError} onRetry={retryInfo} onClose={() => setInfoOpen(false)} />
      <HomeHuntAgeSheet visible={shouldAskAge(week, ageHandled)} busy={savingSettings}
        onSave={year => { void saveSettings({ birth_year: year }, 'Could not save that.').then(ok => { if (ok) setAgeHandled(true); }); }}
        onSkip={() => { setAgeHandled(true); void saveSettings({ age_skipped: true }, 'Could not save that.'); }} />
      <HomeHuntResultsModal result={resultFor} visible={resultFor != null}
        onClose={() => setResultFor(null)}
        onClaimed={claimed => {
          presentationQueue.clearBadge(resultPresentationId({ week_key: claimed.week_key, status: 'claimable' }));
          presentationQueue.clearBadge(resultPresentationId({ week_key: claimed.week_key, status: 'held' }));
          setResultFor(null);
        }} />
    </View>
  );
}
