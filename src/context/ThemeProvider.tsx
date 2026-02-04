import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import getCurrentTheme from '../api/endpoints/current-theme/get';
import { ThemeType } from '../models/theme-type';
import { MusicContext } from './MusicProvider';

export interface ThemeContextType {
  readonly retrieveTheme: () => void;
  readonly theme: ThemeType | undefined;
  readonly themeLoaded: boolean;
}

export const ThemeContext = createContext<ThemeContextType>(
  {} as ThemeContextType
);

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>();
  const [themeLoaded, setThemeLoaded] = useState<boolean>(false);
  const { initializeTracks } = useContext(MusicContext);

  useEffect(() => {
    if (!themeLoaded || !theme?.tracks.length) {
      return;
    }

    initializeTracks(theme?.tracks.map((track) => track.track_url) ?? []);
  }, [themeLoaded, theme]);

  useEffect(() => {
    console.log('🦈 Theme updated:', theme ? 'loaded' : 'not loaded');
    setThemeLoaded(Boolean(theme));
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        retrieveTheme: async () => {
          setTheme(await getCurrentTheme());
        },
        themeLoaded,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
