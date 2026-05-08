import { Router, type IRouter } from "express";
import https from "node:https";
import { URL } from "node:url";

const router: IRouter = Router();

const MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

/** HTTP/1.1 POST to Overpass using the native https module (avoids undici/H2 issues). */
function overpassPost(mirrorUrl: string, query: string, timeoutMs: number): Promise<{ elements?: unknown[]; remark?: string } | null> {
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
          // Overpass returns HTML when rate-limited — bail fast, don't try JSON.parse
          const ct = res.headers["content-type"] ?? "";
          if (!ct.includes("json")) { resolve(null); return; }
          try {
            const json = JSON.parse(data) as { elements?: unknown[]; remark?: string };
            if (json.remark?.includes("timed out")) { resolve(null); return; }
            resolve(json);
          } catch {
            resolve(null);
          }
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
  for (const mirror of MIRRORS) {
    const result = await overpassPost(mirror, query, 20_000);
    if (result !== null) return result;
  }
  return null;
}

// GET /api/golf/nearby?lat=xx&lng=xx
router.get("/golf/nearby", async (req, res) => {
  const lat = parseFloat(req.query["lat"] as string);
  const lng = parseFloat(req.query["lng"] as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  const makeQuery = (radiusMeters: number) => `
[out:json][timeout:12];
(
  way["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
  relation["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
  node["leisure"="golf_course"]["name"](around:${radiusMeters},${lat},${lng});
);
out center tags;`;

  for (const radius of [25_000, 50_000]) {
    const data = await runOverpassQuery(makeQuery(radius));
    if (data) {
      const elements = (data.elements ?? []) as unknown[];
      if (elements.length > 0 || radius === 50_000) {
        res.json(data);
        return;
      }
    }
  }

  res.status(502).json({ error: "Overpass unavailable" });
});

// GET /api/golf/search?q=xx
router.get("/golf/search", async (req, res) => {
  const q = (req.query["q"] as string ?? "").trim();

  if (q.length < 2) {
    res.status(400).json({ error: "q must be at least 2 characters" });
    return;
  }

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

  res.status(502).json({ error: "Overpass unavailable" });
});

// GET /api/golf/holes?lat=xx&lng=xx  (for course enrichment)
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

  res.status(502).json({ error: "Overpass unavailable" });
});

export default router;
