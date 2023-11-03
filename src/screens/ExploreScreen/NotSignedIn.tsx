import { View } from 'react-native';
import SignInButtons from '../../components/SignInButtons';
import useCrumbs from '../../hooks/useCrumbs';
import WarningMessage from './WarningMessage';

export default function NotSignedIn() {
  const { warnings } = useCrumbs();

  return (
    <WarningMessage
      title={warnings.not_signed_in}
      message={warnings.must_be_signed_in}
    >
      <View
        style={{
          marginTop: 32,
          width: '75%',
        }}
      >
        <SignInButtons />
      </View>
    </WarningMessage>
  );
}
