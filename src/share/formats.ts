/** Card formats: design size in points and export size in pixels. Pure. */
import type { FlexFormat } from './types';

export const FLEX_SIZE: Readonly<Record<FlexFormat, { readonly width: number; readonly height: number }>> = {
  story: { width: 360, height: 640 },
  square: { width: 360, height: 360 },
};

export const FLEX_EXPORT: Readonly<Record<FlexFormat, { readonly width: number; readonly height: number }>> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
