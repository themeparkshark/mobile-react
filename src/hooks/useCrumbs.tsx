import { useContext } from 'react';
import { CrumbContext } from '../context/CrumbProvider';

export default function useCrumbs() {
  const { crumbs } = useContext(CrumbContext);

  return {
    errors: crumbs?.errors ?? ({} as CrumbsType['errors']),
    labels: crumbs?.labels ?? ({} as CrumbsType['labels']),
    messages: crumbs?.messages ?? ({} as CrumbsType['messages']),
    prompts: crumbs?.prompts ?? ({} as CrumbsType['prompts']),
    urls: crumbs?.urls ?? ({} as CrumbsType['urls']),
    warnings: crumbs?.warnings ?? ({} as CrumbsType['warnings']),
  };
}
