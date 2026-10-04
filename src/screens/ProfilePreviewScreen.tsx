import { useContext } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { InventoryType } from '../models/inventory-type';
import { PlayerType } from '../models/player-type';
import ProfileScreen from './ProfileScreen';

// A development-only offline fixture for checking the actual profile layout.
export const previewPlayer: PlayerType = {
  avatar_url: '',
  coins: 12947,
  completed_tasks_count: 18,
  created_at: '2025-01-01',
  current_park_id: 0,
  email: '',
  enabled_music: true,
  enabled_sound_effects: true,
  experience: 414,
  experience_level: { id: 4, level: 4, experience: 2200 },
  friends_count: 100,
  has_friend_request_from: false,
  has_pending_friend_requests: false,
  id: 1,
  inventory: {} as InventoryType,
  is_friend: false,
  is_subscribed: false,
  keys: 1,
  last_read_notifications_at: '',
  mascot: {} as PlayerType['mascot'],
  name: 'Dustin',
  park_coins: 25,
  park_coins_count: 25,
  ride_coins_collected: 8,
  screen_name: 'THEMEPARKSHARK',
  token: '',
  total_experience: 2614,
  username: 'themeparkshark',
  verified_at: '',
  visited_parks_count: 1,
  title: 'Churro Collection Scout',
};

export default function ProfilePreviewScreen() {
  const auth = useContext(AuthContext);
  return (
    <AuthContext.Provider value={{ ...auth, player: previewPlayer, isReady: true }}>
      <ProfileScreen />
    </AuthContext.Provider>
  );
}
