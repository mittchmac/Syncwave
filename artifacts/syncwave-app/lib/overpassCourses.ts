/**
 * Golf course search via the Overpass API (OpenStreetMap).
 * Free, no API key required, global coverage.
 */

import type { GolfCourse, GolfHole } from "@/context/GolfContext";
import { cacheAll } from "@/lib/courseCache";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// ── Synthetic hole generator ────────────────────────────────────────────────

const PAR3_YARDS = [145, 158, 168, 175, 182, 190, 200, 212];
const PAR4_YARDS = [355, 370, 385, 395, 408, 420, 432, 445];
const PAR5_YARDS = [485, 498, 510, 525, 538, 552, 565, 578];

function pickYards(arr: number[], seed: number): number {
  return arr[seed % arr.length];
}

/**
 * Generate a plausible 18-hole layout for a course with a given total par.
 * Standard distribution: par-72 = 10 par-4s, 4 par-3s, 4 par-5s
 */
function generateHoles(par: number, centerLat: number, centerLng: number): GolfHole[] {
  // Determine hole par distribution
  const extra = par - 72; // adjust from baseline
  let par3s = 4, par4s = 10, par5s = 4;
  if (extra > 0) par5s = Math.min(6, par5s + extra);
  else if (extra < 0) par3s = Math.min(6, par3s + Math.abs(extra));
  par4s = 18 - par3s - par5s;

  // Build a shuffled par sequence
  const pars: number[] = [
    ...Array(par3s).fill(3),
    ...Array(par4s).fill(4),
    ...Array(par5s).fill(5),
  ];
  // Deterministic shuffle (Fisher-Yates with fixed seed)
  for (let i = pars.length - 1; i > 0; i--) {
    const j = (i * 31 + 7) % (i + 1);
    [pars[i], pars[j]] = [pars[j], pars[i]];
  }

  // Handicaps 1-18 in a semi-random order
  const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);

  // Lay out holes roughly in a circle around the course center
  // Each hole is ~100-200 yards apart on the scorecard
  const holes: GolfHole[] = [];
  const angleStep = (2 * Math.PI) / 18;
  const METERS_PER_DEG_LAT = 111320;
  const METERS_PER_DEG_LNG = 111320 * Math.cos((centerLat * Math.PI) / 180);

  for (let i = 0; i < 18; i++) {
    const p = pars[i];
    const angle = angleStep * i;
    const radius = 150 + i * 20; // meters from center, spread out
    const teeLat = centerLat + (Math.sin(angle) * radius) / METERS_PER_DEG_LAT;
    const teeLng = centerLng + (Math.cos(angle) * radius) / METERS_PER_DEG_LNG;

    let blackYards: number;
    if (p === 3) blackYards = pickYards(PAR3_YARDS, i * 3 + 1);
    else if (p === 5) blackYards = pickYards(PAR5_YARDS, i * 2 + 3);
    else blackYards = pickYards(PAR4_YARDS, i * 5 + 7);

    // Pin is roughly "blackYards" in the same angular direction
    const holeDistM = blackYards * 0.9144;
    const pinLat = teeLat + (Math.sin(angle + 0.3) * holeDistM) / METERS_PER_DEG_LAT;
    const pinLng = teeLng + (Math.cos(angle + 0.3) * holeDistM) / METERS_PER_DEG_LNG;

    holes.push({
      number: i + 1,
      par: p,
      handicap: handicaps[i],
      yards: {
        black: blackYards,
        blue: Math.round(blackYards * 0.96),
        white: Math.round(blackYards * 0.91),
        red: Math.round(blackYards * 0.82),
      },
      tee: { lat: teeLat, lng: teeLng },
      pin: { lat: pinLat, lng: pinLng },
    });
  }

  return holes;
}

// ── OSM element → GolfCourse ─────────────────────────────────────────────────

function elementToCourse(el: OverpassElement): GolfCourse | null {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!lat || !lng) return null;

  // Best-effort par from tags; default to 72
  const parRaw = parseInt(tags["golf:par"] ?? tags.par ?? "72", 10);
  const par = isNaN(parRaw) || parRaw < 54 || parRaw > 78 ? 72 : parRaw;

  // Location from tags
  const city = tags["addr:city"] ?? tags["is_in:city"] ?? tags["addr:town"] ?? "";
  const country =
    tags["addr:country"] ?? tags["is_in:country_code"] ?? tags["addr:state"] ?? "";
  const location = [city, country].filter(Boolean).join(", ") || "Golf Course";

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    location,
    par,
    holes: generateHoles(par, lat, lng),
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass error ${res.status}`);
    const json = (await res.json()) as OverpassResponse;
    return json.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search for golf courses near a GPS coordinate within radiusMeters.
 */
export async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters = 40000,
): Promise<GolfCourse[]> {
  const query = `
[out:json][timeout:15];
(
  way["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
  relation["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
);
out center tags;`;

  const elements = await runOverpassQuery(query);
  const courses = elements
    .map(elementToCourse)
    .filter((c): c is GolfCourse => c !== null)
    .slice(0, 20);
  cacheAll(courses);
  return courses;
}

/**
 * Full-text search for golf courses by name (global, limited to 25 results).
 */
export async function searchByName(nameQuery: string): Promise<GolfCourse[]> {
  if (nameQuery.trim().length < 3) return [];

  const escaped = nameQuery.replace(/[[\](){}|^$*+?.\\]/g, "\\$&");
  const query = `
[out:json][timeout:15];
(
  way["leisure"="golf_course"]["name"~"${escaped}",i];
  relation["leisure"="golf_course"]["name"~"${escaped}",i];
);
out center tags;`;

  const elements = await runOverpassQuery(query);
  const courses = elements
    .map(elementToCourse)
    .filter((c): c is GolfCourse => c !== null)
    .slice(0, 25);
  cacheAll(courses);
  return courses;
}
