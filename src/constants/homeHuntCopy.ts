/**
 * Home Hunt player-facing copy that is fixed in the app. Lists of rules (odds,
 * points, tiebreak, tiers) come from the server so numbers never drift; the
 * lines here never teach anti-cheat thresholds. No emoji, no em dashes, and
 * never the old wardrobe name (the screen is Inventory).
 */
export const HOME_HUNT_COPY = {
  tabLabel: 'Home Hunt',
  /** The one neutral line for any find that scored zero for an anti-cheat reason. */
  neutralZeroLine: "This find didn't count toward Standings this week.",
  unranked: 'Not ranked this week.',
  dailyCapLine: 'Daily Standings max reached. Finds still pay rewards.',
  heldLine: 'Your reward is being checked. It arrives within 72 hours.',
  safetyLine: 'Stay on sidewalks and paths. Never go onto private property.',
  fairnessFallback: 'Free and VIP rank the same.',
  nearMe: 'Near Me',
  friends: 'Friends',
  startHunting: 'Start Hunting',
  loadError: "Home Hunt didn't load",
  visibilityLabel: 'Show me on Near Me boards',
  visibilityHint: 'Near Me shows your username and rank only. Never where you are.',
  nudgeLabel: 'Nudge me when a friend is close',
  nudgeHint: 'Off by default. One note a week at most.',
  boardNameLabel: 'YOUR NAME ON BOARDS',
  boardNamePending: 'Shows as Player until your username is approved.',
  reportTitle: 'Report this spot',
  reportUnsafe: 'Unsafe',
  reportPrivate: 'Private property',
  reportOther: 'Other',
  reportThanks: 'Thanks. We will take a look at this spot.',
  reportFailed: 'Could not send that report. Try again.',
  wearIt: 'WEAR IT',
  addedToInventory: 'Added to your Inventory',
  wearablePending: 'Your wearable is on the way',
  oddsTitle: 'Drop odds',
  infoTitle: 'How Home Hunt works',
  friendsEmpty: 'None of your friends have scored this week yet.',
  resultsReady: 'Your weekly results are ready',
  claim: 'CLAIM',
  claiming: 'CLAIMING',
  claimed: 'CLAIMED',
  close: 'CLOSE',
} as const;

/** "You're the first hunter in the Orlando Area this week". */
export function firstHunterLine(label: string | null | undefined): string {
  const place = (label ?? '').trim();
  return place ? `You're the first hunter in the ${place} this week` : "You're the first hunter here this week";
}
