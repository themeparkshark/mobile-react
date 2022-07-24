import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { SafeAreaView } from 'react-native';

export default function PinCollectionsScreen() {
  return (
    <Wrapper showBar={false}>
      <Topbar text="Pin Packs" showBackBar={true} />
      <SafeAreaView>

      </SafeAreaView>
    </Wrapper>
  );
};
