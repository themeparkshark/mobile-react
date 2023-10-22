import {ReactNode, useContext, useEffect, useRef, useState} from 'react';
import { Dimensions } from 'react-native';
import MapView from 'react-native-maps';
import { LocationContext } from '../context/LocationProvider';
import { Magnetometer } from 'expo-sensors';

export default function Map({ children }: { readonly children: ReactNode[] }) {
  const { location } = useContext(LocationContext);
  const mapRef = useRef<MapView>(null);
  const [azimuth, setAzimuth] = useState(0);

  useEffect(() => {
    Magnetometer.addListener((result) => {
      const angle = calculateAzimuth(result.x, result.y);
      setAzimuth(angle);
    });

    Magnetometer.setUpdateInterval(5000);

    return () => {
      Magnetometer.removeAllListeners();
    };
  }, []);

  const calculateAzimuth = (x, y) => {
    let azimuth = Math.atan2(y, x) * (180 / Math.PI);

    if (azimuth < 0) {
      azimuth += 360;
    }

    return Math.round(azimuth);
  };

  useEffect(() => {
    if (!mapRef?.current) {
      return;
    }

    mapRef.current.animateCamera({
      center: location,
      heading: azimuth,
    })
  }, [location, mapRef, azimuth]);

  return (
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
      scrollEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      loadingEnabled={true}
      userInterfaceStyle="light"
      initialRegion={{
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.0007,
        longitudeDelta: 0.0007,
      }}
    >
      {children}
    </MapView>
  );
}
