import { Linking, View } from 'react-native';
import YellowButton from '../../components/YellowButton';
import useCrumbs from '../../hooks/useCrumbs';
import WarningMessage from './WarningMessage';

export default function PermissionsNotGranted() {
  const { warnings } = useCrumbs();

  return (
    <WarningMessage
      title={warnings.no_permissions_granted}
      message={warnings.must_grant_permissions}
    >
      <View
        style={{
          marginTop: 32,
          width: '75%',
        }}
      >
        <YellowButton
          onPress={() => Linking.openURL('app-settings:')}
          text="Open Settings"
        />
      </View>
    </WarningMessage>
  );
}
