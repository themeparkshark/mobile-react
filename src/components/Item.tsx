import { Image } from 'expo-image';
import { useContext } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { ItemType } from '../models/item-type';

export default function Item({ item, onToggle, disabled = false, saving = false }: {
  readonly item: ItemType;
  readonly onToggle?: (item: ItemType) => void;
  readonly disabled?: boolean;
  readonly saving?: boolean;
}) {
  const { player } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const artSize = Math.max(60, Math.floor(width / 3) - 44);
  const isEquipped = Object.values(player?.inventory ?? {}).some((inventoryItem) =>
    inventoryItem && typeof inventoryItem === 'object' && 'id' in inventoryItem &&
    inventoryItem.id === item.id);
  const fixedEquippedItem = isEquipped &&
    (player?.inventory?.skin_item?.id === item.id || player?.inventory?.background_item?.id === item.id);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fixedEquippedItem ? `${item.name}, currently worn`
          : isEquipped ? `Remove ${item.name} from your shark` : `Wear ${item.name} on your shark`}
        accessibilityState={{ disabled: disabled || saving || fixedEquippedItem || !onToggle, selected: isEquipped }}
        disabled={disabled || saving || fixedEquippedItem || !onToggle}
        style={({ pressed }) => [styles.card, isEquipped && styles.cardEquipped,
          pressed && styles.cardPressed]}
        onPress={() => onToggle?.(item)}
      >
        {item.is_coin_code_item && (
          <View style={styles.specialBadge}>
            <Image
              source={require('../../assets/images/modals/brown_closed.png')}
              style={styles.specialBadgeImage}
              contentFit="contain"
            />
          </View>
        )}
        {isEquipped && <View style={styles.wornBadge}><Text style={styles.wornText}>WORN</Text></View>}
        <View style={[styles.artArea, { height: artSize + 16 }]}>
          {item.item_type.id === 4 ? (
            <View style={{ width: artSize, height: artSize }}>
              <Image
                source={player?.inventory?.skin_item?.no_eye_url
                  ? { uri: player.inventory.skin_item.no_eye_url }
                  : require('../../assets/images/screens/inventory/shark-colored-v2.png')}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
              />
              {player?.inventory?.skin_item?.no_eye_url && (
                <Image source={require('../../assets/images/screens/inventory/blink.png')}
                  style={StyleSheet.absoluteFill} contentFit="contain" />
              )}
              <Image source={item.paper_url} style={StyleSheet.absoluteFill} contentFit="contain" />
            </View>
          ) : (
            <Image
              source={item.icon_url}
              style={{ width: artSize, height: artSize }}
              contentFit="contain"
            />
          )}
        </View>
        {!!item.name && (
          <Text numberOfLines={2} style={styles.name}>
            {item.name}
          </Text>
        )}
        {saving && <Text style={styles.status}>Saving…</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8 },
  card: { width: '100%', minHeight: 148, alignSelf: 'center', position: 'relative', borderRadius: 14,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#f1fbff', overflow: 'hidden',
    shadowColor: '#073967', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.23,
    shadowRadius: 3, elevation: 3 },
  cardEquipped: { borderColor: '#ffd44c', backgroundColor: '#eefaff' },
  cardPressed: { transform: [{ scale: 0.97 }] },
  specialBadge: { zIndex: 20, position: 'absolute', top: 4, left: 4 },
  specialBadgeImage: { width: 25, height: 25 },
  wornBadge: { zIndex: 12, position: 'absolute', top: 5, right: 5,
    borderRadius: 7, backgroundColor: '#ffd44c', borderWidth: 1, borderColor: '#fff',
    paddingHorizontal: 5, paddingVertical: 3 },
  wornText: { color: '#123e65', fontFamily: 'Knockout', fontSize: 11 },
  artArea: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#15395B', fontFamily: 'Knockout', fontSize: 15,
    textAlign: 'center', paddingHorizontal: 4, paddingBottom: 7, minHeight: 43 },
  status: { color: '#15395B', fontSize: 11, fontWeight: '700', textAlign: 'center', paddingBottom: 7 },
});
