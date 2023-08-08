import { useContext } from 'react';
import { CrumbContext } from '../context/CrumbProvider';

export default function useCrumbs() {
  const { crumbs } = useContext(CrumbContext);

  return {
    errors: crumbs.errors,
    labels: crumbs.labels,
    messages: crumbs.messages,
    prompts: crumbs.prompts,
    urls: crumbs.urls,
    warnings: crumbs.warnings,
  };
}
