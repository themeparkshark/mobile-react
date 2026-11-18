import useCrumbs from '../hooks/useCrumbs';
import SharkLoader, { type SharkLoaderProps } from '../ui/SharkLoader';
import { stripIconTokens } from '../ui/iconTokens';
import { isOffline } from '../services/connectivity';
import { SLOW_LOADING_LINE } from '../services/connectionCopy';

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
  // T172: the CMS line blames the player's internet, so it shows only while the app really is offline;
  // a slow server says the game is slow right now.
  const slowLine = isOffline() && crumb ? crumb : SLOW_LOADING_LINE;
  return <SharkLoader {...props} message={props.message ?? (loading ? slowLine : undefined)} />;
}

export type LoadingProps = SharkLoaderProps;
