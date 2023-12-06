import { Image } from 'expo-image';
import { ReactElement, useContext, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
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

  useTimeoutWhen(
    () => {
      setOpen(false);
    },
    5000,
    open
  );

  return (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {children}
      </TouchableOpacity>
      {open && (
        <View
          style={{
            position: 'absolute',
            top: '150%',
            left: 0,
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
            zIndex: 20,
          }}
        >
          {reactionTypes.map((reactionType) => {
            return (
              <View key={reactionType.id}>
                <TouchableOpacity
                  onPress={async () => {
                    if (activeReaction?.reaction_type.id === reactionType.id) {
                      await deleteReaction(activeReaction.id);

                      onReactionChange();
                      setOpen(false);
                      return;
                    }

                    if (model.type === 'thread') {
                      await addThreadReaction(model.id, reactionType.id);
                    }

                    onReactionChange();
                    setOpen(false);
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
      )}
    </View>
  );
}
