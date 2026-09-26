/** Personality questions for "help me choose" (3 are drawn at random). */
export type QuizTeam = 'mouse' | 'globe' | 'shark';
type Team = QuizTeam;

export const QUESTION_BANK: { text: string; answers: { text: string; team: Team; points: number }[] }[] = [
  {
    text: "You're at a theme park.\nWhat do you do first?",
    answers: [
      { text: 'Find the newest ride and sprint there', team: 'globe' as Team, points: 2 },
      { text: 'Grab a map and plan the perfect route', team: 'mouse' as Team, points: 2 },
      { text: 'Follow the crowd and see what happens', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "Your friend is scared\nof a ride. You...",
    answers: [
      { text: 'Drag them on anyway, they\'ll love it', team: 'globe' as Team, points: 2 },
      { text: 'Show them the safety stats to calm them down', team: 'mouse' as Team, points: 2 },
      { text: 'Ride it yourself and tell them how great it was', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Pick a park snack.',
    answers: [
      { text: 'Turkey leg - go big or go home', team: 'globe' as Team, points: 2 },
      { text: 'Dole Whip - a classic for a reason', team: 'mouse' as Team, points: 2 },
      { text: 'Whatever looks good right now', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "The park is closing in\n30 minutes. You...",
    answers: [
      { text: 'Run to re-ride your favorite one more time', team: 'globe' as Team, points: 2 },
      { text: 'Head to the exit early to beat the crowd', team: 'mouse' as Team, points: 2 },
      { text: 'Stay for the fireworks, obviously', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Your ideal park day\nweather is...',
    answers: [
      { text: 'Hot and sunny - bring on the energy', team: 'globe' as Team, points: 2 },
      { text: 'Cool and overcast - shorter lines', team: 'mouse' as Team, points: 2 },
      { text: 'Light rain - thins the crowd out', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You see a ride with\na 90-minute wait.',
    answers: [
      { text: 'Get in line. Worth it.', team: 'globe' as Team, points: 2 },
      { text: 'Check the app for a better time later', team: 'mouse' as Team, points: 2 },
      { text: 'Skip it and find a walk-on', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "What's your ride\nstyle?",
    answers: [
      { text: 'The faster and wilder the better', team: 'globe' as Team, points: 2 },
      { text: 'Dark rides with incredible theming', team: 'mouse' as Team, points: 2 },
      { text: 'A little bit of everything', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'A new land just opened.\nYou...',
    answers: [
      { text: 'Were there on opening day, obviously', team: 'globe' as Team, points: 2 },
      { text: 'Wait a month for the crowds to die down', team: 'mouse' as Team, points: 2 },
      { text: 'Go when a friend invites you', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You can only bring one\nthing to the park.',
    answers: [
      { text: 'Portable charger - gotta stay connected', team: 'globe' as Team, points: 2 },
      { text: 'Sunscreen - prepared for everything', team: 'mouse' as Team, points: 2 },
      { text: 'Good vibes - that\'s all you need', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Your group can\'t agree\non what to do next.',
    answers: [
      { text: 'Take charge and pick something', team: 'globe' as Team, points: 2 },
      { text: 'Pull up wait times and find the best option', team: 'mouse' as Team, points: 2 },
      { text: 'Suggest splitting up and meeting later', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'What draws you to\na theme park most?',
    answers: [
      { text: 'The thrill of the rides', team: 'globe' as Team, points: 2 },
      { text: 'The storytelling and details', team: 'mouse' as Team, points: 2 },
      { text: 'The whole vibe and atmosphere', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "It's your birthday.\nPark plan?",
    answers: [
      { text: 'VIP tour - go all out', team: 'globe' as Team, points: 2 },
      { text: 'Hit every classic ride on a perfect schedule', team: 'mouse' as Team, points: 2 },
      { text: 'No plan, just enjoy the day', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Best seat on\na roller coaster?',
    answers: [
      { text: 'Front row, no question', team: 'globe' as Team, points: 2 },
      { text: 'Back row - best forces', team: 'mouse' as Team, points: 2 },
      { text: 'Wherever is open, let\'s go', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You find a hidden\ndetail in a ride queue.',
    answers: [
      { text: 'Cool, but I want to get on the ride already', team: 'globe' as Team, points: 2 },
      { text: 'Stop and study it, this is the good stuff', team: 'mouse' as Team, points: 2 },
      { text: 'Take a photo and share it with friends', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Pick a park souvenir.',
    answers: [
      { text: 'A limited edition pin nobody else has', team: 'globe' as Team, points: 2 },
      { text: 'A vintage-style poster for the wall', team: 'mouse' as Team, points: 2 },
      { text: 'Matching ears with your crew', team: 'shark' as Team, points: 2 },
    ],
  },
];
