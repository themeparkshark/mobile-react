import { createContext, FC, ReactNode, useState } from 'react';
import getCurrentTheme from '../api/endpoints/current-theme/get';
import { ThemeType } from '../models/theme-type';

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
