import type { WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import QueueTimesScreen from './QueueTimesScreen';

const sampleEntries: WikiLiveEntry[] = [
  { id: 'preview-pirates', name: 'Pirates of the Caribbean', entityType: 'ATTRACTION',
    status: 'OPERATING', queue: { STANDBY: { waitTime: 35 } } },
  { id: 'preview-space', name: 'Space Mountain', entityType: 'ATTRACTION',
    status: 'OPERATING', queue: { STANDBY: { waitTime: 70 } } },
  { id: 'preview-haunted', name: 'Haunted Mansion', entityType: 'ATTRACTION',
    status: 'DOWN', queue: { STANDBY: { waitTime: null } } },
  { id: 'preview-jungle', name: 'Jungle Cruise', entityType: 'ATTRACTION',
    status: 'OPERATING', queue: { STANDBY: { waitTime: 15 } } },
  { id: 'preview-smallworld', name: "it's a small world", entityType: 'ATTRACTION',
    status: 'OPERATING', queue: { STANDBY: { waitTime: null } } },
  { id: 'preview-bigthunder', name: 'Big Thunder Mountain Railroad', entityType: 'ATTRACTION',
    status: 'OPERATING', queue: { STANDBY: { waitTime: 50 } } },
  { id: 'preview-railroad', name: 'Disneyland Railroad', entityType: 'ATTRACTION',
    status: 'CLOSED', queue: { STANDBY: { waitTime: null } } },
];

/** Development-only layout preview. These are sample states, not park wait data. */
export default function QueueTimesPreviewScreen() {
  return <QueueTimesScreen route={{ params: { park: 8, previewEntries: sampleEntries } }} />;
}
