/**
 * An empty shelf slot: an embossed socket pressed into the shelf panel with the
 * silhouette of the coin that belongs there (Alex's real coin art, tinted).
 * Earned coins carry the colour, ring and shine; an empty socket is quiet, so
 * the hierarchy reads "what I have" first and "what is missing" second.
 * Secret coins never show a silhouette (they stay a mystery); callers keep
 * the mystery art for them.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { View } from 'react-native';
import MysteryCoinArtwork from '../MysteryCoinArtwork';

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
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: onLight ? '#d7eefc' : '#05509a',
      borderWidth: inset, borderColor: onLight ? '#b5dcf3' : '#04427f',
      borderBottomColor: onLight ? '#ffffff' : '#2f8fd8',
      borderTopColor: onLight ? '#9ccbe9' : '#033566',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} pointerEvents="none">
      {coinUrl
        ? <Image source={coinUrl} contentFit="contain" tintColor={onLight ? 'rgba(7,104,185,0.28)' : 'rgba(191,229,255,0.32)'}
            style={{ width: size * 0.8, height: size * 0.8 }} />
        : <View style={{ opacity: 0.5 }}><MysteryCoinArtwork size={size * 0.8} /></View>}
      {goal && <View style={{ position: 'absolute', top: -inset, left: -inset, right: -inset, bottom: -inset,
        borderRadius: size, borderWidth: Math.max(2, inset), borderColor: '#ffcf3b', borderStyle: 'dashed' }} />}
    </View>
  );
}

export default memo(CoinSocket);
