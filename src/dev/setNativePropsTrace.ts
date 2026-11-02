/**
 * Lane tooling only (EXPO_PUBLIC_SNP_TRACE=1, never set for a store or OTA bundle): counts every JS
 * setNativeProps call by the props it sets, in dev and in release-like JS.
 *
 * Why it exists: on this React Native and Reanimated, a JS setNativeProps while Reanimated commits on
 * the UI thread is a data race on ShadowNodeFamily.nativeProps_DEPRECATED, and it crashed Whack under
 * fast taps (core loop fix round, November 2026). Play must keep this count at 0.
 *   lane.sh <lane> eval 'globalThis.__tpsSnp.read()'    and    globalThis.__tpsSnp.reset()
 */
if (process.env.EXPO_PUBLIC_SNP_TRACE === '1') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Host = require('react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactFabricHostComponent').default;
  const original = Host.prototype.setNativeProps;
  let total = 0;
  let byKeys: Record<string, number> = {};
  Host.prototype.setNativeProps = function traced(props: Record<string, unknown>) {
    total += 1;
    const style = (props as { style?: Record<string, unknown> } | null)?.style;
    let owner = '';
    if (__DEV__) {
      const names: string[] = [];
      let fiber = (this as { __internalInstanceHandle?: { _debugOwner?: unknown } }).__internalInstanceHandle?._debugOwner as
        { type?: { name?: string; displayName?: string }; _debugOwner?: unknown } | undefined;
      for (let i = 0; fiber && i < 4; i += 1) {
        const name = fiber.type?.displayName ?? fiber.type?.name;
        if (name) names.push(name);
        fiber = fiber._debugOwner as typeof fiber;
      }
      owner = ` @${names.join('<')}`;
    }
    const key = Object.keys(props ?? {}).sort().join(',') + (style ? `{${Object.keys(style).sort().join(',')}}` : '') + owner;
    byKeys[key] = (byKeys[key] ?? 0) + 1;
    return original.call(this, props);
  };
  (globalThis as { __tpsSnp?: unknown }).__tpsSnp = {
    read: () => ({ total, byKeys }),
    reset: () => { total = 0; byKeys = {}; },
  };
  let last = 0;
  setInterval(() => {
    if (total !== last) { last = total; console.log(`[snp] total ${total} ${JSON.stringify(byKeys)}`); }
  }, 5000);
}
export {};
