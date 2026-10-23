import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import Wrapper from '../../components/Wrapper';

/**
 * The app's own chrome for every Ride Tracker page: the water header with its wave edge and
 * the red back button (it sits under the Dynamic Island inset), plus the 5-icon footer.
 * Replaces the old web-style sky-to-navy gradient headers, so the tracker looks like the
 * rest of the game (Settings, Ride Journal, the Ride Tracker hub).
 */
export default function RideTrackerFrame({ title, style, children }: {
  readonly title: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>{title}</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </Wrapper>
  );
}
