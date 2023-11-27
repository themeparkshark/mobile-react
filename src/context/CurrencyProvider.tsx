import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import getCurrencies from '../api/endpoints/currencies/all';
import { CurrencyType } from '../models/currency-type';

export interface CurrencyContextType {
  readonly currencies: CurrencyType[];
  readonly currenciesLoaded: boolean;
  readonly retrieveCurrencies: () => void;
}

export const CurrencyContext = createContext<CurrencyContextType>(
  {} as CurrencyContextType
);

export const CurrencyProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currencies, setCurrencies] = useState<CurrencyType[]>([]);
  const [currenciesLoaded, setCurrenciesLoaded] = useState<boolean>(false);

  useEffect(() => {
    setCurrenciesLoaded(Boolean(currencies.length));
  }, [currencies]);

  const retrieveCurrencies = async () => {
    setCurrencies(await getCurrencies());
  };

  return (
    <CurrencyContext.Provider
      value={{
        currencies,
        currenciesLoaded,
        retrieveCurrencies,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};
