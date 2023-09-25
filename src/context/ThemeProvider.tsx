import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { ThemeType } from '../models/theme-type';

export interface ThemeContextType {
  readonly theme: ThemeType | undefined;
  readonly setTheme: (theme: ThemeType | undefined) => void;
  readonly themeLoaded: boolean;
}

export const ThemeContext = createContext<ThemeContextType>(
  {} as ThemeContextType
);

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType | undefined>();
  const [themeLoaded, setThemeLoaded] = useState<boolean>(false);

  useEffect(() => {
    setThemeLoaded(!!theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        themeLoaded,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
