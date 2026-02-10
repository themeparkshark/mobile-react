import { PARK_WIKI_IDS } from '../../../../constants/parkWaitTimes';

export interface WikiLiveEntry {
  id: string;
  name: string;
  entityType: 'ATTRACTION' | 'SHOW' | 'RESTAURANT' | 'PARK';
  status: 'OPERATING' | 'DOWN' | 'REFURBISHMENT' | 'CLOSED';
  queue?: {
    STANDBY?: { waitTime: number | null };
    RETURN_TIME?: { state: string | null; returnStart: string | null };
  };
}

export interface WikiLiveResponse {
  liveData: WikiLiveEntry[];
}

export default async function getWikiTimes(parkId: number): Promise<WikiLiveEntry[]> {
  const wikiId = PARK_WIKI_IDS[parkId];
  if (!wikiId) return [];

  const res = await fetch(`https://api.themeparks.wiki/v1/entity/${wikiId}/live`);
  if (!res.ok) throw new Error(`Failed to fetch wait times: ${res.status}`);

  const data: WikiLiveResponse = await res.json();
  return data.liveData.filter((e) => e.entityType === 'ATTRACTION');
}
