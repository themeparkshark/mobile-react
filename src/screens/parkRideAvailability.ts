import type { WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';

const normalize = (name: string) => name.trim().toLocaleLowerCase('en-US');

/** Reviewed legacy coin labels for Disneyland's attraction feed; no fuzzy matching. */
const FEED_ALIASES: Readonly<Record<number, Readonly<Record<string, readonly string[]>>>> = {
  8: {
    'astro blasters': ['Buzz Lightyear Astro Blasters'],
    'haunted mansion': ['Haunted Mansion Holiday'],
    "it's a small world": ['"it\'s a small world"'],
    'matterhorn': ['Matterhorn Bobsleds'],
    'mr. toad': ["Mr. Toad's Wild Ride"],
    'pirates': ['Pirates of the Caribbean'],
    'smugglers': ['Millennium Falcon: Smugglers Run'],
    'star tours': ['Star Tours - The Adventures Continue'],
    'submarine voyage': ['Finding Nemo Submarine Voyage'],
    'the many adventures of pooh': ['The Many Adventures of Winnie the Pooh'],
    'thunder mountain': ['Big Thunder Mountain Railroad'],
  },
};

/** A status is usable only when one attraction in this park matches exactly or by reviewed alias. */
export function reportedRideStatus(entries: readonly WikiLiveEntry[], parkId: number,
  rideName: string): WikiLiveEntry['status'] | null {
  const name = normalize(rideName);
  if (!name) return null;
  const eligibleNames = new Set([name, ...(FEED_ALIASES[parkId]?.[name] ?? []).map(normalize)]);
  const matches = entries.filter(entry => eligibleNames.has(normalize(entry.name)));
  return matches.length === 1 ? matches[0].status : null;
}
