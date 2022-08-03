import React from 'react';
import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { ThemeProvider } from './src/context/ThemeProvider';
import { RootSiblingParent } from 'react-native-root-siblings';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootSiblingParent>
          <Root />
        </RootSiblingParent>
      </ThemeProvider>
    </AuthProvider>
  );
}
