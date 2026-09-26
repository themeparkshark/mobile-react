import { useState } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import { AuthContext, type AuthContextType } from '../context/AuthProvider';
import type { ItemType } from '../models/item-type';
import type { InventoryType } from '../models/inventory-type';
import type { PlayerType } from '../models/player-type';
import Item from '../components/Item';
import Playercard from '../components/Playercard';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';

const pinType = { id: 7, name: 'Pins', image_url: '' };
const pinArt = require('../../assets/images/screens/store/pin_badge.png') as unknown as string;
const coinArt = require('../../assets/images/coingold.png') as unknown as string;
const wornPin = { id: 1, name: 'Shark Scout Pin', icon_url: pinArt,
  paper_url: pinArt, item_type: pinType } as ItemType;
const otherPin = { id: 2, name: 'Treasure Pin', icon_url: coinArt,
  paper_url: coinArt, item_type: pinType } as ItemType;
const inventory = { pin_item: wornPin } as InventoryType;
const player = { id: 1, inventory } as PlayerType;

/** Fixture-only visual review of the real item tile, player art, and original chrome. */
export default function InventoryPreviewScreen() {
  const [selected, setSelected] = useState(0);
  const auth = { player, isReady: true, refreshPlayer: async () => player } as AuthContextType;
  return <AuthContext.Provider value={auth}>
    <Wrapper previewMode>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton onPress={() => {}} /></TopbarColumn>
        <TopbarColumn><TopbarText>Inventory</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ImageBackground source={require('../../assets/images/screens/park/background-new.png')}
        resizeMode="stretch" style={{ marginTop: -8, height: 400, overflow: 'hidden', position: 'relative' }}>
        <Playercard inventory={inventory} style={{ position: 'absolute',
          width: Dimensions.get('window').width, height: 380 }} />
        <ScrollView horizontal style={{ position: 'absolute', width: '100%', bottom: 0,
          borderColor: '#fff', borderTopWidth: 3, borderBottomWidth: 3 }}>
          {['HEAD', 'FACE', 'BODY', 'HAND', 'PINS'].map((label, index) =>
            <Pressable key={label} onPress={() => setSelected(index)} style={{ width: 70, height: 62,
              justifyContent: 'center', alignItems: 'center', borderRightWidth: 1,
              borderRightColor: '#fff', backgroundColor: selected === index ? '#ffffffe8' : '#ffffffa8' }}>
              <Text style={{ color: '#0a4b80', fontFamily: 'Knockout', fontSize: 16 }}>{label}</Text>
            </Pressable>)}
        </ScrollView>
      </ImageBackground>
      <ImageBackground source={require('../../assets/images/shark_background.png')} resizeMode="cover"
        style={{ flex: 1, padding: 4 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><Item item={wornPin} /></View>
          <View style={{ flex: 1 }}><Item item={otherPin} /></View>
          <View style={{ flex: 1 }} />
        </View>
      </ImageBackground>
    </Wrapper>
  </AuthContext.Provider>;
}
