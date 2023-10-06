import { createContext, FC, ReactNode, useState } from 'react';
import { ThemeType } from '../models/theme-type';

export interface ThemeContextType {
  readonly theme: ThemeType | undefined;
  readonly setTheme: (theme: ThemeType | undefined) => void;
}

export const ThemeContext = createContext<ThemeContextType>(
  {} as ThemeContextType
);

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType | undefined>();

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
