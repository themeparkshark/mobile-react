import useCrumbs from '../hooks/useCrumbs';
import SharkLoader, { type SharkLoaderProps } from '../ui/SharkLoader';
import { stripIconTokens } from '../ui/iconTokens';

/**
 * Screen loading state. Now the branded SharkLoader (WS0).
 *
 * With no props it behaves like before: a centred loader that fills the space,
 * and once the load runs slow it shows the CMS copy `labels.slow_connectivity`
 * (falling back to SharkLoader's own line when the crumb is missing). Pass
 * `state="error"` with `onRetry` when a request fails and `state="empty"` when
 * it returns nothing, so no screen spins forever (P0-9). Passing `onRetry`
 * while loading also offers "Try again" once the load runs slow.
 */
export default function Loading(props: SharkLoaderProps) {
  const { labels } = useCrumbs();
  const crumb = typeof labels.slow_connectivity === 'string' ? stripIconTokens(labels.slow_connectivity) : '';
  const loading = (props.state ?? 'loading') === 'loading';
  return <SharkLoader {...props} message={props.message ?? (loading && crumb ? crumb : undefined)} />;
}

export type LoadingProps = SharkLoaderProps;
