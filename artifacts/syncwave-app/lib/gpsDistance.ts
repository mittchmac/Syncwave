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
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;
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
