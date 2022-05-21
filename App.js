import React from 'react';
import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
