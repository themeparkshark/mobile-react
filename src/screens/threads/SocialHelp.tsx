/**
 * The "?" on Shark Social: the shared help sheet (posting, then kind and safe),
 * with the grown-up links (Blocked players, email us) on the safety page.
 */
import { openExternal } from '../../services/external';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import HelpSheet from '../../components/help/HelpSheet';
import * as RootNavigation from '../../RootNavigation';
import { helpSheet } from '../../services/help/helpSheets';
import { SUPPORT_EMAIL } from '../Settings/accountDeletion';
import { BRAND, GameIcon } from '../../ui';
import { PressScale } from './socialLook';

const SHEET = helpSheet('social');

export default function SocialHelp() {
  const [open, setOpen] = useState(false);

  const links = (
    <View style={styles.links}>
      <PressScale
        onPress={() => { setOpen(false); setTimeout(() => RootNavigation.navigate('BlockedPlayers'), 350); }}
        style={styles.link}
        accessibilityLabel="Blocked players"
      >
        <GameIcon name="lock" size={20} />
        <Text maxFontSizeMultiplier={1.25} style={styles.linkText}>Blocked players</Text>
      </PressScale>
      <PressScale
        onPress={() => void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shark Social (parent)')}`, 'system')} // clarity-allow: email subject for our support inbox
        style={styles.link}
        accessibilityLabel={`Grown-ups: email ${SUPPORT_EMAIL}`}
      >
        <GameIcon name="info" size={20} />
        <Text maxFontSizeMultiplier={1.25} style={styles.linkText}>Grown-ups: email us</Text>
      </PressScale>
    </View>
  );

  return (
    <>
      <PressScale onPress={() => setOpen(true)} accessibilityLabel="How Shark Social works" hitSlop={8}>
        <GameIcon name="info" size={40} />
      </PressScale>
      <HelpSheet visible={open} sheet={SHEET} onClose={() => setOpen(false)}
        pageFooter={page => (page.key === 'safe' ? links : <View style={styles.linksSpace} />)} />
    </>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', gap: 10, marginTop: 12 },
  linksSpace: { height: 56 },
  link: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#d7ecfb',
  },
  linkText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 3 },
});
