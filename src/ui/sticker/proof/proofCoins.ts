/**
 * Real coin art for the proof screens (dev gallery only): the signed-in scratch player's
 * Disneyland shelf through the app's own read-only shelf reads (fetchParkShelf), so the map's
 * guide card, PLAY!'s tag and the win card show the server's Walt Statue and Tiki Room coins,
 * never a stand-in. Until the read answers (or if it fails) the art is undefined and the parts
 * draw their empty spot.
 */
import { useContext, useEffect, useState } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { AuthContext } from '../../../context/AuthProvider';
import { fetchParkShelf } from '../../../services/collection/parkShelfPrefetch';

export const PROOF_PARK = 8;

/** Coin art by task name, for the names asked. */
export function useParkCoinArt(names: readonly string[]): Readonly<Record<string, ImageSourcePropType | undefined>> {
  return useParkCoins(names).art;
}

/** The same, and whether the read has answered (or given up), so a moment can wait for its art. */
export function useParkCoins(names: readonly string[], waitMs: number = 2500): { readonly art: Readonly<Record<string, ImageSourcePropType | undefined>>; readonly ready: boolean } {
  const auth = useContext(AuthContext);
  const player = auth?.player?.id ?? 0;
  const key = names.join('|');
  const [art, setArt] = useState<Record<string, ImageSourcePropType | undefined>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!player) { setReady(true); return undefined; }
    let live = true;
    const giveUp = setTimeout(() => { if (live) setReady(true); }, waitMs);
    fetchParkShelf(PROOF_PARK, player).then(d => {
      if (!live) return;
      const out: Record<string, ImageSourcePropType | undefined> = {};
      for (const t of [...d.available, ...d.limited, ...d.archived]) {
        if (key.split('|').includes(t.name) && t.coin_url && !out[t.name]) out[t.name] = { uri: t.coin_url };
      }
      setArt(out);
      // Ready once the files are on the phone, so a landing coin never pops in late.
      const uris = Object.values(out).map(v => (v as { uri: string }).uri);
      Promise.all(uris.map(u => Image.prefetch(u).catch(() => false))).finally(() => { if (live) setReady(true); });
    }, () => { if (live) setReady(true); });
    return () => { live = false; clearTimeout(giveUp); };
  }, [key, player, waitMs]);
  return { art, ready };
}
