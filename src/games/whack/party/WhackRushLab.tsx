/**
 * WhackRushLab (dev builds only): Line Party's real UI playing a live Whack
 * Rush series against the house crew, with the in-process localPartyHost
 * standing in for the server. Reached from the MiniGameTester with
 * EXPO_PUBLIC_WHACK_FORMAT=party (EXPO_PUBLIC_GAME_AUTOPLAY=1 adds demo hands).
 */
import { useMemo } from 'react';
import { AppState, Modal } from 'react-native';
import { PartyClient } from '../../../gamekit/net/PartyClient';
import LineParty from '../../../gamekit/party/LineParty';
import { createLocalPartyHost } from './localPartyHost';

export default function WhackRushLab({ visible, onClose, autoplay }: { visible: boolean; onClose: () => void; autoplay?: boolean }) {
  const client = useMemo(() => {
    const log = __DEV__ ? (m: string, d?: unknown) => console.log('[whack-rush-lab]', m, d ?? '') : undefined;
    const host = createLocalPartyHost({ userId: 7, name: 'You', game: 'whack_rush', log });
    return new PartyClient({ http: host.http, userId: 7, games: ['whack_rush'], appState: AppState, log });
  }, []);
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LineParty client={client} rideId={194} onExit={onClose} autoplay={autoplay ? 'regular' : null} />
    </Modal>
  );
}
