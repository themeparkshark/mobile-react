import React, { createContext, FC, ReactNode, useContext, useState, useCallback } from 'react';
import { useAsyncEffect, useIntervalWhen } from 'rooks';
import * as Location from 'expo-location';
import { LocationContext } from './LocationProvider';
import { AuthContext } from './AuthProvider';
import { WeatherCondition } from '../models/prep-item-set-type';

/**
 * Weather data structure from Open-Meteo API
 * Using Open-Meteo because it's free and doesn't require API key
 */
export interface WeatherData {
  temperature: number; // Fahrenheit
  apparentTemperature: number;
  precipitation: number; // mm
  weatherCode: number;
  windSpeed: number; // mph
  isDay: boolean;
  conditions: WeatherCondition[];
}

export interface WeatherContextType {
  readonly weather: WeatherData | null;
  readonly isLoading: boolean;
  readonly lastUpdated: Date | null;
  readonly refreshWeather: () => Promise<void>;
  readonly hasCondition: (condition: WeatherCondition) => boolean;
  readonly getActiveConditions: () => WeatherCondition[];
}

export const WeatherContext = createContext<WeatherContextType>(
  {} as WeatherContextType
);

/**
 * Weather codes from Open-Meteo WMO standards
 * https://open-meteo.com/en/docs
 */
const WMO_CODES: Record<number, { description: string; conditions: WeatherCondition[] }> = {
  0: { description: 'Clear sky', conditions: ['clear'] },
  1: { description: 'Mainly clear', conditions: ['clear'] },
  2: { description: 'Partly cloudy', conditions: ['cloudy'] },
  3: { description: 'Overcast', conditions: ['cloudy'] },
  45: { description: 'Fog', conditions: ['cloudy'] },
  48: { description: 'Depositing rime fog', conditions: ['cloudy', 'cold'] },
  51: { description: 'Light drizzle', conditions: ['rain'] },
  53: { description: 'Moderate drizzle', conditions: ['rain'] },
  55: { description: 'Dense drizzle', conditions: ['rain'] },
  56: { description: 'Light freezing drizzle', conditions: ['rain', 'cold'] },
  57: { description: 'Dense freezing drizzle', conditions: ['rain', 'cold'] },
  61: { description: 'Slight rain', conditions: ['rain'] },
  63: { description: 'Moderate rain', conditions: ['rain'] },
  65: { description: 'Heavy rain', conditions: ['rain'] },
  66: { description: 'Light freezing rain', conditions: ['rain', 'cold'] },
  67: { description: 'Heavy freezing rain', conditions: ['rain', 'cold'] },
  71: { description: 'Slight snow', conditions: ['snow', 'cold'] },
  73: { description: 'Moderate snow', conditions: ['snow', 'cold'] },
  75: { description: 'Heavy snow', conditions: ['snow', 'cold'] },
  77: { description: 'Snow grains', conditions: ['snow', 'cold'] },
  80: { description: 'Slight rain showers', conditions: ['rain'] },
  81: { description: 'Moderate rain showers', conditions: ['rain'] },
  82: { description: 'Violent rain showers', conditions: ['rain'] },
  85: { description: 'Slight snow showers', conditions: ['snow', 'cold'] },
  86: { description: 'Heavy snow showers', conditions: ['snow', 'cold'] },
  95: { description: 'Thunderstorm', conditions: ['rain'] },
  96: { description: 'Thunderstorm with slight hail', conditions: ['rain'] },
  99: { description: 'Thunderstorm with heavy hail', conditions: ['rain'] },
};

// Cache duration: 10 minutes minimum between API calls
const WEATHER_CACHE_DURATION = 10 * 60 * 1000;

