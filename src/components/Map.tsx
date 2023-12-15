import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import MapView from 'react-native-maps';
import config from '../config';
import { LocationContext } from '../context/LocationProvider';

export default function Map({ children }: { readonly children: ReactNode }) {
  const { location } = useContext(LocationContext);
  const mapRef = useRef<MapView>(null);
  const [focusedOnPlayer, setFocusedOnPlayer] = useState<boolean>(true);

  useEffect(() => {
    if (!mapRef?.current || !focusedOnPlayer) {
      return;
    }

    mapRef.current.animateCamera({
      center: location,
      altitude: 200,
    });
  }, [
    focusedOnPlayer,
    location?.latitude,
    location?.longitude,
    mapRef.current,
  ]);

  return (
    <View
      style={{
        position: 'relative',
        flex: 1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 48,
          right: 16,
          zIndex: 10,
        }}
      >
        <Pressable
          onPress={() => setFocusedOnPlayer(true)}
          style={{
            padding: 12,
          }}
        >
          <FontAwesomeIcon
            icon={focusedOnPlayer ? faSolidArrow : faLocationArrow}
            size={30}
            color={config.primary}
          />
        </Pressable>
      </View>
      <MapView
        ref={mapRef}
        style={{
          width: Dimensions.get('window').width,
          height: '100%',
        }}
        showsUserLocation={true}
        showsIndoors={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle="light"
        onPanDrag={() => {
          setFocusedOnPlayer(false);
        }}
      >
        {children}
      </MapView>
    </View>
  );
}
