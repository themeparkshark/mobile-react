import React from 'react';
import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import { MusicProvider } from './src/context/MusicProvider';
import {
  Pusher,
  PusherMember,
  PusherChannel,
  PusherEvent,
} from '@pusher/pusher-websocket-react-native';

export default function App() {
  const pusher = Pusher.getInstance();

  (async() => {
    await pusher.init({
      apiKey: "fa6a1b978c66821f97dc",
      cluster: "mt1"
    });

    console.log('test');

    await pusher.connect();
    await pusher.subscribe({
      channelName: 'private-App.Models.User.3',
      onEvent: (event: PusherEvent) => {
        console.log(`Event received: ${event}`);
      }
    });
  })();
  return (
    <AuthProvider>
      <SoundEffectProvider>
        <MusicProvider>
          <Root />
        </MusicProvider>
      </SoundEffectProvider>
    </AuthProvider>
  );
}
