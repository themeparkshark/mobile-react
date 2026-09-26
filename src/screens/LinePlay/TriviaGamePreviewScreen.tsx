/** Development-only visual check for the offline five-question queue round. */
import { useMemo, useState } from 'react';
import { TriviaGame, createLinePlayTriviaSource } from '../../games/trivia';

export default function TriviaGamePreviewScreen() {
  const [run, setRun] = useState(0);
  const source = useMemo(() => createLinePlayTriviaSource({ parkId: 8, seed: 0 }), [run]);
  return (
    <TriviaGame key={run} visible seed={0} title="Line Trivia" source={source}
      readableFacts onClose={() => setRun(value => value + 1)}
      onComplete={() => setRun(value => value + 1)} />
  );
}
