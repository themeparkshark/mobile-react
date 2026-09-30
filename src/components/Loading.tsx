import SharkLoader, { type SharkLoaderProps } from '../ui/SharkLoader';

/**
 * Screen loading state. Now the branded SharkLoader (WS0).
 *
 * With no props it behaves like before: a centred loader that fills the space.
 * Pass `state="error"` with `onRetry` when a request fails and `state="empty"`
 * when it returns nothing, so no screen spins forever (P0-9). Passing `onRetry`
 * while loading also offers "Try again" once the load runs slow.
 */
export default function Loading(props: SharkLoaderProps) {
  return <SharkLoader {...props} />;
}

export type LoadingProps = SharkLoaderProps;
