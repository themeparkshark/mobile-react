/**
 * Old route kept for older notifications and links: Requests now live in the
 * Friends screen's Requests tab.
 */
import FriendsScreen from './FriendsScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

export default function PendingFriendRequestsScreen(props: NativeStackScreenProps<ParamListBase, 'PendingFriendRequests'>) {
  return <FriendsScreen {...(props as any)} route={{ ...props.route, params: { tab: 'requests' } }} />;
}
