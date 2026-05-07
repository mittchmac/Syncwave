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

export function yardsForPar(par: number, idx: number): number {
  if (par === 3) return pickYards(PAR3_YARDS, idx * 3 + 1);
  if (par === 5) return pickYards(PAR5_YARDS, idx * 2 + 3);
  return pickYards(PAR4_YARDS, idx * 5 + 7);
}

/**
 * Generate a plausible 18-hole layout for a course with a given total par.
 */
function generateHoles(par: number, centerLat: number, centerLng: number): GolfHole[] {
  const extra = par - 72;
  let par3s = 4, par4s = 10, par5s = 4;
  if (extra > 0) par5s = Math.min(6, par5s + extra);
  else if (extra < 0) par3s = Math.min(6, par3s + Math.abs(extra));
  par4s = 18 - par3s - par5s;

  const pars: number[] = [
    ...Array(par3s).fill(3),
    ...Array(par4s).fill(4),
    ...Array(par5s).fill(5),
  ];
  for (let i = pars.length - 1; i > 0; i--) {
    const j = (i * 31 + 7) % (i + 1);
    [pars[i], pars[j]] = [pars[j], pars[i]];
  }

  const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
  const holes: GolfHole[] = [];
  const angleStep = (2 * Math.PI) / 18;
  const METERS_PER_DEG_LAT = 111320;
  const METERS_PER_DEG_LNG = 111320 * Math.cos((centerLat * Math.PI) / 180);

  for (let i = 0; i < 18; i++) {
    const p = pars[i];
    const angle = angleStep * i;
    const radius = 150 + i * 20;
    const teeLat = centerLat + (Math.sin(angle) * radius) / METERS_PER_DEG_LAT;
    const teeLng = centerLng + (Math.cos(angle) * radius) / METERS_PER_DEG_LNG;
    const blackYards = yardsForPar(p, i);
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

  const parRaw = parseInt(tags["golf:par"] ?? tags.par ?? "72", 10);
  const par = isNaN(parRaw) || parRaw < 54 || parRaw > 78 ? 72 : parRaw;

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
  const timer = setTimeout(() => controller.abort(), 18_000);
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
 * Search for golf courses near a GPS coordinate.
 * Radius is 80km by default — returns all matching courses with no cap.
 */
export async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters = 80000,
): Promise<GolfCourse[]> {
  const query = `
[out:json][timeout:25];
(
  way["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
  relation["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
);
out center tags;`;

  const elements = await runOverpassQuery(query);
  const courses = elements
    .map(elementToCourse)
    .filter((c): c is GolfCourse => c !== null);
  cacheAll(courses);
  return courses;
}

/**
 * Full-text search for golf courses by name (global, no cap).
 * Minimum 2 characters required.
 */
export async function searchByName(nameQuery: string): Promise<GolfCourse[]> {
  if (nameQuery.trim().length < 2) return [];

  const escaped = nameQuery.replace(/[[\](){}|^$*+?.\\]/g, "\\$&");
  const query = `
[out:json][timeout:20];
(
  way["leisure"="golf_course"]["name"~"${escaped}",i];
  relation["leisure"="golf_course"]["name"~"${escaped}",i];
);
out center tags;`;

  const elements = await runOverpassQuery(query);
  const courses = elements
    .map(elementToCourse)
    .filter((c): c is GolfCourse => c !== null);
  cacheAll(courses);
  return courses;
}

/**
 * Enrich a course's generated holes with real OSM hole GPS data.
 * OSM mappers tag individual holes with golf=hole, ref=N, par=N.
 * Returns the original generated holes if OSM doesn't have enough data.
 */
export async function enrichWithOSMHoles(
  courseCenter: { lat: number; lng: number },
  existingHoles: GolfHole[],
): Promise<{ holes: GolfHole[]; enriched: boolean }> {
  const query = `
[out:json][timeout:20];
(
  way["golf"="hole"](around:2500,${courseCenter.lat},${courseCenter.lng});
  relation["golf"="hole"](around:2500,${courseCenter.lat},${courseCenter.lng});
  node["golf"="tee"](around:2500,${courseCenter.lat},${courseCenter.lng});
);
out center tags;`;

  try {
    const elements = await runOverpassQuery(query);

    const teeNodes = elements.filter(
      (el) => el.type === "node" && el.tags?.golf === "tee",
    );
    const holeElements = elements.filter((el) => el.tags?.golf === "hole");

    if (holeElements.length < 6) return { holes: existingHoles, enriched: false };

    const osmHoles: GolfHole[] = [];

    for (const el of holeElements) {
      const tags = el.tags ?? {};
      const ref = parseInt(tags.ref ?? "", 10);
      if (isNaN(ref) || ref < 1 || ref > 18) continue;

      const pinCenter =
        el.center ??
        (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
      if (!pinCenter) continue;

      const teeNode = teeNodes.find((n) => {
        const tRef = parseInt(n.tags?.ref ?? "", 10);
        return tRef === ref && n.lat != null && n.lon != null;
      });

      const pinLat = pinCenter.lat;
      const pinLng = pinCenter.lon;
      const teeLat = teeNode?.lat ?? pinLat + 0.0003;
      const teeLng = teeNode?.lon ?? pinLng;

      const par = parseInt(tags.par ?? "4", 10);
      const handicap = parseInt(
        tags.handicap ?? tags["golf:handicap"] ?? String(ref),
        10,
      );

      const existing = existingHoles.find((h) => h.number === ref);
      const blackYards =
        existing?.yards.black ?? yardsForPar(isNaN(par) ? 4 : par, ref - 1);

      osmHoles.push({
        number: ref,
        par: isNaN(par) ? 4 : par,
        handicap: isNaN(handicap) ? ref : handicap,
        yards: existing?.yards ?? {
          black: blackYards,
          blue: Math.round(blackYards * 0.96),
          white: Math.round(blackYards * 0.91),
          red: Math.round(blackYards * 0.82),
        },
        tee: { lat: teeLat, lng: teeLng },
        pin: { lat: pinLat, lng: pinLng },
      });
    }

    if (osmHoles.length < 6) return { holes: existingHoles, enriched: false };

    osmHoles.sort((a, b) => a.number - b.number);

    // Merge: OSM holes take priority, fill gaps with generated
    const result: GolfHole[] = [];
    const maxHole = Math.max(18, existingHoles.length);
    for (let i = 1; i <= maxHole; i++) {
      const osm = osmHoles.find((h) => h.number === i);
      if (osm) {
        result.push(osm);
      } else {
        const gen = existingHoles.find((h) => h.number === i);
        if (gen) result.push(gen);
      }
    }

    if (result.length < 6) return { holes: existingHoles, enriched: false };

    return { holes: result, enriched: true };
  } catch {
    return { holes: existingHoles, enriched: false };
  }
}