export const WeatherProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const { location } = useContext(LocationContext);
  const { player } = useContext(AuthContext);
  
  // Cache time to prevent API spam (not a hook, just a ref)
  const lastFetchTimeRef = React.useRef<number>(0);

  /**
   * Fetch weather data from Open-Meteo API
   */
  const fetchWeather = useCallback(async (lat: number, lon: number): Promise<WeatherData | null> => {
    try {
      // Open-Meteo API - free, no key required
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const data = await response.json();
      const current = data.current;
      
      // Get base conditions from weather code
      const weatherCodeInfo = WMO_CODES[current.weather_code] || { conditions: [] };
      const conditions: WeatherCondition[] = [...weatherCodeInfo.conditions];
      
      // Add temperature-based conditions
      const temp = current.temperature_2m;
      if (temp >= 85) {
        conditions.push('hot');
      }
      if (temp <= 50) {
        conditions.push('cold');
      }
      
      // Add wind condition
      if (current.wind_speed_10m >= 20) {
        conditions.push('windy');
      }
      
      // Dedupe conditions
      const uniqueConditions = [...new Set(conditions)] as WeatherCondition[];
      
      return {
        temperature: temp,
        apparentTemperature: current.apparent_temperature,
        precipitation: current.precipitation,
        weatherCode: current.weather_code,
        windSpeed: current.wind_speed_10m,
        isDay: current.is_day === 1,
        conditions: uniqueConditions,
      };
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      return null;
    }
  }, []);

  /**
   * Refresh weather data (with rate limiting to prevent API spam)
   */
  const refreshWeather = useCallback(async (force: boolean = false) => {
    if (!location?.latitude || !location?.longitude) return;
    
    // Check cache - don't fetch if we fetched recently (unless forced)
    const now = Date.now();
    if (!force && lastFetchTimeRef.current > 0 && (now - lastFetchTimeRef.current) < WEATHER_CACHE_DURATION) {
      return; // Use cached data
    }
    
    setIsLoading(true);
    lastFetchTimeRef.current = now;
    const data = await fetchWeather(location.latitude, location.longitude);
    if (data) {
      setWeather(data);
      setLastUpdated(new Date());
    }
    setIsLoading(false);
  }, [location?.latitude, location?.longitude, fetchWeather]);

  /**
   * Check if a specific condition is active
   */
  const hasCondition = useCallback((condition: WeatherCondition): boolean => {
    return weather?.conditions.includes(condition) || false;
  }, [weather]);

  /**
   * Get all active conditions
   */
  const getActiveConditions = useCallback((): WeatherCondition[] => {
    return weather?.conditions || [];
  }, [weather]);

  // Initial fetch when location is available
  useAsyncEffect(async () => {
    if (player && location?.latitude && location?.longitude) {
      await refreshWeather();
    }
  }, [player, location?.latitude, location?.longitude]);

  // Refresh weather every 15 minutes
  useIntervalWhen(
    async () => {
      await refreshWeather();
    },
    15 * 60 * 1000, // 15 minutes
    Boolean(player && location?.latitude),
    false
  );

  return (
    <WeatherContext.Provider
      value={{
        weather,
        isLoading,
        lastUpdated,
        refreshWeather,
        hasCondition,
        getActiveConditions,
      }}
    >
      {children}
    </WeatherContext.Provider>
  );
};

/**
 * Hook for easy weather access
 */
export function useWeather() {
  return useContext(WeatherContext);
}

/**
 * Get weather condition emoji
 */
export function getWeatherEmoji(conditions: WeatherCondition[]): string {
  if (conditions.includes('snow')) return '❄️';
  if (conditions.includes('rain')) return '🌧️';
  if (conditions.includes('hot')) return '☀️';
  if (conditions.includes('cold')) return '🥶';
  if (conditions.includes('windy')) return '💨';
  if (conditions.includes('cloudy')) return '☁️';
  if (conditions.includes('clear')) return '☀️';
  return '🌤️';
}

/**
 * Get weather description
 */
export function getWeatherDescription(weather: WeatherData): string {
  const temp = Math.round(weather.temperature);
  const emoji = getWeatherEmoji(weather.conditions);
  return `${emoji} ${temp}°F`;
}
