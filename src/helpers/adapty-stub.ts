// Stub for react-native-adapty when running in Expo Go
// Original package.json saved as package.json.full-native

export interface AdaptyPaywallProduct {
  vendorProductId: string;
  localizedTitle: string;
  localizedDescription: string;
  localizedPrice: string;
  price: number;
  currencyCode: string;
  currencySymbol: string;
}

export const adapty = {
  activate: async () => {},
  identify: async () => {},
  getProfile: async () => ({ accessLevels: {} }),
  getPaywall: async () => ({ products: [] }),
  getPaywallProducts: async (): Promise<AdaptyPaywallProduct[]> => [],
  makePurchase: async () => ({ profile: { accessLevels: {} } }),
  restorePurchases: async () => ({ profile: { accessLevels: {} } }),
  logShowPaywall: () => {},
};

export default adapty;
