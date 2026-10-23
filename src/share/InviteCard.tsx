/**
 * The Friends invite picture (9:16, 1080x1920): "PLAY WITH ME!" and the player's own shark,
 * big and dressed, on a stage, with the invite link and its QR in the shared footer.
 * Kid safety: no name of any kind on the picture. The shark name is typed by the kid at signup,
 * so it only goes in the private text message next to the picture (inviteMessage), never in
 * public story art. No place, no date.
 */
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InventoryType } from '../models/inventory-type';
import { FlexShark } from './FlexShark';
import { StoryShareFrame } from './StoryShareFrame';

/** What the invite says with the picture (the link is in the text too, so it previews in Messages). Exported for tests. */
export function inviteMessage(name: string | null | undefined, url: string): string {
  const shark = name?.trim();
  return `Play Theme Park Shark with me!${shark ? ` Add my shark: ${shark}` : ''}\n${url}`;
}

export const InviteCard = forwardRef<View, { readonly inventory: InventoryType | null | undefined }>(
  function InviteCard({ inventory }, ref) {
    return (
      <StoryShareFrame ref={ref} ribbon="PLAY WITH ME!" cta="Scan to play!" campaign="invite">
        <View style={styles.stage}>
          <FlexShark inventory={inventory} height={300} />
        </View>
        <Text style={styles.line}>Come catch ride coins with me</Text>
      </StoryShareFrame>
    );
  },
);

const styles = StyleSheet.create({
  stage: { width: 300, height: 320, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 4, borderColor: '#ffffff', paddingBottom: 6 },
  line: { fontFamily: 'Shark', fontSize: 22, lineHeight: 26, color: '#ffffff', textAlign: 'center', marginTop: 12,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});
