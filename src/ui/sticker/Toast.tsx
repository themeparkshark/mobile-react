/**
 * Toast: a cream pill under the header (DIRECTION.md kit: Toast). Level 1: the white cut edge and a
 * hard drop, Alex's art for the thing it is about hanging off its left end, a Shark title and an
 * optional soft line. It slaps on (stuck on, 1.08 to 1.0 with the drop closing), stays about 2.4 s,
 * and peels off (lifts, turns at its corner, fades). Reduce Motion: 150 ms fades. Toasts queue: one
 * at a time, in order. Only the active host draws (the focused kit Screen's, else the root one from
 * StickerRoot), so a stack of kit screens draws and announces it once; VoiceOver hears each toast
 * once even if focus moves while it is up. With no host in the tree a toast is dropped (dev
 * warning), never queued to appear later, stale.
 *
 *   showToast({ title: '+1 Ticket', line: 'Treats found', art: ART.ticket, artRatio: ART_RATIO.ticket })
 *
 * Screen mounts the ToastHost under its bar; it never takes taps.
 */
import { memo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, View, type ImageSourcePropType } from 'react-native';
import Animated, { runOnJS, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../useUiReducedMotion';
import Arrive from './Arrive';
import Lift from './Lift';
import Shell from './Shell';
import { PlaceProvider, useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { layerHosts } from './layers';
import { edgeFor, insideCard, warnOnce } from './level';
import { peelTiming, usePeelStyle } from './motion';
import { TEXT } from './textRoles';
import { DROP, HEADER, INK, LINE, SHADE, SPACE, TOAST } from './tokens';

export type ToastSpec = {
  readonly title: string;
  readonly line?: string;
  readonly art?: ImageSourcePropType;
  /** The art's width:height. */
  readonly artRatio?: number;
  /** What VoiceOver says (default: title and line). */
  readonly announce?: string;
};

type Entry = ToastSpec & { readonly id: number };

/** The toast queue (pure). */
export function createToastQueue() {
  let next = 1;
  let list: Entry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(l => l());
  const announced = new Set<number>();
  return {
    show(spec: ToastSpec): number { const id = next++; list = [...list, { ...spec, id }]; emit(); return id; },
    done(id: number): void { list = list.filter(t => t.id !== id); announced.delete(id); emit(); },
    /** True the first time it is asked for a toast: the one moment VoiceOver hears it. */
    announce(id: number): boolean { if (announced.has(id)) return false; announced.add(id); return true; },
    front(): Entry | null { return list[0] ?? null; },
    subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export const stickerToasts = createToastQueue();

/** Show a toast in the active host. Returns its id, or -1 when no kit host is mounted (dropped, never shown late). */
export function showToast(spec: ToastSpec, hosts: { count(): number } = layerHosts): number {
  if (hosts.count() === 0) {
    warnOnce('toast-nohost', __DEV__, m => console.warn(m), `showToast("${spec.title}") with no kit host mounted: dropped. Step 2 mounts StickerRoot above the navigator.`);
    return -1;
  }
  return stickerToasts.show(spec);
}

const CREAM = { colors: [SHADE.creamTop, INK.cream] as const, locations: [0, 0.45] as const };
const TITLE = { ...TEXT.name, maxScale: 1.15 };
const LINE_SPEC = { ...TEXT.bodySmall, maxScale: 1.15 };

/** The pill itself (also drawn still in the gallery). */
export const ToastPill = memo(function ToastPill({ title, line, art, artRatio = 1 }: ToastSpec) {
  const place = useStickerPlace();
  const edge = edgeFor('card', place);
  const artH = TOAST.art;
  return (
    <View style={{ height: TOAST.height, alignSelf: 'center', minWidth: 220, maxWidth: '100%' }}>
      <Shell radius={TOAST.height / 2} line={place.level === 'map' ? LINE.map : LINE.card} face={CREAM} edge={edge}
        drop={edge ? DROP.cardOnWorld : DROP.cardInPage} dropColor={place.level === 'map' ? DROP.map : DROP.color}
        insetTop={{ width: 2, color: INK.white }} insetBottom={{ width: 4, color: INK.creamDeep }} style={{ height: TOAST.height }}>
        <PlaceProvider value={insideCard()}>
          <View style={{ height: TOAST.height, flexDirection: 'row', alignItems: 'center', paddingLeft: art ? 44 : 18, paddingRight: 18, gap: 14 }}>
            <View style={{ paddingTop: 2, flexShrink: 1 }}><StickerText spec={TITLE} align="left" role="none">{title}</StickerText></View>
            {line ? <View style={{ flexShrink: 1, marginLeft: 'auto' }}><StickerText spec={LINE_SPEC} tone="soft" align="right" role="none">{line}</StickerText></View> : null}
          </View>
        </PlaceProvider>
      </Shell>
      {art ? <Lift source={art} width={Math.round(artH * artRatio)} height={artH} style={{ position: 'absolute', left: -10, top: (TOAST.height - artH) / 2 }} /> : null}
    </View>
  );
});

function ToastRun({ entry, onDone }: { entry: Entry; onDone: (id: number) => void }) {
  const reduced = useUiReducedMotion();
  const out = useSharedValue(0);
  const peel = usePeelStyle(out, reduced);
  const finish = useCallback(() => onDone(entry.id), [entry.id, onDone]);
  useEffect(() => {
    if (stickerToasts.announce(entry.id)) AccessibilityInfo.announceForAccessibility(entry.announce ?? (entry.line ? `${entry.title}. ${entry.line}` : entry.title));
    out.value = withDelay(TOAST.ms, withTiming(1, peelTiming(reduced), done => { if (done) runOnJS(finish)(); }));
  }, [entry, finish, out, reduced]);
  return (
    <Animated.View style={peel} pointerEvents="none">
      <Arrive>{() => <ToastPill {...entry} />}</Arrive>
    </Animated.View>
  );
}

/** Where toasts appear: Screen puts it at the top of its body, under the bar. Draws only when its host is the active one. */
export const ToastHost = memo(function ToastHost({ active }: { readonly active: boolean }) {
  const front = useSyncExternalStore(stickerToasts.subscribe, stickerToasts.front);
  const done = useCallback((id: number) => stickerToasts.done(id), []);
  if (!front || !active) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: SPACE.margin * 2, right: SPACE.margin * 2, top: HEADER.gap, zIndex: 45, alignItems: 'center' }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ToastRun key={front.id} entry={front} onDone={done} />
    </View>
  );
});
