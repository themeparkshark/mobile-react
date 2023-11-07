import { createContext, Dispatch, FC, ReactNode, useState } from 'react';

export interface CrumbContextType {
  readonly crumbs?: CrumbsType;
  readonly setCrumbs: Dispatch<CrumbsType>;
  readonly crumbsLoaded: boolean;
}

export const CrumbContext = createContext<CrumbContextType>(
  {} as CrumbContextType
);

export const CrumbProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [crumbs, setCrumbs] = useState<CrumbsType>();

  return (
    <CrumbContext.Provider
      value={{
        crumbs,
        setCrumbs,
        crumbsLoaded: !!crumbs,
      }}
    >
      {children}
    </CrumbContext.Provider>
  );
};
