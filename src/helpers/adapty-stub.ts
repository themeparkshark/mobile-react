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
  activate: async (_key: string, _options?: { customerUserId?: string }) => {},
  identify: async () => {},
  getProfile: async () => ({ accessLevels: {} }),
  getPaywall: async (_id: string) => ({ products: [] }),
  getPaywallProducts: async (_paywall: { products: unknown[] }): Promise<AdaptyPaywallProduct[]> => [],
  makePurchase: async (_product: AdaptyPaywallProduct) => ({ profile: { accessLevels: {} } }),
  restorePurchases: async () => ({ profile: { accessLevels: {} } }),
  logShowPaywall: () => {},
};

export default adapty;
