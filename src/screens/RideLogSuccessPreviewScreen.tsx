import { useContext } from 'react';
import { AuthContext } from '../context/AuthProvider';
import RideLogSuccess from '../components/RideTracker/RideLogSuccess';
import { PlayerRideType } from '../api/endpoints/player-rides';
import { previewPlayer } from './ProfilePreviewScreen';
import { SHARK_REACTIONS } from '../components/RideTracker/SharkReactionIcon';

const previewRide: PlayerRideType = {
  id: 1,
  ride_id: 10,
  ride_name: 'Space Mountain',
  ride_slug: 'space-mountain',
  ride_type: 'coaster',
  ride_image_url: null,
  park_id: 2,
  rating: 5,
  // Reaction codes are data keys that render as shark art.
  reaction: SHARK_REACTIONS[0].code,
  wait_time_minutes: 45,
  note: 'Our favorite ride of the trip.',
  photo_url: null,
  rode_at: '2026-09-25T18:00:00Z',
  weather: null,
};

export default function RideLogSuccessPreviewScreen() {
  const auth = useContext(AuthContext);
  return (
    <AuthContext.Provider value={{ ...auth, player: previewPlayer, isReady: true }}>
      <RideLogSuccess ride={previewRide} xpEarned={0}
        newAchievements={[{ id: 1, name: 'First Timer', icon: 'coaster' }]}
        onDone={() => undefined} onLogAnother={() => undefined} />
    </AuthContext.Provider>
  );
}
