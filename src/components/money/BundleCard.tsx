/**
 * <BundleCard />: Alex's big shop card for a bundle (the Starter Pack, the Park Trip Pack): a band,
 * the pack art, the contents as picture-and-number chips, and a full-width navy price bar. No value
 * talk on the card a kid sees (no "worth $6.60", no "way more"): a bundle's worth is shown only to the
 * grown-up, inside the gate (gateDetails). Used on Supplies and on the post-win sheet, so the offer looks the same everywhere.
 */
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { ShopProduct } from '../../api/endpoints/me/shop';
import type { BundleWorth } from '../../services/money/offers';
import { Image } from 'expo-image';
import { frameArt } from './frames';
import WishHeart from './WishHeart';
import { Band, Contents, MAX_FONT, PackArt, PriceBar, ShopCard, type PackArtKey } from './moneyUi';
import { FONT } from '../../ui';

export default function BundleCard({ product, price, busy, disabled, onBuy, band = 'STARTER PACK · ONE PER PLAYER', art = 'chest', compact = false }: {
  product: ShopProduct; price?: string;
  /** Kept for callers; never drawn on the card (the grown-up sees it inside the gate). */
  worth?: BundleWorth | null; busy: boolean; disabled: boolean; onBuy: () => void;
  band?: string; art?: PackArtKey; compact?: boolean;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(60).springify().damping(15)} style={{ alignSelf: 'stretch' }}>
      <ShopCard onPress={onBuy} disabled={disabled || !price} glow
        accessibilityLabel={`${product.title}${product.limit === 'once' ? ', just once' : ''}. ${price ? `${price}, real money, a grown-up buys it.` : ''}`}>
        <Band text={band} color={art === 'chest' ? 'gold' : 'blue'} size={compact ? 15 : 18} />
        <View style={st.body}>
          <View style={[st.art, compact && st.artCompact]}><PackArt art={art} size={compact ? 92 : 142} /></View>
          <View style={{ flex: 1, gap: 6 }}>
            <Contents grants={product.grants} size="tight" />
            {product.frame && frameArt(product.frame.key) && (
              // Only this pack has it: its own look, a profile frame kept for good.
              <View style={st.frameRow}>
                <Image source={frameArt(product.frame.key)!} style={{ width: 30, height: 30 }} contentFit="contain" />
                <Text maxFontSizeMultiplier={MAX_FONT} style={st.kid} numberOfLines={1}>{`Plus the ${product.frame.name}`}</Text>
              </View>
            )}
          </View>
        </View>
        <PriceBar price={price} busy={busy} big={!compact} />
        <WishHeart id={product.product_id} name={product.title} />
      </ShopCard>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  body: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, alignSelf: 'stretch' },
  art: { width: 150, height: 140, alignItems: 'center', justifyContent: 'center' },
  artCompact: { width: 92, height: 88 },
  frameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kid: { fontFamily: FONT.display, fontSize: 15, color: '#e2f6ff' },
});
