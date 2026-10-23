/**
 * Home arcade: the queue games, playable anywhere with no location and no
 * sign-in. Practice only: nothing here pays coins or Parts, so it can never
 * stand in for a park visit. Used when a player says "Not now" to location
 * and by guests after Finn's first taste.
 */
import { useRef, useState } from 'react';
import MiniGameSelector from './MiniGameSelector';
import QueueArcadeSheet, { type QueueArcadeChoice } from '../screens/LinePlay/components/QueueArcadeSheet';

export type HomeArcadeGame = 'tap' | 'memory' | 'trivia' | 'shark' | 'banana' | 'timing';

export const HOME_ARCADE_GAMES: readonly { readonly id: HomeArcadeGame; readonly title: string }[] = [
  { id: 'tap', title: 'Whack-a-Shark' },
  { id: 'memory', title: 'Memory Match' },
  { id: 'trivia', title: 'Park Trivia' },
  { id: 'shark', title: 'Sharky Swim' },
  { id: 'banana', title: 'Banana Basket' },
  { id: 'timing', title: 'Parade Beat' },
];

export const HOME_ARCADE_COPY = {
  kicker: 'PLAY ANYWHERE',
  title: 'HOME ARCADE',
  intro: 'Pick a game. Play as much as you like!',
  note: 'Just for fun. Win ride coins at the park.',
} as const;

export default function HomeArcade({ visible, onClose }: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const [game, setGame] = useState<HomeArcadeGame | null>(null);
  // iOS cannot show the game's screen while the sheet is still sliding away:
  // the pick waits for the sheet's hide, as in the queue arcade.
  const [picked, setPicked] = useState<HomeArcadeGame | null>(null);
  const pending = useRef<HomeArcadeGame | null>(null);
  const choices: QueueArcadeChoice[] = HOME_ARCADE_GAMES.map((entry, index) => ({
    id: `home-${entry.id}`, title: entry.title, gameId: entry.id, index, completed: false,
  }));
  // A finished or closed game goes back to the arcade, never straight out.
  const finish = () => setGame(null);
  const choose = (index: number) => {
    const next = HOME_ARCADE_GAMES[index]?.id ?? null;
    if (!next || pending.current) return;
    pending.current = next; setPicked(next);
  };
  const hidden = () => {
    const next = pending.current;
    pending.current = null; setPicked(null);
    if (next) setGame(next);
  };
  return <>
    <QueueArcadeSheet visible={visible && game == null && picked == null} choices={choices}
      kicker={HOME_ARCADE_COPY.kicker} title={HOME_ARCADE_COPY.title} intro={HOME_ARCADE_COPY.intro}
      note={HOME_ARCADE_COPY.note} showNew={false}
      onChoose={choose} onClose={onClose} onHidden={hidden} />
    {game != null && <MiniGameSelector visible taskId={0} taskName="Home Arcade" preferredGame={game}
      isPractice rewardMode="legacy" onClose={finish} onComplete={finish} />}
  </>;
}
