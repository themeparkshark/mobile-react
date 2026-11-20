import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import LookScreen, { LookBackButton } from '../../ui/sticker/LookScreen';

/**
 * The app's own chrome for every Ride Tracker page (on LookScreen since step 2a): the water header with its wave edge and
 * the red back button (it sits under the Dynamic Island inset), plus the 5-icon footer.
 * Replaces the old web-style sky-to-navy gradient headers, so the tracker looks like the
 * rest of the game (Settings, Ride Journal, the Ride Tracker hub).
 */
export default function RideTrackerFrame({ title, right, style, children }: {
  readonly title: string;
  /** One small button on the right of the header (for example the Ride Detail favorite star). */
  readonly right?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  return (
    <LookScreen footer header={{ left: <LookBackButton />, title, right }}>
      {pad => <View style={[pad.sticker ? { flex: 1, marginTop: pad.top } : { flex: 1 }, style]}>{children}</View>}
    </LookScreen>
  );
}
