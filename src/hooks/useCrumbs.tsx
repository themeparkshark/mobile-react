import { useContext } from 'react';
import { CrumbContext } from '../context/CrumbProvider';

export default function useCrumbs() {
  const { crumbs } = useContext(CrumbContext);

  return {
    prompts: crumbs.prompts,
  };
}
