/**
 * The Friends invite picture (9:16, 1080x1920): "ADD MY SHARK!", the player's own shark, and the
 * shark name as the friend code, with the invite link and its QR in the shared footer.
 * Kid safety: the shark name is the only name on it (no real name, no place, no date).
 */
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InventoryType } from '../models/inventory-type';
import { FlexShark } from './FlexShark';
import { Outlined } from './Outlined';
import { StoryShareFrame } from './StoryShareFrame';

/** What the invite says with the picture (the link is in the text too, so it previews in Messages). Exported for tests. */
export function inviteMessage(name: string | null | undefined, url: string): string {
  const shark = name?.trim();
  return `Play Theme Park Shark with me!${shark ? ` Add my shark: ${shark}` : ''}\n${url}`;
}

export const InviteCard = forwardRef<View, { readonly name: string | null | undefined; readonly inventory: InventoryType | null | undefined }>(
  function InviteCard({ name, inventory }, ref) {
    const shark = name?.trim();
    return (
      <StoryShareFrame ref={ref} ribbon="ADD MY SHARK!" cta="Play with me!" campaign="invite">
        <View style={styles.panel}>
          <FlexShark inventory={inventory} height={230} />
          {shark ? <>
            <Text style={styles.label}>MY SHARK NAME</Text>
            <Outlined text={shark} outline="#05346e" lines={1} style={styles.name} />
            <Text style={styles.hint}>Search it in Friends to add me</Text>
          </> : <Text style={styles.hint}>Come catch ride coins with me</Text>}
        </View>
      </StoryShareFrame>
    );
  },
);

const styles = StyleSheet.create({
  panel: { width: 300, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 14, borderRadius: 24, backgroundColor: '#f3fbff',
    borderWidth: 4, borderBottomWidth: 8, borderColor: '#05346e' },
  label: { fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1.2, color: '#39759c', marginTop: 10 },
  name: { fontFamily: 'Shark', fontSize: 30, lineHeight: 34, color: '#ffcf3b', textAlign: 'center' },
  hint: { fontFamily: 'Knockout', fontSize: 16, color: '#0b4b83', marginTop: 6, textAlign: 'center' },
});
