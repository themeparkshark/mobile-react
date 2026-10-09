import { useContext, useEffect, useState } from 'react';
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
  // The undo capture shows the profile right after Remove (no title).
  title: process.env.EXPO_PUBLIC_PROFILE_PREVIEW_TITLE_SHEET === 'undo' ? null : 'Churro Finder',
};

// EXPO_PUBLIC_XP_DEMO=1: XP gains every 2.6 s on a loop, a level up every third or fourth gain, for captures.
const XP_DEMO_STEP_MS = 2600;
const neededFor = (level: number) => 1000 + level * 400;

export default function ProfilePreviewScreen() {
  const auth = useContext(AuthContext);
  const [player, setPlayer] = useState(previewPlayer);
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_XP_DEMO !== '1') return undefined;
    const timer = setInterval(() => setPlayer((current) => {
      const level = current.experience_level.level;
      const needed = current.experience_level.experience;
      const next = (current.experience ?? 0) + Math.round(needed * 0.3);
      return next < needed
        ? { ...current, experience: next }
        : { ...current, experience: next - needed, experience_level: { id: level + 1, level: level + 1, experience: neededFor(level + 1) } };
    }), XP_DEMO_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <AuthContext.Provider value={{ ...auth, player, isReady: true }}>
      <ProfileScreen />
    </AuthContext.Provider>
  );
}
