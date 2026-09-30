import { StyleSheet, Text, View } from 'react-native';
import type { ParkProject } from '../../api/endpoints/me/park-projects';
import { GameIcon, GameRichText } from '../../ui';

type Action = NonNullable<ParkProject['recent_actions']>[number];

function actionCopy(action: Action, project: ParkProject): { heading: string; body: string } {
  switch (action.kind) {
    case 'home_find': return { heading: 'HOME FIND', body: 'A fan found a prep collectible.' };
    case 'fan_challenge': return { heading: 'FAN CHALLENGE', body: 'A fan solved a story clue from home.' };
    case 'ride_coin': return { heading: 'RIDE COIN', body: 'A guest won a ride coin at this park.' };
    case 'queue_part': return { heading: 'LINEPLAY', body: 'A queue crew earned a ride Part.' };
    case 'vote_a': return { heading: 'CHAPTER VOTE', body: `A contributor chose ${project.chapter_a_title}.` };
    case 'vote_b': return { heading: 'CHAPTER VOTE', body: `A contributor chose ${project.chapter_b_title}.` };
    default: return { heading: 'CREW SIGNAL', body: 'A fan helped the shared story.' };
  }
}

function timeLabel(timestamp: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(elapsed)) return 'RECENT';
  if (elapsed < 60_000) return 'JUST NOW';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}M AGO`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}H AGO`;
  return 'EARLIER';
}

export default function ProjectRippleFeed({ project, compact = false }: {
  readonly project: ParkProject;
  readonly compact?: boolean;
}) {
  const actions = project.recent_actions?.slice(0, compact ? 2 : 4) ?? [];
  if (!actions.length) return null;
  const freshestAt = Date.parse(actions[0].at);
  const isFresh = Number.isFinite(freshestAt) && Date.now() - freshestAt < 3_600_000;

  return <View style={styles.shell}>
    <GameRichText style={styles.title} iconSize={14}>{`[icon:sparkle] ${isFresh ? 'THE CREW JUST CHANGED THIS' : 'CREW ACTIVITY'}`}</GameRichText>
    {actions.map((action, index) => {
      const copy = actionCopy(action, project);
      return <View key={`${action.kind}-${action.at}-${index}`} style={[styles.row, index > 0 && styles.divider]}>
        <View style={styles.dot}><GameIcon name="sparkle" size={14} /></View>
        <View style={styles.copy}>
          <View style={styles.topline}>
            <Text style={styles.heading}>{copy.heading}</Text>
            <Text style={styles.time}>{timeLabel(action.at)}</Text>
          </View>
          <Text style={styles.body}>{copy.body}</Text>
        </View>
        {action.points > 0 && <Text style={styles.points}>+{action.points}</Text>}
      </View>;
    })}
    <Text style={styles.footer}>Verified game actions shape the same story for every fan.</Text>
  </View>;
}

const styles = StyleSheet.create({
  shell: { borderRadius: 16, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#d8f3ff', padding: 12, marginTop: 14 },
  title: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 10, paddingBottom: 8 },
  divider: { borderTopWidth: 1, borderTopColor: '#a3d8f0' },
  dot: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#ffca30',
    borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#07569e', fontSize: 14, lineHeight: 18 },
  copy: { flex: 1 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  heading: { color: '#0b477e', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.4 },
  time: { color: '#5d88a5', fontFamily: 'Knockout', fontSize: 10 },
  body: { color: '#244d70', fontSize: 12, lineHeight: 16 },
  points: { color: '#a86500', fontFamily: 'Knockout', fontSize: 17 },
  footer: { color: '#4b7391', fontSize: 10, marginTop: 3 },
});
