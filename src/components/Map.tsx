import { Magnetometer } from 'expo-sensors';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import MapView from 'react-native-maps';
import { useAsyncEffect } from 'rooks';
import { LocationContext } from '../context/LocationProvider';

export default function Map({ children }: { readonly children: ReactNode[] }) {
  const { location } = useContext(LocationContext);
  const mapRef = useRef(null);
  const [subscription, setSubscription] = useState(null);
  const [lastAnimateAngle, setLastAnimateAngle] = useState(0);
  const [magnetometer, setMagnetometer] = useState(0);

  useAsyncEffect(async () => {
    if (!location || !mapRef.current) {
      return;
    }

    mapRef.current.animateCamera({
      center: { latitude: location.latitude, longitude: location.longitude },
      altitude: 800,
      zoom: 20,
    });
  }, [location?.latitude, location?.longitude, mapRef.current]);

  useEffect(() => {
    _toggle();
    return () => {
      _unsubscribe();
    };
  }, []);

  const _toggle = () => {
    if (subscription) {
      _unsubscribe();
    } else {
      _subscribe();
    }
  };

  const _subscribe = () => {
    setSubscription(
      Magnetometer.addListener((data) => {
        setMagnetometer(_angle(data));
      })
    );
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  const _angle = (magnetometer) => {
    let angle = 0;
    if (magnetometer) {
      let { x, y } = magnetometer;
      angle =
        ((Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI)) * (180 / Math.PI);
    }

    return Math.round(angle);
  };

  const _degree = (magnetometerData) => {
    return (magnetometerData - 90 + 360) % 360;
  };

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (magnetometer > 0 && location) {
      const rotationAngle = _degree(magnetometer);
      const angleDiff = rotationAngle - lastAnimateAngle;

      if (lastAnimateAngle === 0 || angleDiff > 2 || angleDiff < -2) {
        setLastAnimateAngle(rotationAngle);

        mapRef.current.animateCamera({
          center: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          heading: rotationAngle,
        });
      }
    }
  }, [
    magnetometer,
    location?.latitude,
    location?.longitude,
    lastAnimateAngle,
    mapRef.current,
  ]);

  return (
    <MapView
      style={{
        width: Dimensions.get('window').width,
        height: '100%',
      }}
      ref={mapRef}
      showsUserLocation={true}
      showsIndoors={false}
      showsCompass={false}
      zoomEnabled={false}
      scrollEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      loadingEnabled={true}
      userInterfaceStyle="light"
    >
      {children}
    </MapView>
  );
}
