/**
 * The story-size frame (9:16, saved at 1080x1920) for share pictures outside the Share
 * Studio kinds: a ride log card, a mini-game result. TPS blue, a short kicker on top, the
 * card in the middle, and the TPS link with a QR that scans to it at the bottom.
 * Kid safety: callers pass no player names, typed notes, dates or ride names.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { QR_BY_CAMPAIGN, type ShareCampaign } from './campaignQr';
import { FLEX_SIZE } from './formats';
import { SHARE_LINK_DISPLAY } from './link';

export interface StoryShareFrameProps {
  readonly kicker: string;
  readonly cta: string;
  readonly campaign: ShareCampaign;
  readonly children: ReactNode;
}

export const StoryShareFrame = forwardRef<View, StoryShareFrameProps>(function StoryShareFrame({ kicker, cta, campaign, children }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      <LinearGradient colors={['#20AAE8', '#0B83C9', '#05346E']} style={StyleSheet.absoluteFill} />
      <Text style={styles.kicker}>{kicker}</Text>
      <View style={styles.slot}>{children}</View>
      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <Text style={styles.cta}>{cta}</Text>
          <Text style={styles.link}>{SHARE_LINK_DISPLAY}</Text>
        </View>
        <Image source={QR_BY_CAMPAIGN[campaign]} style={styles.qr} contentFit="contain" />
      </View>
    </View>
  );
});

/** Wrap a StoryShareFrame in this to keep it off screen (captured on demand). */
export const OFFSCREEN = { position: 'absolute', left: -4000, top: 0 } as const;

const styles = StyleSheet.create({
  frame: { ...FLEX_SIZE.story, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 70, paddingBottom: 56, justifyContent: 'space-between' },
  kicker: { color: '#FFF0A6', fontSize: 22, fontFamily: 'Shark', textAlign: 'center', letterSpacing: 1,
    textShadowColor: 'rgba(0,45,100,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  slot: { width: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(3,40,92,0.55)', borderRadius: 16, padding: 12 },
  footerCopy: { flex: 1 },
  cta: { color: '#FFCF3B', fontSize: 19, fontFamily: 'Shark' },
  link: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Knockout', marginTop: 3 },
  qr: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#FFFFFF' },
});
