import { useState } from 'react';
import { View } from 'react-native';
import SpotlightOverlay from '../components/Tutorial/SpotlightOverlay';
import TeacherShark from '../components/Tutorial/TeacherShark';
import { getStepsForSequence } from '../components/Tutorial/steps';
import ParkChecklistPreviewScreen from './ParkChecklistPreviewScreen';

/** Dev-only visual review of Finn's first park-visit handoff. */
export default function ParkArrivalPreviewScreen() {
  const steps = getStepsForSequence('park_arrival');
  const [index, setIndex] = useState(
    __DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_STEP === '2' ? 1 : 0);
  const step = steps[index];
  const next = () => setIndex(current => (current + 1) % steps.length);

  return <View style={{ flex: 1 }}>
    <ParkChecklistPreviewScreen />
    <SpotlightOverlay target={null} opacity={0.62} onPress={next} />
    <TeacherShark text={step.text} subtitle={step.subtitle} mood={step.sharkMood}
      position={step.sharkPosition} nextText={step.nextText}
      showSkip={step.showSkip} stepIndex={index} totalSteps={steps.length}
      onNext={next} onSkip={next} bottomOffset={120} />
  </View>;
}
