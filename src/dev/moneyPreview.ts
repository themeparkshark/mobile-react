/**
 * Dev-only deep links, so captures switch money screens without a rebundle:
 *   xcrun simctl openurl <sim> "themeparkshark://dev-money/supplies"
 *   .../dev-money/vip  .../dev-money/topup  .../dev-money/store
 * Never installed outside __DEV__.
 */
export function installMoneyDevLinks(go: (screen: string, query: Record<string, string>) => void): () => void {
  if (!__DEV__) return () => undefined;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Linking } = require('react-native') as typeof import('react-native');
  const handle = ({ url }: { url: string }) => {
    const match = url.match(/dev-money\/([a-z-]+)(?:\?(.*))?$/);
    if (!match) return;
    const query = Object.fromEntries((match[2] ?? '').split('&').filter(Boolean).map(kv => kv.split('=').map(decodeURIComponent) as [string, string]));
    go(match[1], query);
  };
  const sub = Linking.addEventListener('url', handle);
  return () => sub.remove();
}
