import { useContext, useState } from 'react';
import { useIntervalWhen } from 'rooks';
import { vsprintf } from 'sprintf-js';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';
import WarningMessage from './WarningMessage';

export default function NotAtPark() {
  const [seconds, setSeconds] = useState<number>(5);
  const { labels, warnings } = useCrumbs();
  const { player } = useContext(AuthContext);

  useIntervalWhen(
    () => {
      if (seconds === 1) {
        setSeconds(5);
      } else {
        setSeconds(seconds - 1);
      }
    },
    1000,
    Boolean(!!seconds && player)
  );

  return (
    <WarningMessage
      title={warnings.not_at_a_park}
      message={vsprintf(labels.checking_again, [
        seconds,
        `second${seconds === 1 ? '' : 's'}`,
      ])}
    />
  );
}
