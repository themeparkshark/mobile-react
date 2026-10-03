/**
 * Art on a flex card. Each image registers with the card on mount and reports
 * when it has drawn, so the card is only captured once every piece is there.
 * Remote art that is slow or broken falls back to a bundled image after 4 s,
 * so a card always captures.
 */
import { Image, type ImageStyle } from 'expo-image';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StyleProp } from 'react-native';
import type { FlexArt } from './types';

interface ArtReadiness {
  readonly register: (key: string) => void;
  readonly ready: (key: string) => void;
}

const ReadinessContext = createContext<ArtReadiness | null>(null);

/** Tracks the card's art; calls onReadyChange(true) once all of it has drawn. */
export function ArtReadinessProvider({ children, onReadyChange }: {
  readonly children: ReactNode;
  readonly onReadyChange?: (ready: boolean) => void;
}) {
  const wanted = useRef(new Set<string>());
  const done = useRef(new Set<string>());
  const [, bump] = useState(0);
  const last = useRef<boolean | null>(null);
  const check = useCallback(() => {
    const ready = wanted.current.size > 0 && [...wanted.current].every(key => done.current.has(key));
    if (ready !== last.current) {
      last.current = ready;
      onReadyChange?.(ready);
    }
  }, [onReadyChange]);
  const value = useMemo<ArtReadiness>(() => ({
    register: key => { wanted.current.add(key); check(); },
    ready: key => { done.current.add(key); check(); bump(n => n + 1); },
  }), [check]);
  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>;
}

export function artSource(art: FlexArt): number | { uri: string } {
  return typeof art === 'number' ? art : { uri: art };
}

export function FlexArtwork({ art, fallback, style, contentFit = 'contain', id }: {
  readonly art: FlexArt | null | undefined;
  readonly fallback: number;
  readonly style: StyleProp<ImageStyle>;
  readonly contentFit?: 'contain' | 'cover';
  /** Distinguishes two copies of the same art on one card. */
  readonly id?: string;
}) {
  const readiness = useContext(ReadinessContext);
  const key = `${id ?? ''}:${art == null ? `fallback:${fallback}` : String(art)}`;
  const [late, setLate] = useState(art == null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { readiness?.register(key); }, [key, readiness]);
  useEffect(() => {
    if (late || loaded) return;
    const timer = setTimeout(() => setLate(true), 4000);
    return () => clearTimeout(timer);
  }, [late, loaded]);
  const done = () => readiness?.ready(key);
  // Slow art shows the bundled fallback (so the card can still capture) but keeps
  // loading underneath and takes over the moment it arrives.
  return (
    <>
      {late && !loaded && <Image source={fallback} style={style} contentFit={contentFit} onLoad={done} onError={done} />}
      {art != null && <Image source={artSource(art)} style={[style, !loaded && (late ? HIDDEN_BEHIND : HIDDEN)]} contentFit={contentFit} cachePolicy="memory-disk"
        onLoad={() => { setLoaded(true); done(); }} onError={() => setLate(true)} />}
    </>
  );
}

const HIDDEN = { opacity: 0 } as const;
/** While the fallback holds the slot, the still-loading image sits out of the layout. */
const HIDDEN_BEHIND = { opacity: 0, position: 'absolute' } as const;

/** Holds the card's capture until `done` (e.g. text measured and sized). */
export function useReadyGate(key: string, done: boolean): void {
  const readiness = useContext(ReadinessContext);
  useEffect(() => { readiness?.register(key); }, [key, readiness]);
  useEffect(() => { if (done) readiness?.ready(key); }, [done, key, readiness]);
}
