import { Dimensions, ImageBackground, Text, View } from 'react-native';
import theme from '../../config/theme';
import Item from './Item';
import { ItemType } from '../../models/item-type';

const yellow = require('../../../assets/images/screens/store/yellow.png');
const purple = require('../../../assets/images/screens/store/purple.png');

export default function Section({
  title,
  items,
}: {
  title: string;
  items: ItemType[];
}) {
  return (
    <View
      style={{
        paddingBottom: 48,
        backgroundColor: 'rgba(255, 255, 255, .6)',
      }}
    >
      <ImageBackground
        source={title === 'Weekly Items' ? yellow : purple}
        resizeMode={'contain'}
        style={{
          width: Dimensions.get('window').width,
          height: 75,
        }}
      >
        <View
          style={{
            backgroundColor: 'rgba(0, 0, 0, .5)',
            position: 'absolute',
            right: 6,
            top: -26,
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: 4,
            paddingBottom: 4,
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderColor: 'rgba(255, 255, 255, .4)',
            borderTopWidth: 2,
            borderLeftWidth: 2,
            borderRightWidth: 2,
          }}
        >
          <Text
            style={{
              color: '#fff',
              textShadowColor: theme.primary,
              textShadowRadius: 5,
              fontFamily: 'Knockout',
              fontSize: 16,
            }}
          >
            {title === 'Weekly Items'
              ? 'Updates every Friday'
              : 'Updates on 1st'}
          </Text>
        </View>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 32,
            color: 'white',
            paddingTop: 10,
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            textShadowColor: theme.primary,
            textShadowRadius: 5,
          }}
        >
          {title}
        </Text>
      </ImageBackground>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {items?.map((item) => {
          return (
            <View
              key={item.id}
              style={{
                padding: 10,
              }}
            >
              <Item item={item} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
