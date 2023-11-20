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
  const [theme, setTheme] = useState<ThemeType | undefined>();
  const [themeLoaded, setThemeLoaded] = useState<boolean>(false);
  const { initializeTracks } = useContext(MusicContext);

  useEffect(() => {
    if (!themeLoaded) {
      return;
    }

    if (theme) {
      initializeTracks(theme.tracks.map((track) => track.url));
      return;
    }
  }, [themeLoaded, theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        retrieveTheme: async () => {
          try {
            setTheme(await getCurrentTheme());
            setThemeLoaded(true);
          } catch (error) {
            setThemeLoaded(true);
          }
        },
        themeLoaded,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
