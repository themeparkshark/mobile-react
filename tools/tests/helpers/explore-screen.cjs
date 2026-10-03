'use strict';
/**
 * Shallow-renders ExploreScreen (or another Explore module) with every import
 * stubbed. Child components are not rendered: they appear in the tree as their
 * stub function, so tests match on props (accessibilityLabel, ticket, ...).
 *
 * exploreScreen({ contexts, modules, trip, route }) returns the runtime from
 * reward-hook-runtime.cjs plus `navigation` calls.
 */
const { runtime } = require('./reward-hook-runtime.cjs');
const { loadTs } = require('./ts-module.cjs');
// Pure presentation modules run for real so the screen's rules are exercised.
const markers = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');
const adventure = loadTs('src/screens/ExploreScreen/adventureTicketPresentation.ts');
const timing = loadTs('src/screens/ExploreScreen/mapOpportunityTiming.ts');
const queue = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
const chestPresence = loadTs('src/screens/ExploreScreen/dailyChestPresence.ts');
const statusStack = loadTs('src/components/map/statusStack.ts');
const parkMapLayout = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');
const declutterStore = loadTs('src/components/map/declutter/store.ts');
const frightGeo = loadTs('src/components/map/fright/geo.ts');

// Modules the runtime implements itself; the stub proxy must not shadow them.
const RUNTIME_OWNED = new Set(['react', 'react/jsx-runtime', 'react-native', 'react-native-reanimated',
  'expo-image', 'expo-linear-gradient', 'react-native-safe-area-context', 'expo-haptics']);

function component(name) {
  const fn = function StubComponent() { return null; };
  Object.defineProperty(fn, 'name', { value: String(name) });
  return fn;
}

/** Any named export: contexts carry {value}, hooks return {}, components are functions. */
function stubModule(specifier, overrides = {}) {
  const base = specifier.split('/').pop();
  return new Proxy(overrides, {
    get(target, key) {
      if (Object.hasOwn(target, key)) return target[key];
      if (key === '__esModule') return true;
      if (typeof key !== 'string') return undefined;
      if (key === 'default') return /^use[A-Z]/.test(base) ? () => ({}) : component(base);
      if (/Context$/.test(key)) return { value: {} };
      if (/^use[A-Z]/.test(key)) return () => ({});
      if (/^[A-Z]/.test(key)) return component(key);
      return () => undefined;
    },
  });
}

exports.stubModule = stubModule;

exports.exploreScreen = function exploreScreen(options = {}) {
  const navigation = [];
  let loaded = false;
  const contexts = {
    auth: { player: { id: 5, tickets: 3, energy: 40, username: 'finn' }, refreshPlayer: async () => undefined },
    location: { parkLoaded: true, parkLookupRecord: null, location: { latitude: 34.1381, longitude: -118.3534 },
      park: { id: 1, name: 'Test Park', stores: [], coin_url: '' }, permissionGranted: true, permissionChecked: true },
    theme: { theme: null }, currency: { currencies: [] }, dailyGift: { dailyGift: null },
    ...options.contexts,
  };
  const nav = { navigate: (...args) => navigation.push(args), setParams: () => undefined };
  const modules = {
    '@react-navigation/native': { useIsFocused: () => true, useNavigation: () => nav,
      useRoute: () => ({ params: options.route ?? {} }), useFocusEffect: () => undefined },
    'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined },
    dayjs: { default: Object.assign(() => ({ format: () => '2026-09-30' }), { extend: () => undefined }) },
    'dayjs/plugin/isBetween': {},
    '../context/AuthProvider': { AuthContext: { value: contexts.auth } },
    '../context/LocationProvider': { LocationContext: { value: contexts.location } },
    '../context/ThemeProvider': { ThemeContext: { value: contexts.theme } },
    '../context/CurrencyProvider': { CurrencyContext: { value: contexts.currency } },
    '../context/DailyGiftProvider': { DailyGiftContext: { value: contexts.dailyGift } },
    '../context/parkLookupPolicy': { isConfirmedOutsidePark: () => false, isHomeMapConfirmed: () => false, nextHomeAnchor: () => null },
    '../hooks/useTripGoal': { default: () => ({ data: options.trip ?? null, stale: false, refresh: async () => undefined,
      choose: async () => null, celebrate: async () => null, select: async () => null, dismiss: async () => undefined }) },
    // The real clock loads the map's opportunities on mount; the stub does it once.
    '../hooks/useMapOpportunityClock': { default: (_items, refresh, enabled) => {
      if (enabled && !loaded) { loaded = true; void refresh(); }
      return Date.parse('2026-09-30T18:00:00Z');
    } },
    './ExploreScreen/mapOpportunityTiming': { ...timing, opportunityIsActive: () => true },
    './ExploreScreen/mapMarkerPresentation': markers,
    './ExploreScreen/adventureTicketPresentation': adventure,
    './ExploreScreen/mapPresentationQueue': queue,
    './ExploreScreen/dailyChestPresence': chestPresence,
    '../components/map/statusStack': statusStack,
    './ExploreScreen/parkMapLayout': parkMapLayout,
    '../components/map/declutter/store': declutterStore,
    '../components/map/fright/geo': frightGeo,
    './ExploreScreen/ws2Profiler': { withWs2Profiler: component => component },
    './ExploreScreen/useQueueDwell': { default: () => options.queueDwell ?? null },
    '../components/Tutorial': { useTutorial: () => ({ startTutorial: () => undefined, hasCompleted: () => true, isReady: true, isActive: false }) },
    '../components/boss/BossRaidFlow': { default: component('BossRaidFlow'), useParkRaid: () => ({ raid: null, setState: () => undefined }) },
    '../hooks/useBossMapMoment': { default: () => ({ moment: null, flag: null, enqueue: async () => undefined, dismiss: () => undefined, finishExit: () => undefined }) },
    '../hooks/useBossAttackRecovery': { default: () => ({ snapshot: null }) },
    '../hooks/useRideControlMap': { default: () => ({ control: null, refresh: async () => undefined }) },
    '../api/endpoints/parks/live': { getParkLive: () => new Promise(() => undefined) },
    '../api/endpoints/community-center/getCommunityCenter': { default: () => new Promise(() => undefined) },
    '../api/endpoints/gym-battle': { getGym: () => new Promise(() => undefined), getSwords: () => new Promise(() => undefined),
      getMyTeam: () => new Promise(() => undefined), getMySwords: () => new Promise(() => undefined), claimSword: async () => undefined },
    '../api/endpoints/me/current-redeemables': { default: async () => options.redeemables ?? { tasks: [], coins: [], keys: [], redeemables: [], items: [], pins: [], vaults: [] } },
    '../helpers/check-for-redeemable': { default: async () => undefined },
    '../services/lineplay/resolveRide': { resolveMapQueueContext: async () => options.queueRide ?? null },
    '../services/rideLandmark': { rideLook: () => ({ ambience: [] }) },
    '../helpers/currency-balance': { default: () => 0 },
    ...options.modules,
  };
  const imports = new Proxy(modules, {
    getOwnPropertyDescriptor(target, key) {
      if (typeof key !== 'string' || RUNTIME_OWNED.has(key)) return undefined;
      if (!Object.hasOwn(target, key)) target[key] = stubModule(key);
      return { value: target[key], writable: true, enumerable: true, configurable: true };
    },
  });
  const app = runtime(options.file ?? 'src/screens/ExploreScreen.tsx', imports, options.props ?? {},
    { setInterval: () => 0, clearInterval: () => undefined, Promise, ...options.globals });
  return Object.assign(app, { navigation, contexts });
};
