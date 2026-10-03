/** Route "FrightTutorial" (transparent modal): the 5 cards, replayable from anywhere. */
import { useNavigation, useRoute } from '@react-navigation/native';
import { View } from 'react-native';
import { frightArt } from '../../../services/fright/art';
import { FRIGHT_MODE_NAME } from '../../../services/fright/config';
import { getFrightSnapshot } from '../../../services/fright/store';
import FrightTutorial from './FrightTutorial';

export default function FrightTutorialScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const title = (route.params as { title?: string } | undefined)?.title ?? getFrightSnapshot().title ?? FRIGHT_MODE_NAME;
  return (
    <View style={{ flex: 1 }}>
      <FrightTutorial mode="replay" title={title} spooky={!getFrightSnapshot().calm} hero={frightArt().tutorial}
        onDone={() => { if (navigation.canGoBack()) navigation.goBack(); }} />
    </View>
  );
}
