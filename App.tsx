import React from 'react';
import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';

export default function App() {
  return (
    <AuthProvider>
      <SoundEffectProvider>
        <Root />
      </SoundEffectProvider>
    </AuthProvider>
  );
}
