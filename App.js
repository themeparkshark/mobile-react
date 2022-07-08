import React from 'react';
import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { ThemeProvider } from './src/context/ThemeProvider';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </AuthProvider>
  );
}
