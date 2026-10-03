import type { RideTrack } from '../../ridePhoto';

/**
 * Ride track shapes (pure, tested): control points in 0..1 of the width and of the track band,
 * with each ride's pitch clamp. Every shape keeps its steepest real slope within 6 deg of its clamp,
 * so no car or log ever sits off its rail.
 */

export type Shape = readonly (readonly [number, number])[];

// Coaster: station flat, a steep chain lift, a rounded crest, the drop, and the run-out past the camera.
export const COASTER_SHAPES: Readonly<Record<RideTrack, Shape>> = {
  family: [[-0.25, 0.75], [0.0, 0.75], [0.15, 0.75], [0.24, 0.66], [0.31, 0.62], [0.38, 0.68], [0.46, 0.74], [0.56, 0.74], [0.74, 0.64], [0.92, 0.72], [1.25, 0.7]],
  hill: [[-0.25, 0.8], [0.0, 0.8], [0.14, 0.8], [0.18, 0.7], [0.22, 0.42], [0.26, 0.3], [0.31, 0.32], [0.36, 0.52], [0.41, 0.76], [0.47, 0.82], [0.6, 0.78], [0.76, 0.64], [0.92, 0.72], [1.25, 0.72]],
  dark: [[-0.25, 0.8], [0.0, 0.8], [0.14, 0.8], [0.18, 0.7], [0.22, 0.44], [0.26, 0.32], [0.31, 0.34], [0.36, 0.54], [0.41, 0.76], [0.47, 0.82], [0.6, 0.78], [0.76, 0.64], [0.92, 0.72], [1.25, 0.72]],
  launch: [[-0.25, 0.74], [0.0, 0.74], [0.17, 0.74], [0.24, 0.58], [0.3, 0.42], [0.35, 0.4], [0.4, 0.58], [0.46, 0.76], [0.56, 0.78], [0.74, 0.6], [0.92, 0.7], [1.25, 0.68]],
};
export const COASTER_FRAME_AT: Readonly<Record<RideTrack, number>> = { family: 0.44, hill: 0.47, dark: 0.47, launch: 0.47 };
export const COASTER_STATION_X = 0.11;
/** Coaster cars pitch steeply on a narrow portrait screen (a vertical-lift coaster); the car follows the rail. */
export const COASTER_MAX_PITCH = (78 * Math.PI) / 180;

// Log flume: a long shallow conveyor lift climbing in from the left, a flat float trough along the
// top where the log waits, a rounded lip, ONE straight chute, and a wide splash pool.
export const FLUME_SHAPE: Shape = [
  [-0.95, 0.96], [-0.5, 0.76], [-0.05, 0.55], [0.06, 0.52], [0.24, 0.52], [0.31, 0.54], [0.37, 0.59],
  [0.66, 0.82], [0.74, 0.86], [0.88, 0.87], [1.3, 0.87],
];
export const FLUME_MAX_PITCH = (44 * Math.PI) / 180;
