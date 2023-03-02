import { ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Tab, TabView } from 'react-native-elements';
import config from '../config';

export default function Tabs({
  items,
  views,
}: {
  readonly items: string[];
  readonly views: ReactNode[];
}) {
  const [index, setIndex] = useState<number>(0);

  return (
    <>
      <Tab
        value={index}
        onChange={setIndex}
        indicatorStyle={{
          backgroundColor: config.primary,
        }}
      >
        {items.map((item) => (
          <Tab.Item
            containerStyle={{
              backgroundColor: 'transparent',
            }}
            style={{
              marginTop: 8,
            }}
            titleStyle={{
              color: 'black',
              fontFamily: 'Knockout',
            }}
            key={item}
            title={item}
          />
        ))}
      </Tab>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(255, 255, 255, .6)',
          borderTopWidth: 5,
          borderTopColor: '#fff',
        }}
      >
        <TabView value={index} onChange={setIndex} animationType="spring">
          {views.map((view, index) => {
            return (
              <TabView.Item
                onMoveShouldSetResponder={(e) => e.stopPropagation()}
                key={index}
                style={{
                  flex: 1,
                }}
              >
                <ScrollView
                  contentContainerStyle={{
                    flexGrow: 1,
                  }}
                >
                  <View>{view}</View>
                </ScrollView>
              </TabView.Item>
            );
          })}
        </TabView>
      </View>
    </>
  );
}
