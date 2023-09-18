import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { ReactNode, useContext, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import MapView from 'react-native-maps';
import { useTimeoutWhen } from 'rooks';
import config from '../config';
import { LocationContext } from '../context/LocationProvider';

export default function Map({ children }: { readonly children: ReactNode[] }) {
  const [focusedOnUser, setFocusedOnUser] = useState<boolean>(true);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const { location } = useContext(LocationContext);

  useTimeoutWhen(
    () => {
      setFocusedOnUser(true);
    },
    1000,
    mapReady
  );

  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
        }}
      >
        <Pressable
          onPress={() => setFocusedOnUser(true)}
          style={{
            padding: 12,
          }}
        >
          <FontAwesomeIcon
            icon={focusedOnUser ? faSolidArrow : faLocationArrow}
            size={30}
            color={config.primary}
          />
        </Pressable>
      </View>
      <MapView
        style={{
          width: Dimensions.get('window').width,
          height: '100%',
        }}
        showsUserLocation={true}
        showsIndoors={false}
        rotateEnabled={false}
        region={focusedOnUser ? location : undefined}
        initialRegion={location}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle="light"
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={() => setFocusedOnUser(false)}
      >
        {children}
      </MapView>
    </>
  );
}
