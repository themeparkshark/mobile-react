import { FC, ReactNode, createContext, useState } from 'react';
import { ThemeType } from '../models/theme-type';

export interface ThemeContextType {
  theme: ThemeType;
  setTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>(
  {} as ThemeContextType
);

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState();

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
