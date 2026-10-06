/** An optional, self-reported group activity. It never mints server rewards. */
export interface CrewGridSquare {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
}

const SQUARES: readonly CrewGridSquare[] = [
  { id: 'color', title: 'Color clue', prompt: 'Name two colors you can see from your place. Give them a shark crew meaning.' },
  { id: 'shape', title: 'Shape hunt', prompt: 'Find a shape nearby, or imagine one if the queue is plain. What could it mean on a treasure map?' },
  { id: 'sound', title: 'Sound signal', prompt: 'Listen for a sound without moving closer. Copy its rhythm, or invent one if it is quiet.' },
  { id: 'name', title: 'Crew name', prompt: 'Give your shark crew a name. Solo players can name their own expedition.' },
  { id: 'memory', title: 'Memory test', prompt: 'Remember three details from where you stand. Look away and recall them in order.' },
  { id: 'captain', title: 'Choose a captain', prompt: 'Which shark role fits you: navigator, lookout, or inventor? Give one reason.' },
  { id: 'prediction', title: 'Ride theory', prompt: 'Predict one thing you will remember about this ride. Check your theory afterward.' },
  { id: 'three-words', title: 'Three words', prompt: 'Describe the mood of this queue in three words. Ask a crewmate, or compare with your own answer later.' },
  { id: 'pattern', title: 'Pattern maker', prompt: 'Notice a repeated shape, color, or sound from your place. If none appears, invent a three-step shark signal.' },
  { id: 'vote', title: 'Crew vote', prompt: 'Vote on your next park adventure. Playing alone? Pick your own.' },
  { id: 'story', title: 'Tiny tale', prompt: 'Tell a ten-second shark story. Use something you see or something you imagine.' },
  { id: 'symbol', title: 'Shark symbol', prompt: 'Choose one symbol for your crew: fin, wave, star, or compass. Why that one?' },
  { id: 'question', title: 'Ask the crew', prompt: 'Ask what someone hopes to remember today. Solo? Write the answer in your head and check after the ride.' },
  { id: 'direction', title: 'Secret route', prompt: 'Make up a two-step path for your shark. Where does it go first? What clue sends it on?' },
  { id: 'snack', title: 'Snack debate', prompt: 'Which park snack would power a shark adventure? Give it a silly superpower.' },
  { id: 'pose', title: 'Fin pose', prompt: 'Make a tiny, seated or standing fin gesture without bumping anyone. Give it a crew name.' },
];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function buildCrewGrid(rideName: string, chapterTitle: string, seed: number): readonly CrewGridSquare[] {
  const order = [...SQUARES];
  let state = (seed >>> 0) || 1;
  for (let index = order.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const selected = order.slice(0, 9);
  selected[4] = {
    id: 'story-clue', title: 'Story clue',
    prompt: `Give your crew one new theory about “${chapterTitle}” while waiting for ${rideName}. Solo theories count too.`,
  };
  return selected;
}

export function crewGridHasLine(marks: readonly number[]): boolean {
  const marked = new Set(marks);
  return LINES.some(line => line.every(index => marked.has(index)));
}
