import { useContext } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { previewPlayer } from './ProfilePreviewScreen';
import SocialScreen from './SocialScreen';

// A development-only Social screen as a signed-in player: the live feed (read only)
// and the chest in the top bar, for capturing tap feedback.
export default function SocialPreviewScreen({ navigation }: { navigation: Parameters<typeof SocialScreen>[0]['navigation'] }) {
  const auth = useContext(AuthContext);
  return (
    <AuthContext.Provider value={{ ...auth, player: previewPlayer, isReady: true }}>
      <SocialScreen navigation={navigation} />
    </AuthContext.Provider>
  );
}
