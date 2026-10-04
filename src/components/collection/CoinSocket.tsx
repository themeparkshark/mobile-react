/**
 * An empty shelf slot: an embossed socket pressed into the shelf panel with the
 * silhouette of the coin that belongs there (Alex's real coin art, tinted).
 * Earned coins carry the colour, ring and shine; an empty socket is quiet, so
 * the hierarchy reads "what I have" first and "what is missing" second.
 * Secret coins never show a silhouette (they stay a mystery); callers keep
 * the mystery art for them.
 */
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { View } from 'react-native';
import MysteryCoinArtwork from '../MysteryCoinArtwork';
import { COIN_ART_ASPECT, loadedArtAspect } from './ShelfCoin';

export interface CoinSocketProps {
  readonly size: number;
  readonly coinUrl?: string | null;
  /** Highlight the socket (the player's goal). */
  readonly goal?: boolean;
  /** On a light card (coin guide) instead of the blue shelf panel. */
  readonly onLight?: boolean;
}

function CoinSocket({ size, coinUrl, goal = false, onLight = false }: CoinSocketProps) {
  const inset = Math.max(2, Math.round(size * 0.05));
  const face = size * 0.8;
  const [artAspect, setArtAspect] = useState(COIN_ART_ASPECT);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: onLight ? '#d7eefc' : '#05509a',
      borderWidth: inset, borderColor: onLight ? '#b5dcf3' : '#04427f',
      borderBottomColor: onLight ? '#ffffff' : '#2f8fd8',
      borderTopColor: onLight ? '#9ccbe9' : '#033566',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} pointerEvents="none">
      {coinUrl
        ? <View style={{ width: face, height: face, borderRadius: size, overflow: 'hidden' }}>
            {/* The real coin face, faded into the socket like a pressed outline. Pinned left like
                ShelfCoin (see COIN_ART_ASPECT) so the round face, not the 3/4 edge, is centred. */}
            <Image source={coinUrl} contentFit={artAspect >= 1 ? 'fill' : 'contain'}
              onLoad={event => setArtAspect(prev => loadedArtAspect(event.source, prev))}
              style={{ position: 'absolute', left: 0, top: 0, height: face, width: face * Math.max(1, artAspect),
                opacity: onLight ? 0.35 : 0.3 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: onLight ? 'rgba(215,238,252,0.35)' : 'rgba(5,80,154,0.35)' }} />
          </View>
        : <View style={{ opacity: 0.5 }}><MysteryCoinArtwork size={size * 0.8} /></View>}
      {goal && <View style={{ position: 'absolute', top: -inset, left: -inset, right: -inset, bottom: -inset,
        borderRadius: size, borderWidth: Math.max(2, inset), borderColor: '#ffcf3b', borderStyle: 'dashed' }} />}
    </View>
  );
}

export default memo(CoinSocket);
