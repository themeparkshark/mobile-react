import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Magnetometer } from 'expo-sensors';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import MapView from 'react-native-maps';
import config from '../config';
import { LocationContext } from '../context/LocationProvider';

export default function Map({ children }: { readonly children: ReactNode[] }) {
  const { location } = useContext(LocationContext);
  const mapRef = useRef<MapView>(null);
  const [azimuth, setAzimuth] = useState(0);
  const [focusedOnUser, setFocusedOnUser] = useState<boolean>(true);

  useEffect(() => {
    Magnetometer.addListener((result) => {
      setAzimuth(calculateAzimuth(result.x, result.y));
    });

    Magnetometer.setUpdateInterval(250);

    return () => {
      Magnetometer.removeAllListeners();
    };
  }, []);

  const calculateAzimuth = (x: number, y: number) => {
    let azimuth = Math.atan2(y, x) * (180 / Math.PI);

    if (azimuth < 0) {
      azimuth += 360;
    }

    return Math.round(azimuth);
  };

  useEffect(() => {
    if (!mapRef?.current || !focusedOnUser) {
      return;
    }

    mapRef.current.animateCamera({
      center: location,
      heading: azimuth,
      altitude: 200,
    });
  }, [
    focusedOnUser,
    location?.latitude,
    location?.longitude,
    mapRef.current,
    azimuth,
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
        ref={mapRef}
        style={{
          width: Dimensions.get('window').width,
          height: '100%',
        }}
        showsUserLocation={true}
        showsIndoors={false}
        showsCompass={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle="light"
        onPanDrag={() => {
          setFocusedOnUser(false);
        }}
      >
        {children}
      </MapView>
    </View>
  );
}
