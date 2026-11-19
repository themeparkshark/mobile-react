/**
 * Real coin art for the proof screens (dev gallery only): the signed-in scratch player's
 * Disneyland shelf through the app's own read-only shelf reads (fetchParkShelf), so the map's
 * guide card, PLAY!'s tag and the win card show the server's Walt Statue and Tiki Room coins,
 * never a stand-in. Until the read answers (or if it fails) the art is undefined and the parts
 * draw their empty spot.
 */
import { useContext, useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { AuthContext } from '../../../context/AuthProvider';
import { fetchParkShelf } from '../../../services/collection/parkShelfPrefetch';

export const PROOF_PARK = 8;

/** Coin art by task name, for the names asked. */
export function useParkCoinArt(names: readonly string[]): Readonly<Record<string, ImageSourcePropType | undefined>> {
  const auth = useContext(AuthContext);
  const player = auth?.player?.id ?? 0;
  const key = names.join('|');
  const [art, setArt] = useState<Record<string, ImageSourcePropType | undefined>>({});
  useEffect(() => {
    if (!player) return undefined;
    let live = true;
    fetchParkShelf(PROOF_PARK, player).then(d => {
      if (!live) return;
      const out: Record<string, ImageSourcePropType | undefined> = {};
      for (const t of [...d.available, ...d.limited, ...d.archived]) {
        if (key.split('|').includes(t.name) && t.coin_url && !out[t.name]) out[t.name] = { uri: t.coin_url };
      }
      setArt(out);
    }, () => undefined);
    return () => { live = false; };
  }, [key, player]);
  return art;
}
