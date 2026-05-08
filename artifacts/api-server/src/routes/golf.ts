import { Router, type IRouter } from "express";
import https from "node:https";
import { URL } from "node:url";

const router: IRouter = Router();

// ── HTTP/1.1 GET helper ───────────────────────────────────────────────────────

function httpsGet(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "SyncWave/1.0 (golf course search; https://syncwave.app)",
          "Accept": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) { resolve(null); return; }
          const ct = res.headers["content-type"] ?? "";
          if (!ct.includes("json")) { resolve(null); return; }
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      },
    );
    const timer = setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs);
    req.on("error", () => { clearTimeout(timer); resolve(null); });
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

// ── Nominatim (primary source) ────────────────────────────────────────────────

interface NominatimPlace {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

function placeToElement(r: NominatimPlace): unknown {
  const name = r.address?.["golf_course"]
    ?? r.address?.["leisure"]
    ?? r.display_name.split(",")[0].trim();
  const city = r.address?.["city"]
    ?? r.address?.["town"]
    ?? r.address?.["village"]
    ?? r.address?.["municipality"]
    ?? "";
  const state = r.address?.["state"] ?? r.address?.["country"] ?? "";
  return {
    type: r.osm_type,
    id: r.osm_id,
    center: { lat: parseFloat(r.lat), lon: parseFloat(r.lon) },
    tags: {
      name,
      leisure: "golf_course",
      "addr:city": city,
      "addr:state": state,
      ...(r.extratags?.["golf:par"] ? { "golf:par": r.extratags["golf:par"] } : {}),
    },
  };
}

async function nominatimSearch(q: string): Promise<unknown[] | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " golf course")}&format=jsonv2&limit=25&addressdetails=1&extratags=1`;
  const results = await httpsGet(url, 8_000);
  if (!Array.isArray(results)) return null;
  const places = results as NominatimPlace[];
  // Only return results Nominatim classifies as actual golf courses
  return places.filter(r => r.type === "golf_course").map(placeToElement);
}

async function nominatimNearby(lat: number, lng: number, radiusDeg: number): Promise<unknown[] | null> {
  const viewbox = `${lng - radiusDeg},${lat + radiusDeg},${lng + radiusDeg},${lat - radiusDeg}`;
  const url = `https://nominatim.openstreetmap.org/search?q=golf+course&format=jsonv2&limit=50&addressdetails=1&extratags=1&viewbox=${viewbox}&bounded=1`;
  const results = await httpsGet(url, 8_000);
  if (!Array.isArray(results)) return null;
  const places = results as NominatimPlace[];
  return places.filter(r => r.type === "golf_course").map(placeToElement);
}

// ── Overpass (fallback) ───────────────────────────────────────────────────────

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

function overpassPost(mirrorUrl: string, query: string, timeoutMs: number): Promise<{ elements?: unknown[] } | null> {
  return new Promise((resolve) => {
    const body = `data=${encodeURIComponent(query)}`;
    const parsed = new URL(mirrorUrl);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "SyncWave/1.0 (golf course search; https://syncwave.app)",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) { resolve(null); return; }
          const ct = res.headers["content-type"] ?? "";
          if (!ct.includes("json")) { resolve(null); return; }
          try {
            const json = JSON.parse(data) as { elements?: unknown[]; remark?: string };
            if (json.remark?.includes("timed out")) { resolve(null); return; }
            resolve(json);
          } catch { resolve(null); }
        });
      },
    );
    const timer = setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs);
    req.on("error", () => { clearTimeout(timer); resolve(null); });
    req.on("close", () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

async function runOverpassQuery(query: string): Promise<{ elements?: unknown[] } | null> {
  for (const mirror of OVERPASS_MIRRORS) {
    const result = await overpassPost(mirror, query, 6_000);
    if (result !== null) return result;
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/golf/nearby?lat=xx&lng=xx
router.get("/golf/nearby", async (req, res) => {
  const lat = parseFloat(req.query["lat"] as string);
  const lng = parseFloat(req.query["lng"] as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  // Try Nominatim first (25km radius ≈ 0.225 degrees, then 50km)
  for (const radiusDeg of [0.225, 0.45]) {
    const elements = await nominatimNearby(lat, lng, radiusDeg);
    if (elements !== null) {
      if (elements.length > 0 || radiusDeg === 0.45) {
        res.json({ elements });
        return;
      }
    }
  }

  // Fallback: Overpass
  const makeQuery = (r: number) => `
[out:json][timeout:12];
(
  way["leisure"="golf_course"]["name"](around:${r},${lat},${lng});
  relation["leisure"="golf_course"]["name"](around:${r},${lat},${lng});
  node["leisure"="golf_course"]["name"](around:${r},${lat},${lng});
);
out center tags;`;

  for (const radius of [25_000, 50_000]) {
    const data = await runOverpassQuery(makeQuery(radius));
    if (data) {
      const elements = data.elements ?? [];
      if (elements.length > 0 || radius === 50_000) {
        res.json(data);
        return;
      }
    }
  }

  res.status(503).json({ error: "Golf course data unavailable" });
});

// GET /api/golf/search?q=xx
router.get("/golf/search", async (req, res) => {
  const q = ((req.query["q"] as string) ?? "").trim();

  if (q.length < 2) {
    res.status(400).json({ error: "q must be at least 2 characters" });
    return;
  }

  // Try Nominatim first
  const elements = await nominatimSearch(q);
  if (elements !== null) {
    res.json({ elements });
    return;
  }

  // Fallback: Overpass
  const escaped = q.replace(/[[\](){}|^$*+?.\\]/g, "\\$&");
  const query = `
[out:json][timeout:12];
(
  way["leisure"="golf_course"]["name"~"${escaped}",i];
  relation["leisure"="golf_course"]["name"~"${escaped}",i];
  node["leisure"="golf_course"]["name"~"${escaped}",i];
);
out center tags;`;

  const data = await runOverpassQuery(query);
  if (data) {
    res.json(data);
    return;
  }

  res.status(503).json({ error: "Golf course data unavailable" });
});

// GET /api/golf/holes?lat=xx&lng=xx
router.get("/golf/holes", async (req, res) => {
  const lat = parseFloat(req.query["lat"] as string);
  const lng = parseFloat(req.query["lng"] as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  const query = `
[out:json][timeout:12];
(
  way["golf"="hole"](around:2500,${lat},${lng});
  relation["golf"="hole"](around:2500,${lat},${lng});
  node["golf"="tee"](around:2500,${lat},${lng});
);
out center tags;`;

  const data = await runOverpassQuery(query);
  if (data) {
    res.json(data);
    return;
  }

  res.status(503).json({ error: "Golf course data unavailable" });
});

export default router;
