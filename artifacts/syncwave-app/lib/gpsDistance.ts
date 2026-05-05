const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance in meters between two GPS coordinates. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineMeters(lat1, lng1, lat2, lng2);
}

/**
 * Speed-of-sound delay in milliseconds for a given distance in meters.
 * Sound travels at ~343 m/s. Returns 0 for distances under 10 m.
 */
export function soundDelayMs(distM: number): number {
  if (distM < 10) return 0;
  return Math.round((distM / 343) * 1000);
}

/**
 * Calculate distance in yards between two GPS coordinates.
 * Uses Haversine formula.
 */
export function distanceYards(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const meters = haversineMeters(lat1, lng1, lat2, lng2);
  return Math.round(meters * 1.09361);
}

/**
 * Format distance with units.
 */
export function formatDistance(yards: number): string {
  if (yards >= 1760) {
    return `${(yards / 1760).toFixed(1)} mi`;
  }
  return `${yards} yds`;
}
