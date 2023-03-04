import { useContext } from 'react';
import { CrumbContext } from '../context/CrumbProvider';

export default function useCrumbs() {
  const { crumbs } = useContext(CrumbContext);

  return {
    errors: crumbs.errors,
    messages: crumbs.messages,
    prompts: crumbs.prompts,
    warnings: crumbs.warnings,
  };
}
