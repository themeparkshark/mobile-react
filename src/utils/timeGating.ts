import dayjs from 'dayjs';
import { TimeWindow, TIME_WINDOWS } from '../models/prep-item-set-type';

/**
 * Time gating utilities for time-based item spawning.
 * 
 * Time periods:
 * - Morning: 6am - 11am (☀️ Rise and shine!)
 * - Afternoon: 11am - 5pm (🌞 Peak hours)
 * - Evening: 5pm - 9pm (🌅 Sunset magic)
 * - Night: 9pm - 6am (🌙 After dark)
 * 
 * Special:
 * - Weekend only items (Sat/Sun)
 * - Golden hour (sunrise/sunset)
 */

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night' | 'any';

/**
 * Time period configuration
 */
export const TIME_PERIOD_CONFIG = {
  morning: {
    startHour: 6,
    endHour: 11,
    emoji: '☀️',
    label: 'Morning',
    description: 'Available 6am-11am',
    color: '#FFD54F',
    items: ['Coffee Cup', 'Breakfast Burrito', 'Newspaper', 'Alarm Clock'],
  },
  afternoon: {
    startHour: 11,
    endHour: 17,
    emoji: '🌞',
    label: 'Afternoon',
    description: 'Available 11am-5pm',
    color: '#FF9800',
    items: ['Churro', 'Pretzel', 'Sunscreen', 'Water Bottle'],
  },
  evening: {
    startHour: 17,
    endHour: 21,
    emoji: '🌅',
    label: 'Evening',
    description: 'Available 5pm-9pm',
    color: '#FF7043',
    items: ['Popcorn', 'Turkey Leg', 'Park Map', 'Camera'],
  },
  night: {
    startHour: 21,
    endHour: 6, // Wraps to next day
    emoji: '🌙',
    label: 'Night',
    description: 'Available 9pm-6am',
    color: '#5C6BC0',
    items: ['Glow Stick', 'Flashlight', 'Moon Charm', 'Star Pin'],
  },
  any: {
    startHour: 0,
    endHour: 24,
    emoji: '🕐',
    label: 'Any Time',
    description: 'Available all day',
    color: '#4CAF50',
    items: [],
  },
} as const;

/**
 * Get current time period
 */
export function getCurrentTimePeriod(): TimePeriod {
  const hour = dayjs().hour();
  
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night'; // 9pm-6am
}

/**
 * Check if current time is within a time window
 */
export function isWithinTimeWindow(window: TimeWindow): boolean {
  const now = dayjs();
  const hour = now.hour();
  const dayOfWeek = now.day(); // 0=Sun, 6=Sat
  
  // Check day of week if specified
  if (window.days_of_week && window.days_of_week.length > 0) {
    if (!window.days_of_week.includes(dayOfWeek)) {
      return false;
    }
  }
  
  // Handle overnight time windows (e.g., 21:00 - 06:00)
  if (window.start_hour > window.end_hour) {
    return hour >= window.start_hour || hour < window.end_hour;
  }
  
  return hour >= window.start_hour && hour < window.end_hour;
}

/**
 * Check if current time matches a time period
 */
export function isTimePeriodActive(period: TimePeriod): boolean {
  if (period === 'any') return true;
  return getCurrentTimePeriod() === period;
}

/**
 * Get time until next period starts
 */
export function getTimeUntilPeriod(period: TimePeriod): {
  hours: number;
  minutes: number;
  totalMinutes: number;
} {
  if (period === 'any') {
    return { hours: 0, minutes: 0, totalMinutes: 0 };
  }
  
  const now = dayjs();
  const currentHour = now.hour();
  const currentMinute = now.minute();
  const config = TIME_PERIOD_CONFIG[period];
  
  let targetHour = config.startHour;
  
  // If we're past the start time today, target tomorrow
  if (currentHour >= targetHour && period !== getCurrentTimePeriod()) {
    // For night period, we might already be in it
    if (period === 'night' && currentHour >= 21) {
      return { hours: 0, minutes: 0, totalMinutes: 0 };
    }
  }
  
  // Calculate hours until target
  let hoursUntil = targetHour - currentHour;
  if (hoursUntil <= 0) {
    hoursUntil += 24; // Next day
  }
  
  // Adjust for current minute
  let minutesUntil = 60 - currentMinute;
  if (minutesUntil === 60) {
    minutesUntil = 0;
  } else {
    hoursUntil--;
  }
  
  const totalMinutes = hoursUntil * 60 + minutesUntil;
  
  return {
    hours: hoursUntil,
    minutes: minutesUntil,
    totalMinutes,
  };
}

/**
 * Get remaining time in current period
 */
export function getTimeRemainingInPeriod(): {
  hours: number;
  minutes: number;
  totalMinutes: number;
} | null {
  const period = getCurrentTimePeriod();
  const config = TIME_PERIOD_CONFIG[period];
  const now = dayjs();
  const currentHour = now.hour();
  const currentMinute = now.minute();
  
  let endHour = config.endHour;
  
  // Handle night period (crosses midnight)
  if (period === 'night' && currentHour >= 21) {
    endHour = 6 + 24; // 6am tomorrow
  }
  
  let hoursRemaining = endHour - currentHour - 1;
  let minutesRemaining = 60 - currentMinute;
  
  if (minutesRemaining === 60) {
    minutesRemaining = 0;
    hoursRemaining++;
  }
  
  if (hoursRemaining < 0) {
    return null; // Period has ended
  }
  
  return {
    hours: hoursRemaining,
    minutes: minutesRemaining,
    totalMinutes: hoursRemaining * 60 + minutesRemaining,
  };
}

/**
 * Check if it's a weekend
 */
export function isWeekend(): boolean {
  const day = dayjs().day();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Check if it's golden hour (sunrise/sunset)
 * Approximation: 30 min around sunrise (6:30am) and sunset (varies)
 */
export function isGoldenHour(): boolean {
  const hour = dayjs().hour();
  const minute = dayjs().minute();
  
  // Morning golden hour: ~6:00-7:00
  if (hour === 6 || (hour === 7 && minute < 30)) {
    return true;
  }
  
  // Evening golden hour: varies by season, approximate ~6:30-7:30pm
  if ((hour === 18 && minute >= 30) || (hour === 19 && minute < 30)) {
    return true;
  }
  
  return false;
}

/**
 * Format time period for display
 */
export function formatTimePeriod(period: TimePeriod): string {
  const config = TIME_PERIOD_CONFIG[period];
  return `${config.emoji} ${config.label}`;
}

/**
 * Get human-readable time window string
 */
export function formatTimeWindow(window: TimeWindow): string {
  const formatHour = (h: number) => {
    if (h === 0 || h === 24) return '12am';
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
  };
  
  let timeStr = `${formatHour(window.start_hour)}-${formatHour(window.end_hour)}`;
  
  if (window.days_of_week && window.days_of_week.length > 0) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNames = window.days_of_week.map(d => days[d]).join(', ');
    timeStr += ` (${dayNames})`;
  }
  
  return timeStr;
}

/**
 * Get spawn probability modifier based on time
 * Items are rarer outside their optimal times
 */
export function getTimeSpawnModifier(
  itemPeriod: TimePeriod,
  currentPeriod: TimePeriod = getCurrentTimePeriod()
): number {
  if (itemPeriod === 'any') return 1.0;
  if (itemPeriod === currentPeriod) return 1.5; // Boost during correct time
  return 0; // Don't spawn outside correct time
}
