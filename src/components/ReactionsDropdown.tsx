import { Image } from 'expo-image';
import { ReactElement, useContext, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Tooltip from 'rn-tooltip';
import deleteReaction from '../api/endpoints/reactions/delete';
import addThreadReaction from '../api/endpoints/threads/addReaction';
import { ForumContext } from '../context/ForumProvider';
import { ReactionType } from '../models/reaction-type';

export default function ReactionsDropdown({
  activeReaction,
  model,
  onReactionChange,
  children,
}: {
  readonly activeReaction?: ReactionType;
  readonly model: {
    readonly id: number;
    readonly type: string;
  };
  readonly children: ReactElement;
  readonly onReactionChange: () => void;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const { reactionTypes } = useContext(ForumContext);
  const tooltip = useRef();

  return (
    <View style={{ position: 'relative' }}>
      <Tooltip
        ref={(ref) => (tooltip.current = ref)}
        actionType="press"
        width={500}
        height="auto"
        popover={
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 10,
              padding: 8,
              shadowOffset: {
                width: 0,
                height: 0,
              },
              shadowOpacity: 0.4,
              shadowRadius: 3,
              flexDirection: 'row',
              columnGap: 16,
            }}
          >
            {reactionTypes.map((reactionType) => {
              return (
                <View key={reactionType.id}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (
                        activeReaction?.reaction_type.id === reactionType.id
                      ) {
                        await deleteReaction(activeReaction.id);

                        onReactionChange();
                        tooltip.current.toggleTooltip();
                        return;
                      }

                      if (model.type === 'thread') {
                        await addThreadReaction(model.id, reactionType.id);
                      }

                      onReactionChange();
                      tooltip.current.toggleTooltip();
                    }}
                  >
                    <Image
                      source={{
                        uri: reactionType.image_url,
                      }}
                      style={{
                        width: 32,
                        height: 32,
                      }}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        }
        withOverlay={false}
        pointerColor="white"
        backgroundColor="transparent"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {children}
        </View>
      </Tooltip>
    </View>
  );
}
