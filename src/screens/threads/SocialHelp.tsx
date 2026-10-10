/**
 * The "?" on Shark Social: the shared help sheet (posting, then kind and safe),
 * with the grown-up links (Blocked players, email us) under Got it.
 */
import { openExternal } from '../../services/external';
import { useState } from 'react';
import { askGrownUp } from '../../components/GrownUpGate';
import HelpSheet from '../../components/help/HelpSheet';
import * as RootNavigation from '../../RootNavigation';
import { helpSheet } from '../../services/help/helpSheets';
import { SUPPORT_EMAIL } from '../Settings/accountDeletion';
import { GameIcon } from '../../ui';
import { PressScale } from './socialLook';

const SHEET = helpSheet('social');

export default function SocialHelp() {
  const [open, setOpen] = useState(false);

  // Grown-up links sit under Got it, like every sheet's quiet links.
  const links = [
    { label: 'Blocked players', onPress: () => { setOpen(false); setTimeout(() => RootNavigation.navigate('BlockedPlayers'), 350); } },
    // Leaving for the mail app asks a grown-up. The sheet closes first, so the gate never
    // stacks a second modal on top of it (iOS freezes on that).
    { label: 'Grown-ups: email us', onPress: () => { setOpen(false); setTimeout(() => void emailUs(), 350); } },
  ];

  async function emailUs() {
    if (!(await askGrownUp({ kind: 'leave', where: 'your email app' }))) return;
    void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shark Social (parent)')}`, 'system'); // clarity-allow: email subject for our support inbox
  }

  return (
    <>
      <PressScale onPress={() => setOpen(true)} accessibilityLabel="How Shark Social works" hitSlop={8}>
        <GameIcon name="info" size={40} />
      </PressScale>
      <HelpSheet visible={open} sheet={SHEET} onClose={() => setOpen(false)} links={links} />
    </>
  );
}
